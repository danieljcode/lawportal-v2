// The small response and request helpers every API route shares (LP-141).

/** Every API answer is per request: nothing is cached. */
export const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/** True when the request says its body is JSON. */
export function isJson(req: Request): boolean {
  return (req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json");
}

/** A file system error's code ("ENOENT"…), for logs. */
export function errCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | null)?.code;
}
