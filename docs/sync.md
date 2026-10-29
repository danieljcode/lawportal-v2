# Sync, storage and recovery

How sync works end to end, how conflicts are merged, and how damaged saved data is kept rather than
lost. Sync is optional. On the hosted app (Vercel) the server copy lives in Upstash Redis; when the
app runs on your own computer, it lives in files on that computer.

## Sync codes

- **Turn on sync** (Characters dialog) calls `POST /api/account`, which makes a new code:
  `JSA-` plus five groups of four symbols from a 32-letter alphabet without the look-alikes `I`,
  `O`, `0` and `1` (100 bits of randomness; `src/lib/server/code.ts`).
- **The code is the only key.** There are no accounts or passwords: anyone with the code who can
  reach the server can read or change that data. The browser keeps it under `lawapp_sync_code` and
  only ever sends it in the `Authorization: Bearer <code>` header, never in a URL.
- **Use code** in another browser fetches that code's data and merges this browser's characters
  into it.
- **Stop syncing on this device** keeps the local copy. **Delete server copy** (`DELETE
/api/account`) removes the server copy; every device using that code stops syncing.

## Server storage

`src/lib/server/syncStore.ts`:

- **Hosted (Vercel).** When `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (or Vercel's
  `KV_REST_API_URL` and `KV_REST_API_TOKEN`) are set, records live in Upstash Redis instead
  (`src/lib/server/syncRedis.ts`): one hash per code at `lp:sync:<hash>`, each operation one Lua
  script, so no locks or temp files. Unused codes expire through a Redis TTL, and the sorted set
  `lp:sync:index` counts codes for the 1,000 cap. The API also needs `LAWAPP_ALLOW_LAN=1` there, or
  it only answers on `localhost`. `tests/sync-redis.test.ts` runs against a real database when
  those variables are set. The per-hash locks and atomic writes below are for the file store only.
- **One JSON file per code** in `data/sync/` (or `LAWAPP_SYNC_DIR`), named by the **SHA-256 hash of
  the code**. The raw code never reaches the file system or the logs (logs show the first 8 hex
  characters of the hash at most).
- **A record** is `{ rev, updated, data: { characters, cases, filings, conflictChecks, precedents, contacts } }`. Each character carries
  its J.A.P. inside it (`jap`); the firm's cases (LP-4) and the filing history (LP-15) sit beside
  the characters. A copy without `filings` (from before LP-15) leaves this browser's history alone. A copy saved before LP-4
  has no `cases` and each character's docket inside it (`dockets`): the client reads that as cases,
  the same way the local migration does.
- **Per-hash locks.** Every operation on a code runs after the previous one on the same hash has
  settled, so two requests can't interleave on one file.
- **Atomic writes.** A write goes to a temp file and is renamed over the real one, retried briefly
  while Windows (antivirus, indexing) holds the target.
- **Limits.** At most 1,000 sync codes (`POST` answers `503` after that), a 4 MB body, and 200
  characters, 2,000 cases, 500 filings, 500 conflict checks, 1,000 precedents and 2,000 contacts per `PUT`. The app
  keeps the newest 150 filings, so the history fits the list limit. Each filing carries its whole
  form, so the body cap was raised from 1 MB to 4 MB (LP-138): 150 filings of 20 KB each still
  fit. 4 MB stays under Vercel's 4.5 MB request body limit, and under Upstash's 10 MB request
  limit (Free and Pay-as-you-go), since a write goes to Redis in one request. A body over 4 MB
  gets `413` until data is removed.
- **Rate limits** (LP-8, `src/lib/server/rateLimit.ts`), answered with `429` and a `Retry-After`:
  - new codes: 5 an hour per IP, and 5 an hour across the whole server;
  - requests with a malformed or unknown code: 30 a minute per IP. Once over, that IP's sync
    requests are all refused until the minute is up, good code or not.

  Where the counts are kept depends on the store:
  - **File store (local and LAN):** in the server process's memory, so restarting the app clears
    them, and each process counts on its own.
  - **Redis (hosted):** the new-code counts are kept in Redis, per clock hour, in
    `lp:sync:created:<hour>` and `lp:sync:created:ip:<sha256 of the IP>:<hour>` (LP-137). The
    `CREATE` script checks and adds to them, so every Vercel instance shares one count, and no IP
    is stored in clear. A refused request is told to retry when the hour ends. The bad-code limit
    stays in each instance's memory.

  The IP comes from `X-Forwarded-For`, which a client can fake when the app runs on its own
  (Vercel sets it from the connection), so the per-IP limits only stop casual abuse; the overall
  cap is what stops anyone filling the 1,000 codes.

- **Unused codes expire.** A code that was made but never written to (still `rev` 0) is deleted
  after 7 days: by a Redis TTL on the hosted app, and in the file store by a check each time a new
  code is made. Turning sync on uploads straight away, so in
  practice this only removes codes nobody used.
- **Optimistic writes.** `PUT /api/data` sends the `rev` it last saw. If the stored `rev` is
  different, another device saved first: the server answers `409` with its copy instead of writing.

## The client

`src/lib/sync.ts`:

- The server copy is the master; this browser's storage is its cache of it.
- Every data change in the stores is **pushed 700 ms later** (`lawapp_sync_dirty` marks unsent
  edits). The latest copy is **pulled** on start-up and when the tab comes back into view, at most
  every 20 seconds unless forced (**Sync now**).
- Pushes are serialised: a push during another waits for it.
- Offline or server errors leave changes in this browser; they're sent next time.

### Conflicts (LP-64)

A conflict is a `409` on push, or a pull that finds a newer `rev` while this browser has unsent
edits. Instead of replacing local data, `resolve()` merges **one character at a time**:

- Each character has an `updatedAt`. Saving it, or changing its J.A.P., moves it. **The newer copy
  wins, with its J.A.P.**; the server wins a tie.
- **Cases merge the same way, one case at a time** (LP-4), by their own `updated`, with deletions
  and kept-aside versions handled as for characters (the base remembers them as `case:<id>`).
  Afterwards, cases with the same case number from two devices become one (`unifyCases`): the
  newer copy's fields win, gaps are filled from the other, and everyone working either stays on it.
- **Filings merge one at a time too** (LP-15), by when each was filed (`filing:<id>` in the base),
  and so does the conflict check log (LP-10, `conflict:<id>`). The Law Library's precedents (LP-16)
  are edited like cases, so each ruling's newer `updated` wins (`precedent:<id>`), and the same goes
  for the Rolodex's contacts (LP-30, `contact:<id>`). They all use `resolveList` in
  `sync.ts`. A copy without one of these lists leaves this browser's alone.
- **Deletions stand.** `lawapp_sync_base` remembers the last server copy this browser saw, so the
  merge can tell a character added on one side from one deleted on the other. A character deleted
  on one device but edited on the other since is kept.
- **Nothing is lost silently.** A local version of a character, case, precedent or contact that loses is kept
  under `lawapp_sync_lost`, and the sync panel shows **Restore my version** (or Dismiss). Restoring
  saves it with a fresh stamp, so it wins the next merge. Filings and conflict checks never change
  once made, so they never lose. An edit made while a push is in flight keeps `lawapp_sync_dirty`
  set, so it's still sent if the tab closes first (LP-132).
- The merged result is pushed straight away.
- "Newer" goes by each device's clock, so a badly wrong clock can pick the wrong winner.

### Old data (LP-71)

Characters saved before the app went FreestyleRP-only carried a `server` field. A pull that finds it
in the server copy pushes a clean copy back, so every device ends up clean.

## Full backup and restore (LP-1)

`src/lib/backup.ts`, offered in the Characters dialog. Unlike the characters **Export**, which holds
only characters with their dockets and J.A.P., a backup holds everything this browser has saved.
(Since LP-4 a characters export still lists each character's docket, read from the firm's cases;
importing it puts the character back on those cases.)

- **What's in it:** every `lawapp_` key, each value exactly as stored: characters, cases, J.A.P.,
  filing history, form drafts, settings (theme, Discord, collapsed sections, last form, What's new), set-aside damaged
  data and kept sync versions (`lawapp_sync_lost`).
- **What's left out:** the sync code, and this device's own sync bookkeeping (`lawapp_sync_rev`,
  `_dirty`, `_base`) and backup date (`lawapp_backup_last`), which mean nothing in another browser.
- **The file:** `lawapp-backup-YYYY-MM-DD.json`, `{ app, kind: "backup", version: 1, created,
appVersion, data }`. Listing the keys needs the KV wrapper's optional `keys()`.
- **Restore replaces everything.** After a preview of the counts before and after ("Characters: 3 now
  → 5 in the backup") and a confirmation, every backed-up key is written and any not in the backup is
  removed, so the browser ends up exactly as the backup was. It's all or nothing: if storage refuses
  a write, what was there is put back. The page then reloads so every store re-reads.
- **With sync on**, the restore marks the data as unsent (`lawapp_sync_dirty`), so it's pushed when
  the app starts; if another device saved since, the usual [merge](#conflicts-lp-64) applies.
- **Older characters-only exports** chosen in Restore backup are imported the usual way (merged by
  id) instead, including old ones with a `server` field.
- **Reminder:** with sync off and at least one character, the dialog warns when no backup has been
  made in this browser for 30 days, or ever.

## Damaged data

`readJson` in `src/lib/storage.ts` handles a saved value that isn't valid JSON (a half-finished
write, a crashed tab) (LP-65):

- The raw value is first **copied to `lawapp_corrupt_<key>_<ms>`**, keeping the last 3 copies per
  key (`lawapp_corrupt_index` lists them, since the KV wrapper can't list keys). Only then is the
  original removed, and the store reads it as empty.
- If even that copy can't be written (storage full), **the value is left where it is**, and a copy
  is held in memory for this page.
- The app shows **"Some saved data couldn't be read and was set aside."**, and **Download damaged
  data** in the Characters dialog saves every set-aside value, exactly as stored, to a JSON file to
  fix by hand.

## Security notes

- By default the server only answers on `localhost` (see [Architecture](architecture.md#server)).
- With the `:lan` scripts it's open to your network and traffic is plain http (no TLS). The rate
  limits above stop someone on the network filling sync storage or guessing codes freely, but
  anyone there can still see a code as it's sent. Only use `:lan` on a network you trust.
