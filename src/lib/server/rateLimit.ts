// In-memory rate limits for the sync API (LP-8).
//
// Mainly for LAN mode, where anyone on the network can reach the server. The
// counts live in this process, so a restart clears them. The client IP comes
// from X-Forwarded-For, which Next fills in from the socket only when the
// request doesn't send one, so a client can fake it: the per-IP limits stop
// casual abuse, and the overall cap on new codes is what keeps sync storage
// from filling up (with the 7-day cleanup in syncStore.ts).

/** Requests from one key within a sliding window. */
export class Limiter {
  private hits = new Map<string, number[]>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
  ) {}

  private recent(key: string, now: number): number[] {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  /** Seconds until `key` may try again, or 0 when it's under the limit. */
  retryAfter(key: string, now = Date.now()): number {
    const list = this.recent(key, now);
    if (list.length < this.limit) return 0;
    return Math.max(1, Math.ceil((list[0] + this.windowMs - now) / 1000));
  }

  record(key: string, now = Date.now()): void {
    const list = this.recent(key, now);
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > MAX_KEYS) this.sweep(now);
  }

  /** Drop expired keys; if faked IPs still leave too many, drop the oldest. */
  private sweep(now: number): void {
    for (const key of [...this.hits.keys()]) this.recent(key, now);
    for (const key of this.hits.keys()) {
      if (this.hits.size <= MAX_KEYS) break;
      this.hits.delete(key);
    }
  }

  clear(): void {
    this.hits.clear();
  }
}

/** Most keys a limiter tracks before it starts forgetting the oldest. */
const MAX_KEYS = 10_000;

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

/** New sync codes per IP: 5 an hour. */
export const createPerIp = new Limiter(5, HOUR);
/** New sync codes across the server: 5 an hour, so at most 840 a week, under MAX_FILES. */
export const createOverall = new Limiter(5, HOUR);
/** Requests with a malformed or unknown sync code per IP: 30 a minute. */
export const failedLookups = new Limiter(30, MINUTE);

const OVERALL = "*";

/** The first X-Forwarded-For address, or "unknown". */
export function clientIp(req: Request): string {
  const first = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  return first || "unknown";
}

function tooMany(error: string, seconds: number): Response {
  return Response.json(
    { error },
    { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(seconds) } },
  );
}

/** Counts a POST /api/account, or returns the 429 when this IP or the server has made too many codes. */
export function limitCreate(req: Request): Response | null {
  const ip = clientIp(req);
  const wait = Math.max(createPerIp.retryAfter(ip), createOverall.retryAfter(OVERALL));
  if (wait) return tooMany("Too many new sync codes. Try again later.", wait);
  createPerIp.record(ip);
  createOverall.record(OVERALL);
  return null;
}

/** The 429 when this IP has sent too many bad sync codes, checked before the code is looked up. */
export function limitLookup(req: Request): Response | null {
  const wait = failedLookups.retryAfter(clientIp(req));
  return wait ? tooMany("Too many attempts with an unknown sync code. Try again in a minute.", wait) : null;
}

/** Counts a malformed or unknown sync code against this IP. */
export function lookupFailed(req: Request): void {
  failedLookups.record(clientIp(req));
}

/** For tests. */
export function resetLimits(): void {
  createPerIp.clear();
  createOverall.clear();
  failedLookups.clear();
}
