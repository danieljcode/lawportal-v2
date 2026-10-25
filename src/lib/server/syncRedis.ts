// Upstash Redis sync store, used instead of files when the REST env vars are set
// (hosted deploys such as Vercel, whose file system doesn't keep writes).
//
// One hash per code at lp:sync:<sha256 of code> with fields rev, updated and
// data (the JSON of SyncRecord.data). Each operation is one Lua script, so it
// runs atomically on the server and no in-process lock is needed. A code that
// was never written expires after UNUSED_TTL_MS; the sorted set lp:sync:index
// counts live codes for MAX_FILES, scored by expiry time (+inf once written).
import type { SyncRecord, WriteResult } from "./syncStore";

const PREFIX = "lp:sync:";
const INDEX = PREFIX + "index";

/** Vercel's Upstash integration sets KV_REST_API_*; a direct Upstash database gives UPSTASH_REDIS_REST_*. */
function config(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

export const redisConfigured = (): boolean => config() !== null;

async function command(args: (string | number)[]): Promise<unknown> {
  const { url, token } = config()!;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args.map(String)),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string };
  // The error text never holds the code: scripts only see its hash.
  if (!res.ok || body.error)
    throw Object.assign(new Error(body.error ?? `Redis HTTP ${res.status}`), { code: "EREDIS" });
  return body.result;
}

const evalScript = (script: string, keys: string[], args: (string | number)[]) =>
  command(["EVAL", script, keys.length, ...keys, ...args]);

const CREATE = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 'full' end
if redis.call('EXISTS', KEYS[2]) == 1 then return 'taken' end
redis.call('HSET', KEYS[2], 'rev', 0, 'updated', ARGV[4], 'data', ARGV[5])
redis.call('PEXPIRE', KEYS[2], ARGV[3])
redis.call('ZADD', KEYS[1], ARGV[6], ARGV[7])
return 'ok'`;

/** "ok", "taken" (hash already in use) or "full". */
export async function redisCreate(
  hash: string,
  record: SyncRecord,
  maxCodes: number,
  ttlMs: number,
  now = Date.now(),
): Promise<"ok" | "taken" | "full"> {
  const args = [now, maxCodes, ttlMs, record.updated, JSON.stringify(record.data), now + ttlMs, hash];
  return (await evalScript(CREATE, [INDEX, PREFIX + hash], args)) as "ok" | "taken" | "full";
}

export async function redisRead(hash: string): Promise<SyncRecord | null> {
  const [rev, updated, data] = (await command(["HMGET", PREFIX + hash, "rev", "updated", "data"])) as (string | null)[];
  if (rev === null) return null;
  return { rev: Number(rev), updated: updated ?? "", data: JSON.parse(data ?? "{}") as SyncRecord["data"] };
}

const WRITE = `
local cur = redis.call('HMGET', KEYS[1], 'rev', 'updated', 'data')
if not cur[1] then return {'missing'} end
if tonumber(cur[1]) ~= tonumber(ARGV[1]) then return {'conflict', cur[1], cur[2], cur[3]} end
local rev = tonumber(cur[1]) + 1
redis.call('HSET', KEYS[1], 'rev', rev, 'updated', ARGV[2], 'data', ARGV[3])
redis.call('PERSIST', KEYS[1])
redis.call('ZADD', KEYS[2], '+inf', ARGV[4])
return {'ok', tostring(rev)}`;

export async function redisWrite(
  hash: string,
  expectedRev: number,
  data: SyncRecord["data"],
  updated = new Date().toISOString(),
): Promise<WriteResult> {
  const out = (await evalScript(
    WRITE,
    [PREFIX + hash, INDEX],
    [expectedRev, updated, JSON.stringify(data), hash],
  )) as string[];
  if (out[0] === "missing") return "missing";
  if (out[0] === "conflict") return { conflict: { rev: Number(out[1]), updated: out[2], data: JSON.parse(out[3]) } };
  return { record: { rev: Number(out[1]), updated, data } };
}

const REMOVE = `
local n = redis.call('DEL', KEYS[1])
redis.call('ZREM', KEYS[2], ARGV[1])
return n`;

export async function redisRemove(hash: string): Promise<"ok" | "missing"> {
  return (await evalScript(REMOVE, [PREFIX + hash, INDEX], [hash])) === 1 ? "ok" : "missing";
}
