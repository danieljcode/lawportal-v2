// GET /api/data: the server copy. PUT /api/data: replace it (optimistic, by rev).
// Design §Sync server route table; checks run in the table's order after the host check (D7).
import { checkSync } from "@/lib/server/guard";
import { parseBearer } from "@/lib/server/code";
import { readCapped } from "@/lib/server/body";
import { limitLookup, lookupFailed } from "@/lib/server/rateLimit";
import { codeHash, read, write, type SyncRecord } from "@/lib/server/syncStore";
import { errCode, isJson, json } from "@/lib/server/http";
import { MAX_CASES } from "@/lib/cases";
import { MAX_CHARACTERS } from "@/lib/characters";
import { MAX_PRECEDENTS } from "@/lib/precedents";
import { isObject } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Under Vercel's 4.5 MB request body limit and Upstash's 10 MB request limit (LP-138).
const MAX_BODY = 4_000_000;

/** Each synced list and how many items it may hold. Only `characters` is required. */
const LISTS = {
  characters: MAX_CHARACTERS,
  cases: MAX_CASES,
  // Above the client's caps (150 filings, 300 checks), so a copy from a device that kept more still syncs.
  filings: 500,
  conflictChecks: 500,
  precedents: MAX_PRECEDENTS,
};

/** `{rev, data:{characters, …}}`: an integer rev ≥ 0 and each list (LISTS) an array of at most its limit of objects, else null. */
function parseDoc(body: unknown): { rev: number; data: SyncRecord["data"] } | null {
  if (!isObject(body)) return null;
  const { rev, data } = body;
  if (typeof rev !== "number" || !Number.isInteger(rev) || rev < 0) return null;
  if (!isObject(data) || !Array.isArray(data.characters)) return null;
  for (const [key, max] of Object.entries(LISTS)) {
    const list = data[key];
    if (list === undefined) continue;
    if (!Array.isArray(list) || list.length > max || !list.every(isObject)) return null;
  }
  return { rev, data: data as SyncRecord["data"] };
}

export async function GET(req: Request): Promise<Response> {
  const refused = checkSync(req);
  if (refused) return refused;
  const limited = limitLookup(req);
  if (limited) return limited;
  const code = parseBearer(req);
  if (!code) {
    lookupFailed(req);
    return json({ error: "Missing or invalid sync code." }, 401);
  }
  try {
    const record = await read(code);
    if (!record) {
      lookupFailed(req);
      return json({ error: "Unknown sync code." }, 404);
    }
    return json({ rev: record.rev, data: record.data, updated: record.updated }, 200);
  } catch (err) {
    console.error("[sync] read failed for", codeHash(code).slice(0, 8), errCode(err));
    return json({ error: "Couldn't read sync data." }, 500);
  }
}

export async function PUT(req: Request): Promise<Response> {
  const refused = checkSync(req);
  if (refused) return refused;
  const limited = limitLookup(req);
  if (limited) return limited;
  const code = parseBearer(req);
  if (!code) {
    lookupFailed(req);
    return json({ error: "Missing or invalid sync code." }, 401);
  }
  if (!isJson(req)) return json({ error: "Expected application/json." }, 415);
  const text = await readCapped(req, MAX_BODY);
  if (text === "too-large") return json({ error: "Sync data is too large (max 4 MB)." }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }
  const doc = parseDoc(body);
  if (!doc) return json({ error: "Invalid sync document." }, 400);
  try {
    const result = await write(code, doc.rev, doc.data);
    if (result === "missing") {
      lookupFailed(req);
      return json({ error: "Unknown sync code." }, 404);
    }
    if ("conflict" in result) {
      const c = result.conflict;
      return json({ rev: c.rev, data: c.data, updated: c.updated }, 409);
    }
    return json({ rev: result.record.rev, updated: result.record.updated }, 200);
  } catch (err) {
    console.error("[sync] write failed for", codeHash(code).slice(0, 8), errCode(err));
    return json({ error: "Couldn't save sync data." }, 500);
  }
}
