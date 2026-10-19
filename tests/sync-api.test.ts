// Sync API route handlers, called directly with Request objects (AC 15).
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DELETE, POST } from "@/app/api/account/route";
import { GET, PUT } from "@/app/api/data/route";
import { CODE_RE, generateCode, parseBearer } from "@/lib/server/code";
import { codeHash, fileFor, write } from "@/lib/server/syncStore";

const BASE = "http://localhost:3000/api";
const realDir = path.join(process.cwd(), "data", "sync");
const realDirExisted = existsSync(realDir);
const realDirBefore = realDirExisted ? readdirSync(realDir).sort() : [];
let dir = "";
const savedSyncDir = process.env.LAWAPP_SYNC_DIR;
const savedLan = process.env.LAWAPP_ALLOW_LAN;

beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "lawapp-sync-"));
  process.env.LAWAPP_SYNC_DIR = dir;
  delete process.env.LAWAPP_ALLOW_LAN;
});

afterEach(() => {
  if (savedLan === undefined) delete process.env.LAWAPP_ALLOW_LAN;
  else process.env.LAWAPP_ALLOW_LAN = savedLan;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  if (savedSyncDir === undefined) delete process.env.LAWAPP_SYNC_DIR;
  else process.env.LAWAPP_SYNC_DIR = savedSyncDir;
});

function auth(code: string): Record<string, string> {
  return { Authorization: "Bearer " + code };
}

