// Upstash Redis sync store against a real database. Skipped unless
// UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set; use a throwaway database.
import { describe, expect, it } from "vitest";
import { redisConfigured } from "@/lib/server/syncRedis";
import { create, read, remove, write } from "@/lib/server/syncStore";

describe.skipIf(!redisConfigured())("sync store on Upstash Redis", () => {
  it("creates, writes, conflicts and removes a code", async () => {
    const made = await create();
    if (made === "full") throw new Error("Redis sync index is full");
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
});
