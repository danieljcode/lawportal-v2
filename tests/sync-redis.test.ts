// Upstash Redis sync store against a real database. Skipped unless
// UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set; use a throwaway database.
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { redisConfigured, redisCreate, redisRemove } from "@/lib/server/syncRedis";
import { create, read, remove, write } from "@/lib/server/syncStore";

const HOUR = 60 * 60 * 1000;
const hex = () => randomBytes(32).toString("hex");
const record = { rev: 0, updated: new Date().toISOString(), data: { characters: [] } };
// A random far-off hour keeps a test's counts apart from real use and from other runs.
const someHour = () => (1e6 + Math.floor(Math.random() * 1e6)) * HOUR;

describe.skipIf(!redisConfigured())("sync store on Upstash Redis", () => {
  it("creates, writes, conflicts and removes a code", async () => {
    const made = await create("test-" + hex());
    if (made === "full" || "retryAfter" in made) throw new Error("couldn't create: " + JSON.stringify(made));
    const { code } = made;

    expect(await read(code)).toMatchObject({ rev: 0, data: { characters: [] } });

    const data = { characters: [{ name: "A" }], cases: [] };
    const saved = await write(code, 0, data);
    expect(saved).toMatchObject({ record: { rev: 1, data } });

    const stale = await write(code, 0, { characters: [] });
    expect(stale).toMatchObject({ conflict: { rev: 1, data } });
    expect(await read(code)).toMatchObject({ rev: 1, data });

    expect(await remove(code)).toBe("ok");
    expect(await read(code)).toBeNull();
    expect(await remove(code)).toBe("missing");
    expect(await write(code, 1, data)).toBe("missing");
  });

  // Each call is its own request, as from separate instances: only Redis holds the counts.
  it("the 6th new code in an hour across the server is refused; the next hour starts afresh", async () => {
    const now = someHour();
    const limits = { overall: 5, perIp: 100 };
    const made: string[] = [];
    const make = async (at: number) => {
      const hash = hex();
      const result = await redisCreate(hash, record, 1000, HOUR, hex(), limits, at);
      if (result === "ok") made.push(hash);
      return result;
    };
    for (let i = 0; i < 5; i++) expect(await make(now + i)).toBe("ok");
    expect(await make(now + 5)).toBe("limited");
    expect(await make(now + HOUR)).toBe("ok");
    for (const hash of made) await redisRemove(hash);
  });

  it("the 6th new code in an hour from one IP is refused; other IPs still can", async () => {
    const now = someHour();
    const limits = { overall: 100, perIp: 5 };
    const ip = hex();
    const made: string[] = [];
    const make = async (from: string) => {
      const hash = hex();
      const result = await redisCreate(hash, record, 1000, HOUR, from, limits, now);
      if (result === "ok") made.push(hash);
      return result;
    };
    for (let i = 0; i < 5; i++) expect(await make(ip)).toBe("ok");
    expect(await make(ip)).toBe("limited");
    expect(await make(hex())).toBe("ok");
    for (const hash of made) await redisRemove(hash);
  });
});
