# Sync, storage and recovery

How sync works end to end, how conflicts are merged, and how damaged saved data is kept rather than
lost. Sync is optional and runs entirely on the computer that runs the app.

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
  /api/account`) removes the file; every device using that code stops syncing.

## Server storage

`src/lib/server/syncStore.ts`:

- **One JSON file per code** in `data/sync/` (or `LAWAPP_SYNC_DIR`), named by the **SHA-256 hash of
  the code**. The raw code never reaches the file system or the logs (logs show the first 8 hex
  characters of the hash at most).
- **A record** is `{ rev, updated, data: { characters } }`. Each character carries its dockets and
  J.A.P. inside it (`dockets`, `jap`), the same shape as a characters export.
- **Per-hash locks.** Every operation on a code runs after the previous one on the same hash has
  settled, so two requests can't interleave on one file.
- **Atomic writes.** A write goes to a temp file and is renamed over the real one, retried briefly
  while Windows (antivirus, indexing) holds the target.
- **Limits.** At most 1,000 sync files (`POST` answers `503` after that), a 1 MB body and 200
  characters per `PUT`.
- **Optimistic writes.** `PUT /api/data` sends the `rev` it last saw. If the stored `rev` is
  different, another device saved first: the server answers `409` with its copy instead of writing.

## The client

`src/lib/sync.ts`:

- The server copy is the master; local storage is this browser's cache of it.
- Every data change in the stores is **pushed 700 ms later** (`lawapp_sync_dirty` marks unsent
  edits). The latest copy is **pulled** on start-up and when the tab comes back into view, at most
  every 20 seconds unless forced (**Sync now**).
- Pushes are serialised: a push during another waits for it.
- Offline or server errors leave changes in this browser; they're sent next time.

### Conflicts (LP-64)

A conflict is a `409` on push, or a pull that finds a newer `rev` while this browser has unsent
edits. Instead of replacing local data, `resolve()` merges **one character at a time**:

- Each character has an `updatedAt`. Saving it, or changing one of its dockets or its J.A.P., moves
  it. **The newer copy wins, with its dockets and J.A.P.**; the server wins a tie.
- **Deletions stand.** `lawapp_sync_base` remembers the last server copy this browser saw, so the
  merge can tell a character added on one side from one deleted on the other. A character deleted
  on one device but edited on the other since is kept.
- **Nothing is lost silently.** A local version that loses is kept under `lawapp_sync_lost`, and the
  sync panel shows **Restore my version** (or Dismiss). Restoring saves it with a fresh `updatedAt`,
  so it wins the next merge.
- The merged result is pushed straight away.
- "Newer" goes by each device's clock, so a badly wrong clock can pick the wrong winner.

### Old data (LP-71)

Characters saved before the app went FreestyleRP-only carried a `server` field. A pull that finds it
in the server copy pushes a clean copy back, so every device ends up clean.

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
- With the `:lan` scripts it's open to your network, traffic is plain http (no TLS), and there's no
  rate limiting. Only use `:lan` on a network you trust.
