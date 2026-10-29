// POST /api/account on Redis: the hourly limits come from Redis, not this process (LP-137).
// syncRedis is mocked; tests/sync-redis.test.ts checks the counting against a real database.
import { beforeEach, describe, expect, it, vi } from "vitest";

const redisCreate = vi.fn();
vi.mock("@/lib/server/syncRedis", () => ({
  redisConfigured: () => true,
  redisCreate: (...args: unknown[]) => redisCreate(...args),
  secondsToNextHour: () => 1234,
}));

const { POST } = await import("@/app/api/account/route");
const { createOverall, resetLimits } = await import("@/lib/server/rateLimit");

const req = (ip: string) =>
  new Request("http://localhost:3000/api/account", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: "{}",
  });

beforeEach(() => {
  resetLimits();
  redisCreate.mockReset();
});

describe("POST /api/account with Redis", () => {
  it("answers 429 with Retry-After when Redis says the hour's codes are used", async () => {
    redisCreate.mockResolvedValue("limited");
    const res = await POST(req("10.0.0.1"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1234");
  });

  it("passes a hash of the IP, never the IP itself", async () => {
    redisCreate.mockResolvedValue("ok");
    expect((await POST(req("10.0.0.2"))).status).toBe(201);
    const ipHash = redisCreate.mock.calls[0][4] as string;
    expect(ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(redisCreate.mock.calls[0])).not.toContain("10.0.0.2");
  });

  it("doesn't use this process's limits", async () => {
    redisCreate.mockResolvedValue("ok");
    for (let i = 0; i < 6; i++) expect((await POST(req("10.0.0.3"))).status).toBe(201);
    expect(createOverall.retryAfter("*")).toBe(0);
  });
});
