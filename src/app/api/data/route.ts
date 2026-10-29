// GET /api/data: the server copy. PUT /api/data: replace it (optimistic, by rev).
// Design §Sync server route table; checks run in the table's order after the host check (D7).
import { checkHost } from "@/lib/server/guard";
import { parseBearer } from "@/lib/server/code";
import { readCapped } from "@/lib/server/body";
import { limitLookup, lookupFailed } from "@/lib/server/rateLimit";
import { codeHash, read, write, type SyncRecord } from "@/lib/server/syncStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Under Vercel's 4.5 MB request body limit and Upstash's 10 MB request limit (LP-138).
const MAX_BODY = 4_000_000;
const MAX_CHARACTERS = 200;
const MAX_CASES = 2000;
const MAX_FILINGS = 500;
const MAX_CONFLICT_CHECKS = 500;
const MAX_PRECEDENTS = 1000;
const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function errCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | null)?.code;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** `{rev, data:{characters, cases?}}`: an integer rev ≥ 0, at most 200 character objects and 2,000 case objects (LP-4), else null. */
function parseDoc(body: unknown): { rev: number; data: SyncRecord["data"] } | null {
  if (!isObject(body)) return null;
  const { rev, data } = body;
  if (typeof rev !== "number" || !Number.isInteger(rev) || rev < 0) return null;
  if (!isObject(data) || !Array.isArray(data.characters)) return null;
  if (data.characters.length > MAX_CHARACTERS || !data.characters.every(isObject)) return null;
  if (data.cases !== undefined && (!Array.isArray(data.cases) || data.cases.length > MAX_CASES || !data.cases.every(isObject)))
    return null;
  if (
    data.filings !== undefined &&
    (!Array.isArray(data.filings) || data.filings.length > MAX_FILINGS || !data.filings.every(isObject))
  )
    return null;
  const checks = data.conflictChecks;
  if (checks !== undefined && (!Array.isArray(checks) || checks.length > MAX_CONFLICT_CHECKS || !checks.every(isObject)))
    return null;
  const precedents = data.precedents;
  if (
    precedents !== undefined &&
    (!Array.isArray(precedents) || precedents.length > MAX_PRECEDENTS || !precedents.every(isObject))
  )
    return null;
  return { rev, data: data as SyncRecord["data"] };
}

export async function GET(req: Request): Promise<Response> {
  const refused = checkHost(req);
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
  const refused = checkHost(req);
  if (refused) return refused;
  const limited = limitLookup(req);
  if (limited) return limited;
  const code = parseBearer(req);
  if (!code) {
    lookupFailed(req);
    return json({ error: "Missing or invalid sync code." }, 401);
  }
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return json({ error: "Expected application/json." }, 415);
  }
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
