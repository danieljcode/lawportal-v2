// POST /api/account: create a sync code. DELETE /api/account: delete the server copy.
// Design §Sync server route table; the host check runs first (D7).
import { checkHost } from "@/lib/server/guard";
import { parseBearer } from "@/lib/server/code";
import { clientIp, limitCreate, limitLookup, lookupFailed, TOO_MANY_CODES, tooMany } from "@/lib/server/rateLimit";
import { redisConfigured } from "@/lib/server/syncRedis";
import { codeHash, create, remove } from "@/lib/server/syncStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function isJson(req: Request): boolean {
  return (req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json");
}

function errCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | null)?.code;
}

export async function POST(req: Request): Promise<Response> {
  const refused = checkHost(req);
  if (refused) return refused;
  if (!isJson(req)) return json({ error: "Expected application/json." }, 415);
  // Redis counts new codes itself, across every instance (LP-137).
  const limited = redisConfigured() ? null : limitCreate(req);
  if (limited) return limited;
  try {
    const result = await create(clientIp(req));
    if (result === "full") return json({ error: "Sync storage is full." }, 503);
    if ("retryAfter" in result) return tooMany(TOO_MANY_CODES, result.retryAfter);
    return json({ code: result.code }, 201);
  } catch (err) {
    console.error("[sync] create failed for", "(new)", errCode(err));
    return json({ error: "Couldn't create a sync code." }, 500);
  }
}

export async function DELETE(req: Request): Promise<Response> {
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
    if ((await remove(code)) === "missing") {
      lookupFailed(req);
      return json({ error: "Unknown sync code." }, 404);
    }
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch (err) {
    console.error("[sync] delete failed for", codeHash(code).slice(0, 8), errCode(err));
    return json({ error: "Couldn't delete sync data." }, 500);
  }
}
