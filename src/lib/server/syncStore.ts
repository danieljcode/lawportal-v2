// File-backed sync store (server only; design §Sync server).
//
// One JSON file per sync code under data/sync/ (or LAWAPP_SYNC_DIR), named by
// the sha256 hex digest of the code, so the filename is never derived from user
// text and the raw code never reaches the filesystem or the logs. Every file
// operation on a code runs under a per-hash promise lock, and writes go through
// a temp file plus an atomic rename (retried while Windows holds the target).
//
// When Upstash Redis is configured (syncRedis.ts), create/read/write/remove use
// it instead, for hosts without a lasting file system.
import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { generateCode } from "./code";
import { errCode } from "./http";
import { CODES_PER_HOUR } from "./rateLimit";
import { redisConfigured, redisCreate, redisRead, redisRemove, redisWrite, secondsToNextHour } from "./syncRedis";

export interface SyncRecord {
  rev: number;
  updated: string;
  /** The characters, the firm's cases (LP-4), filing history (LP-15) and conflict log (LP-10); the lists are absent in older copies. */
  data: {
    characters: unknown[];
    cases?: unknown[];
    filings?: unknown[];
    conflictChecks?: unknown[];
    precedents?: unknown[];
  };
}

export type WriteResult = { record: SyncRecord } | { conflict: SyncRecord } | "missing";

/** Most sync files the directory may hold before create() refuses. */
export const MAX_FILES = 1000;

/** Evaluated on every call so tests can point it elsewhere after imports have run. */
export function syncDir(): string {
  return process.env.LAWAPP_SYNC_DIR ?? path.join(process.cwd(), "data", "sync");
}

export function codeHash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function fileFor(code: string): string {
  return path.join(syncDir(), codeHash(code) + ".json");
}

const locks = new Map<string, Promise<unknown>>();

/** Run `fn` after every earlier operation on the same hash has settled. */
export function withLock<T>(hash: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(hash) ?? Promise.resolve();
  const run = prev.then(() => fn());
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  locks.set(hash, tail);
  void tail.then(() => {
    if (locks.get(hash) === tail) locks.delete(hash);
  });
  return run;
}

const RETRY_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);
const RETRY_DELAYS = [20, 40, 80, 160, 320];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Rename `tmp` over `file`, retrying while another process (antivirus, the
 * indexer) holds the target. On a final failure the temp file is removed.
 */
export async function renameRetry(tmp: string, file: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, file);
      return;
    } catch (err) {
      const code = errCode(err);
      if (attempt < RETRY_DELAYS.length && code && RETRY_CODES.has(code)) {
        await sleep(RETRY_DELAYS[attempt]);
        continue;
      }
      await fs.unlink(tmp).catch(() => undefined);
      throw err;
    }
  }
}

async function readFile(file: string): Promise<SyncRecord | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as SyncRecord;
  } catch (err) {
    if (errCode(err) === "ENOENT") return null;
    throw err;
  }
}

/** How long a code that was never written to keeps its file (LP-8). */
export const UNUSED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const HASH_FILE = /^[0-9a-f]{64}\.json$/;

/**
 * Delete files still at rev 0 (created, never written) that are older than
 * UNUSED_TTL_MS, so made-up codes can't hold the MAX_FILES cap forever.
 * Returns how many files are left. Unreadable files are kept and counted.
 */
export async function sweepUnused(now = Date.now()): Promise<number> {
  const dir = syncDir();
  // The sync folder is runtime data, set by LAWAPP_SYNC_DIR: nothing for the build to trace.
  const names = (await fs.readdir(/* turbopackIgnore: true */ dir)).filter((n) => n.endsWith(".json"));
  let left = names.length;
  for (const name of names) {
    if (!HASH_FILE.test(name)) continue;
    // Rebuilt from the hash so the bundler sees a *.json path, not any file in the project.
    const hash = name.slice(0, 64);
    const file = path.join(dir, hash + ".json");
    const gone = await withLock(hash, async () => {
      try {
        if (now - (await fs.stat(file)).mtimeMs < UNUSED_TTL_MS) return false;
        const record = await readFile(file);
        if (!record || record.rev !== 0) return false;
        await fs.unlink(file);
        return true;
      } catch {
        return false;
      }
    });
    if (gone) left--;
  }
  return left;
}

/**
 * A new sync code with an empty record, or "full" when the directory holds MAX_FILES records. On
 * Redis, `{ retryAfter }` (seconds) when the server or `ip` has made too many codes this hour; the
 * file store leaves that to the in-memory limits in rateLimit.ts.
 */
export async function create(ip = "unknown"): Promise<{ code: string } | "full" | { retryAfter: number }> {
  if (redisConfigured()) return createRedis(ip);
  const dir = syncDir();
  await fs.mkdir(dir, { recursive: true });
  const existing = await sweepUnused();
  if (existing >= MAX_FILES) return "full";
  const record: SyncRecord = { rev: 0, updated: new Date().toISOString(), data: { characters: [] } };
  for (let attempt = 1; ; attempt++) {
    const code = generateCode();
    const hash = codeHash(code);
    try {
      await withLock(hash, () => fs.writeFile(path.join(dir, hash + ".json"), JSON.stringify(record), { flag: "wx" }));
      return { code };
    } catch (err) {
      if (errCode(err) !== "EEXIST" || attempt >= 3) throw err;
    }
  }
}

async function createRedis(ip: string): Promise<{ code: string } | "full" | { retryAfter: number }> {
  const record: SyncRecord = { rev: 0, updated: new Date().toISOString(), data: { characters: [] } };
  // Hashed so no IP is stored in clear.
  const ipHash = createHash("sha256").update(ip).digest("hex");
  for (let attempt = 1; ; attempt++) {
    const code = generateCode();
    const result = await redisCreate(codeHash(code), record, MAX_FILES, UNUSED_TTL_MS, ipHash, {
      overall: CODES_PER_HOUR,
      perIp: CODES_PER_HOUR,
    });
    if (result === "limited") return { retryAfter: secondsToNextHour() };
    if (result === "full") return "full";
    if (result === "ok") return { code };
    if (attempt >= 3) throw Object.assign(new Error("Sync code collision"), { code: "EEXIST" });
  }
}

export function read(code: string): Promise<SyncRecord | null> {
  if (redisConfigured()) return redisRead(codeHash(code));
  return withLock(codeHash(code), () => readFile(fileFor(code)));
}

/** Optimistic write: only succeeds when the stored rev equals `expectedRev`. */
export function write(code: string, expectedRev: number, data: SyncRecord["data"]): Promise<WriteResult> {
  if (redisConfigured()) return redisWrite(codeHash(code), expectedRev, data);
  return withLock(codeHash(code), async () => {
    const file = fileFor(code);
    const current = await readFile(file);
    if (!current) return "missing";
    if (current.rev !== expectedRev) return { conflict: current };
    const record: SyncRecord = { rev: current.rev + 1, updated: new Date().toISOString(), data };
    const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
    try {
      await fs.writeFile(tmp, JSON.stringify(record));
    } catch (err) {
      await fs.unlink(tmp).catch(() => undefined);
      throw err;
    }
    await renameRetry(tmp, file);
    return { record };
  });
}

export function remove(code: string): Promise<"ok" | "missing"> {
  if (redisConfigured()) return redisRemove(codeHash(code));
  return withLock(codeHash(code), async () => {
    try {
      await fs.unlink(fileFor(code));
      return "ok" as const;
    } catch (err) {
      if (errCode(err) === "ENOENT") return "missing" as const;
      throw err;
    }
  });
}