async function newCode(): Promise<string> {
  const res = await POST(
    new Request(BASE + "/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
  );
  expect(res.status).toBe(201);
  const body = (await res.json()) as { code: string };
  return body.code;
}

function put(code: string, body: unknown, extra: Record<string, string> = {}): Request {
  return new Request(BASE + "/data", {
    method: "PUT",
    headers: { ...auth(code), "Content-Type": "application/json", ...extra },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const doc = (characters: unknown[] = [{ id: "abcd1234", name: "Jane Doe" }]) => ({ characters });

describe("sync codes", () => {
  it("generates codes in the accepted format", () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(CODE_RE);
    expect(generateCode()).not.toMatch(/[IO01]/);
  });

  it("parses only well-formed bearer codes", () => {
    const code = generateCode();
    const req = (h: string) => new Request(BASE, { headers: { Authorization: h } });
    expect(parseBearer(req("Bearer " + code))).toBe(code);
    expect(parseBearer(req("Bearer " + code.toLowerCase()))).toBe(code);
    expect(parseBearer(req("Bearer JSA-../../x"))).toBeNull();
    expect(parseBearer(req("Basic " + code))).toBeNull();
    expect(parseBearer(new Request(BASE))).toBeNull();
  });
});

describe("sync API (AC 15)", () => {
  it("POST creates a code and an empty record in the temp dir", async () => {
    const code = await newCode();
    expect(code).toMatch(CODE_RE);
    expect(readdirSync(dir)).toContain(codeHash(code) + ".json");
    expect(fileFor(code).startsWith(dir)).toBe(true);
    const res = await GET(new Request(BASE + "/data", { headers: auth(code) }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { rev: number; data: unknown; updated: string };
    expect(body.rev).toBe(0);
    expect(body.data).toEqual({ characters: [] });
    expect(typeof body.updated).toBe("string");
  });

  it("POST without Content-Type: application/json → 415", async () => {
    const res = await POST(new Request(BASE + "/account", { method: "POST", body: "{}" }));
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: "Expected application/json." });
  });

  it("malformed code → 401", async () => {
    const res = await GET(new Request(BASE + "/data", { headers: auth("not-a-code") }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Missing or invalid sync code." });
    expect((await GET(new Request(BASE + "/data"))).status).toBe(401);
  });

  it("unknown code → 404", async () => {
    const res = await GET(new Request(BASE + "/data", { headers: auth(generateCode()) }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Unknown sync code." });
    expect((await PUT(put(generateCode(), { rev: 0, data: doc() }))).status).toBe(404);
  });

  it("a code containing ../ → 401, with no file touched", async () => {
    const before = readdirSync(dir).sort();
    for (const bad of ["JSA-../../../etc/passwd", "../" + generateCode(), "JSA-AAAA-AAAA-AAAA-AAAA-../A"]) {
      expect((await GET(new Request(BASE + "/data", { headers: auth(bad) }))).status).toBe(401);
      expect((await PUT(put(bad, { rev: 0, data: doc() }))).status).toBe(401);
      expect((await DELETE(new Request(BASE + "/account", { method: "DELETE", headers: auth(bad) }))).status).toBe(401);
    }
    expect(readdirSync(dir).sort()).toEqual(before);
  });

  it("PUT with the current rev saves; a stale rev → 409 with the server doc", async () => {
    const code = await newCode();
    const ok = await PUT(put(code, { rev: 0, data: doc() }));
    expect(ok.status).toBe(200);
    const saved = (await ok.json()) as { rev: number; updated: string };
    expect(saved.rev).toBe(1);

    const stale = await PUT(put(code, { rev: 0, data: doc([]) }));
    expect(stale.status).toBe(409);
    const conflict = (await stale.json()) as { rev: number; data: unknown; updated: string };
    expect(conflict.rev).toBe(1);
    expect(conflict.data).toEqual(doc());
    expect(conflict.updated).toBe(saved.updated);
  });

  it("PUT validation: 415, invalid JSON, invalid document", async () => {
    const code = await newCode();
    const noType = new Request(BASE + "/data", { method: "PUT", headers: auth(code), body: "{}" });
    expect((await PUT(noType)).status).toBe(415);

    const badJson = await PUT(put(code, "{nope"));
    expect(badJson.status).toBe(400);
    expect(await badJson.json()).toEqual({ error: "Invalid JSON." });

    const tooMany = Array.from({ length: 201 }, (_, i) => ({ id: "c" + String(i).padStart(4, "0"), name: "N" }));
    for (const bad of [
      [],
      { rev: -1, data: doc() },
      { rev: 1.5, data: doc() },
      { rev: "0", data: doc() },
      { rev: 0 },
      { rev: 0, data: [] },
      { rev: 0, data: { characters: {} } },
      { rev: 0, data: { characters: [1] } },
      { rev: 0, data: { characters: tooMany } },
    ]) {
      const res = await PUT(put(code, bad));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid sync document." });
    }
    expect((await PUT(put(code, { rev: 0, data: { characters: tooMany.slice(0, 200) } }))).status).toBe(200);
  });

  it("body > 1 MiB → 413", async () => {
    const code = await newCode();
    const big = { rev: 0, data: { characters: [{ id: "abcd1234", name: "x".repeat(1_100_000) }] } };
    const res = await PUT(put(code, big));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Sync data is too large (max 1 MB)." });
  });

  it("a PUT whose body is a 1.5 MiB stream with no Content-Length → 413", async () => {
    const code = await newCode();
    const chunk = new Uint8Array(64 * 1024).fill(0x20);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 1.5 * 1024 * 1024) {
          controller.close();
          return;
        }
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const req = new Request(BASE + "/data", {
      method: "PUT",
      headers: { ...auth(code), "Content-Type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit);
    expect(req.headers.get("content-length")).toBeNull();
    expect((await PUT(req)).status).toBe(413);
  });

  it("DELETE → 204, then GET → 404 and DELETE → 404", async () => {
    const code = await newCode();
    const del = () => DELETE(new Request(BASE + "/account", { method: "DELETE", headers: auth(code) }));
    const res = await del();
    expect(res.status).toBe(204);
    expect(existsSync(fileFor(code))).toBe(false);
    expect((await GET(new Request(BASE + "/data", { headers: auth(code) }))).status).toBe(404);
    expect((await del()).status).toBe(404);
  });

  it("Host evil.example → 421 without LAWAPP_ALLOW_LAN, not 421 with it", async () => {
    const evil = () => new Request("http://evil.example:3000/api/data", { headers: auth(generateCode()) });
    delete process.env.LAWAPP_ALLOW_LAN;
    const refused = await GET(evil());
    expect(refused.status).toBe(421);
    expect(((await refused.json()) as { error: string }).error).toMatch(/only answers on localhost/);
    const post = await POST(
      new Request("http://evil.example:3000/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(post.status).toBe(421);

    process.env.LAWAPP_ALLOW_LAN = "1";
    expect((await GET(evil())).status).toBe(404);
  });

  it("allows 127.0.0.1 and [::1] hosts", async () => {
    for (const host of ["127.0.0.1:3000", "[::1]:3000", "LOCALHOST"]) {
      const res = await GET(new Request(`http://${host}/api/data`, { headers: auth(generateCode()) }));
      expect(res.status).toBe(404);
    }
  });

  it("20 concurrent writes on one rev: 1 succeeds, 19 conflict, no .tmp left", async () => {
    const code = await newCode();
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => write(code, 0, doc([{ id: "abcd1234", name: "W" + i }]))),
    );
    const ok = results.filter((r) => r !== "missing" && "record" in r);
    const conflicts = results.filter((r) => r !== "missing" && "conflict" in r);
    expect(ok).toHaveLength(1);
    expect(conflicts).toHaveLength(19);
    expect(readdirSync(dir).filter((n) => n.endsWith(".tmp"))).toEqual([]);
    const res = await GET(new Request(BASE + "/data", { headers: auth(code) }));
    expect(((await res.json()) as { rev: number }).rev).toBe(1);
  });

  it("did not create or change the real data/sync directory", () => {
    expect(existsSync(realDir)).toBe(realDirExisted);
    if (realDirExisted) expect(readdirSync(realDir).sort()).toEqual(realDirBefore);
  });
});
