// @vitest-environment jsdom
// Sync client (AC 26, plus the push/pull/apply behaviour of INV §e.4) with a stubbed fetch.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { characterStore } from "@/lib/characters";
import { docketStore } from "@/lib/dockets";
import { portfolioStore } from "@/lib/portfolio";
import { S_SYNC_APPLY_FAIL, S_SYNC_LOST } from "@/lib/strings";
import * as sync from "@/lib/sync";

const CODE = "JSA-ABCD-EFGH-JKLM-NPQR-STUV";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Reply = { status: number; body?: unknown } | Error;

/** Stub fetch with a queue of replies (the last one repeats); records every call. */
function stubFetch(...replies: Reply[]): Call[] {
  const calls: Call[] = [];
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({
        url,
        method: init.method || "GET",
        headers: init.headers as Record<string, string>,
        body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      });
      const reply = replies[Math.min(i++, replies.length - 1)];
      if (reply instanceof Error) throw reply;
      return { status: reply.status, json: async () => reply.body };
    }),
  );
  return calls;
}

function names(): string[] {
  return characterStore()
    .list()
    .map((c) => c.name);
}

function pushedNames(call: Call): string[] {
  return (call.body as { data: sync.SyncDoc }).data.characters.map((c) => String(c.name));
}

// Stamps older than anything saved during a test run.
const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-02-01T00:00:00.000Z";

/** Sync on at `rev`, these characters stored with their own stamps, and `base` as the last server copy seen. */
function seed(chars: Array<{ id: string; name: string; updatedAt: string }>, base: Record<string, string>, rev = 1): void {
  localStorage.setItem(sync.CODE_KEY, CODE);
  localStorage.setItem(sync.REV_KEY, String(rev));
  localStorage.setItem(sync.BASE_KEY, JSON.stringify(base));
  for (const c of chars) characterStore().save(c, { keepStamp: true });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  sync.__resetForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("sync.init (AC 26)", () => {
  it("returns the same promise twice and registers each listener and store subscription once", async () => {
    stubFetch({ status: 200, body: { rev: 0, data: { characters: [] }, updated: "2026-01-01T00:00:00.000Z" } });
    const docAdd = vi.spyOn(document, "addEventListener");
    const winAdd = vi.spyOn(window, "addEventListener");
    const subs = [
      vi.spyOn(characterStore(), "subscribe"),
      vi.spyOn(docketStore(), "subscribe"),
      vi.spyOn(portfolioStore(), "subscribe"),
    ];
    const active = vi.spyOn(characterStore(), "subscribeActive");

    const a = sync.init();
    const b = sync.init();
    expect(b).toBe(a);
    await a;
    expect(docAdd.mock.calls.filter(([type]) => type === "visibilitychange")).toHaveLength(1);
    expect(winAdd.mock.calls.filter(([type]) => type === "online")).toHaveLength(1);
    for (const s of subs) expect(s).toHaveBeenCalledTimes(1);
    expect(active).not.toHaveBeenCalled();
  });

  it("does nothing on the network when sync is off", async () => {
    const calls = stubFetch({ status: 500 });
    await sync.init();
    characterStore().save({ name: "Jane Doe" });
    expect(calls).toHaveLength(0);
    expect(localStorage.getItem(sync.DIRTY_KEY)).toBeNull();
    expect(sync.getState().status).toBe("off");
  });

  it("pulls once on init when a code is set, with the reference fetch options", async () => {
    localStorage.setItem(sync.CODE_KEY, CODE);
    localStorage.setItem(sync.REV_KEY, "3");
    const calls = stubFetch({ status: 200, body: { rev: 3, data: { characters: [] }, updated: "2026-01-01T00:00:00.000Z" } });
    const fetchMock = vi.mocked(fetch);
    const seen: string[] = [];
    sync.onChange((s) => seen.push(s.status));
    await sync.init();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "/api/data", method: "GET" });
    expect(calls[0].headers.Authorization).toBe("Bearer " + CODE);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
    expect(seen).toEqual(["loading", "synced"]);
  });
});

describe("change tracking", () => {
  beforeEach(() => {
    localStorage.setItem(sync.CODE_KEY, CODE);
    localStorage.setItem(sync.REV_KEY, "0");
  });

  it("setActive does not set lawapp_sync_dirty or schedule a push", async () => {
    vi.useFakeTimers();
    const calls = stubFetch({ status: 200, body: { rev: 0, data: { characters: [] }, updated: "u" } });
    await sync.init();
    const c = characterStore().save({ name: "Jane Doe" });
    await vi.advanceTimersByTimeAsync(1000);
    const before = calls.length;
    localStorage.removeItem(sync.DIRTY_KEY);

    characterStore().setActive(c.id);
    expect(localStorage.getItem(sync.DIRTY_KEY)).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(before);
  });

  it("a data change sets dirty and pending, then pushes once after 700 ms", async () => {
    vi.useFakeTimers();
    const calls = stubFetch(
      { status: 200, body: { rev: 0, data: { characters: [] }, updated: "u0" } },
      { status: 200, body: { rev: 1, updated: "u1" } },
    );
    await sync.init();
    expect(calls).toHaveLength(1);

    const c = characterStore().save({ name: "Jane Doe" });
    docketStore().save(c.id, { caseNumber: "90SCCR00001" });
    expect(localStorage.getItem(sync.DIRTY_KEY)).toBe("1");
    expect(sync.getState().status).toBe("pending");
    await vi.advanceTimersByTimeAsync(699);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ url: "/api/data", method: "PUT" });
    const body = calls[1].body as { rev: number; data: sync.SyncDoc };
    expect(body.rev).toBe(0);
    expect(body.data.characters).toHaveLength(1);
    expect(body.data.characters[0]).toMatchObject({ id: c.id, name: "Jane Doe" });
    expect((body.data.characters[0].dockets as Array<{ caseNumber: string }>)[0].caseNumber).toBe("90SCCR00001");

    await vi.advanceTimersByTimeAsync(0);
    expect(localStorage.getItem(sync.DIRTY_KEY)).toBeNull();
    expect(localStorage.getItem(sync.REV_KEY)).toBe("1");
    expect(sync.getState()).toMatchObject({ status: "synced", updated: "u1" });
  });

  it("serialises pushes", async () => {
    let release: () => void = () => undefined;
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(init.method || "GET");
        if (calls.length === 1) await new Promise<void>((r) => (release = r));
        return { status: 200, json: async () => ({ rev: calls.length, updated: "u" }) };
      }),
    );
    const first = sync.push();
    const second = sync.push();
    await Promise.resolve();
    expect(calls).toEqual(["PUT"]);
    release();
    await Promise.all([first, second]);
    expect(calls).toEqual(["PUT", "PUT"]);
  });

  it("a 409 merges the server copy, keeps a character added here, and sends the merge", async () => {
    characterStore().save({ id: "local001", name: "Local Person" });
    const calls = stubFetch(
      {
        status: 409,
        body: {
          rev: 5,
          updated: "u5",
          data: {
            characters: [
              { id: "srv00002", name: "Second", dockets: [{ caseNumber: "90SCCC00002" }] },
              { id: "srv00001", name: "First", jap: { I: {}, II: {} } },
            ],
          },
        },
      },
      { status: 200, body: { rev: 6, updated: "u6" } },
    );
    const before = sync.getState().applied;
    await sync.push();
    expect(names()).toEqual(["Second", "First", "Local Person"]);
    expect(docketStore().list("srv00002")[0].caseNumber).toBe("90SCCC00002");
    expect(calls).toHaveLength(2);
    expect(calls[1].body).toMatchObject({ rev: 5 });
    expect(pushedNames(calls[1])).toEqual(["Second", "First", "Local Person"]);
    expect(localStorage.getItem(sync.REV_KEY)).toBe("6");
    expect(localStorage.getItem(sync.DIRTY_KEY)).toBeNull();
    expect(sync.getState()).toMatchObject({ status: "synced", updated: "u6", applied: before + 1, lost: 0 });
  });

  it("applying a server copy does not mark the data dirty", async () => {
    vi.useFakeTimers();
    const calls = stubFetch({
      status: 200,
      body: { rev: 2, updated: "u2", data: { characters: [{ id: "srv00001", name: "First" }] } },
    });
    await sync.init();
    expect(names()).toEqual(["First"]);
    expect(localStorage.getItem(sync.DIRTY_KEY)).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(1);
    expect(sync.getState()).toMatchObject({ status: "synced", message: "Updated from the server." });
  });

  it("reports S_SYNC_APPLY_FAIL when synced characters can't be stored", async () => {
    stubFetch({
      status: 200,
      body: { rev: 2, updated: "u2", data: { characters: [{ id: "srv00001", name: "First" }, { id: "srv00002" }] } },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await sync.pull(true);
    expect(names()).toEqual(["First"]);
    expect(sync.getState()).toMatchObject({ status: "error", message: S_SYNC_APPLY_FAIL(1) });
    expect(warn).toHaveBeenCalled();
  });

  it("pull is throttled to 20 s unless forced", async () => {
    const calls = stubFetch({ status: 200, body: { rev: 0, data: { characters: [] }, updated: "u" } });
    expect(await sync.pull(true)).toBe(true);
    expect(await sync.pull()).toBe(false);
    expect(calls).toHaveLength(1);
    expect(await sync.pull(true)).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("goes offline when the server can't be reached, and errors on an unknown code", async () => {
    stubFetch(new TypeError("Failed to fetch"));
    await sync.push();
    expect(sync.getState().status).toBe("offline");

    stubFetch({ status: 404, body: { error: "Unknown sync code." } });
    await sync.push();
    expect(sync.getState()).toMatchObject({ status: "error" });
    expect(sync.getState().message).toMatch(/doesn't recognise this sync code/);
  });
});

describe("synced data from before LP-70 (LP-71)", () => {
  it("stores a pulled copy without the old server field, and sends it back clean for the other devices", async () => {
    seed([], {}, 1);
    const calls = stubFetch(
      {
        status: 200,
        body: {
          rev: 2,
          updated: "u2",
          data: { characters: [{ id: "gtawchar1", name: "Gee Taw", title: "Attorney at Law", server: "gtaw", updatedAt: T0 }] },
        },
      },
      { status: 200, body: { rev: 3, updated: "u3" } },
    );
    await sync.pull(true);
    const [c] = characterStore().list();
    expect(c).toMatchObject({ name: "Gee Taw", title: "Attorney at Law", updatedAt: T0 });
    expect(c).not.toHaveProperty("server");
    expect(calls.map((x) => x.method)).toEqual(["GET", "PUT"]);
    const sent = (calls[1].body as { rev: number; data: sync.SyncDoc }).data.characters;
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ name: "Gee Taw", updatedAt: T0 });
    expect(sent[0]).not.toHaveProperty("server");
    expect(localStorage.getItem(sync.DIRTY_KEY)).toBeNull();
  });

  it("doesn't push when the server copy is already clean", async () => {
    seed([{ id: "char0001", name: "Clean", updatedAt: T0 }], { char0001: T0 }, 2);
    const calls = stubFetch({
      status: 200,
      body: { rev: 2, updated: "u2", data: { characters: [{ id: "char0001", name: "Clean", updatedAt: T0 }] } },
    });
    await sync.pull(true);
    expect(calls.map((x) => x.method)).toEqual(["GET"]);
  });
});

describe("conflicts keep unsent edits (LP-64)", () => {
  it("a docket or J.A.P. change stamps its character", () => {
    characterStore().save({ id: "char0001", name: "Jane Doe", updatedAt: T0 }, { keepStamp: true });
    docketStore().save("char0001", { caseNumber: "26CC00001" });
    const afterDocket = characterStore().get("char0001")?.updatedAt;
    expect(afterDocket! > T0).toBe(true);
    characterStore().save({ id: "char0001", name: "Jane Doe", updatedAt: T0 }, { keepStamp: true });
    portfolioStore().save("char0001", { level: "I" });
    expect(characterStore().get("char0001")?.updatedAt! > T0).toBe(true);
  });

  it("pull with unsent edits: a docket edit here survives another device's change to a different character", async () => {
    // The steps in LP-64: B edits a docket offline, A edits a character and syncs, B comes back.
    seed(
      [
        { id: "char0001", name: "Alice", updatedAt: T0 },
        { id: "char0002", name: "Bob", updatedAt: T0 },
      ],
      { char0001: T0, char0002: T0 },
    );
    docketStore().save("char0002", { caseNumber: "26CC00002", title: "Edited offline" });
    localStorage.setItem(sync.DIRTY_KEY, "1");
    const calls = stubFetch(
      {
        status: 200,
        body: {
          rev: 2,
          updated: "u2",
          data: {
            characters: [
              { id: "char0001", name: "Alice Renamed", updatedAt: T1 },
              { id: "char0002", name: "Bob", updatedAt: T0 },
            ],
          },
        },
      },
      { status: 200, body: { rev: 3, updated: "u3" } },
    );
    await sync.pull(true);
    expect(names()).toEqual(["Alice Renamed", "Bob"]);
    expect(docketStore().list("char0002").map((d) => d.caseNumber)).toEqual(["26CC00002"]);
    expect(calls.map((c) => c.method)).toEqual(["GET", "PUT"]);
    expect(calls[1].body).toMatchObject({ rev: 2 });
    const sent = (calls[1].body as { data: sync.SyncDoc }).data.characters;
    expect(sent.find((c) => c.id === "char0002")?.dockets).toMatchObject([{ caseNumber: "26CC00002" }]);
    expect(localStorage.getItem(sync.DIRTY_KEY)).toBeNull();
    expect(sync.getState()).toMatchObject({ status: "synced", lost: 0 });
    expect(localStorage.getItem(sync.LOST_KEY)).toBeNull();
  });

  it("push 409: the newer copy of each character wins and a losing local edit is kept aside", async () => {
    seed(
      [
        { id: "char0001", name: "Mine Newer", updatedAt: T1 },
        { id: "char0002", name: "Mine Older", updatedAt: T0 },
      ],
      { char0001: "2025-12-01T00:00:00.000Z", char0002: "2025-12-01T00:00:00.000Z" },
    );
    const calls = stubFetch(
      {
        status: 409,
        body: {
          rev: 4,
          updated: "u4",
          data: {
            characters: [
              { id: "char0001", name: "Theirs Older", updatedAt: T0 },
              { id: "char0002", name: "Theirs Newer", updatedAt: T1 },
            ],
          },
        },
      },
      { status: 200, body: { rev: 5, updated: "u5" } },
    );
    await sync.push();
    expect(names()).toEqual(["Mine Newer", "Theirs Newer"]);
    expect(pushedNames(calls[1])).toEqual(["Mine Newer", "Theirs Newer"]);
    const kept = JSON.parse(localStorage.getItem(sync.LOST_KEY) || "{}") as sync.SyncDoc;
    expect(kept.characters.map((c) => c.name)).toEqual(["Mine Older"]);
    expect(sync.getState().lost).toBe(1);
  });

  it("the message says when another device's version replaced an edit here", async () => {
    seed([{ id: "char0001", name: "Mine", updatedAt: T0 }], { char0001: "2025-12-01T00:00:00.000Z" });
    localStorage.setItem(sync.DIRTY_KEY, "1");
    stubFetch({
      status: 200,
      body: { rev: 2, updated: "u2", data: { characters: [{ id: "char0001", name: "Theirs", updatedAt: T1 }] } },
    });
    await sync.pull(true);
    expect(names()).toEqual(["Theirs"]);
    expect(sync.getState()).toMatchObject({ status: "conflict", message: S_SYNC_LOST(1), lost: 1 });
    expect(localStorage.getItem(sync.DIRTY_KEY)).toBeNull();
  });

  it("deletions on either side stand, unless the deleted character was edited since", async () => {
    seed(
      [
        { id: "char0001", name: "Both have it", updatedAt: T0 },
        { id: "char0003", name: "Deleted there", updatedAt: T0 },
        { id: "char0004", name: "Deleted there, edited here", updatedAt: T1 },
      ],
      { char0001: T0, char0002: T0, char0003: T0, char0004: T0, char0005: T0 },
    );
    localStorage.setItem(sync.DIRTY_KEY, "1");
    const calls = stubFetch(
      {
        status: 200,
        body: {
          rev: 2,
          updated: "u2",
          data: {
            characters: [
              { id: "char0001", name: "Both have it", updatedAt: T0 },
              { id: "char0002", name: "Deleted here", updatedAt: T0 },
              { id: "char0005", name: "Deleted here, edited there", updatedAt: T1 },
            ],
          },
        },
      },
      { status: 200, body: { rev: 3, updated: "u3" } },
    );
    await sync.pull(true);
    expect(names()).toEqual(["Both have it", "Deleted here, edited there"]);
    expect(pushedNames(calls[1])).toEqual(["Both have it", "Deleted here, edited there"]);
    const kept = JSON.parse(localStorage.getItem(sync.LOST_KEY) || "{}") as sync.SyncDoc;
    expect(kept.characters.map((c) => c.name)).toEqual(["Deleted there, edited here"]);
  });

  it("without a remembered server copy nothing is treated as deleted", () => {
    characterStore().save({ id: "char0001", name: "Only here" });
    const { doc, lost } = sync.resolve({ characters: [{ id: "char0002", name: "Only there" }] }, null);
    expect(doc.characters.map((c) => c.name)).toEqual(["Only there", "Only here"]);
    expect(lost).toEqual([]);
  });

  it("Restore my version puts the kept copy back with a fresh stamp and sends it", async () => {
    vi.useFakeTimers();
    seed([{ id: "char0001", name: "Theirs", updatedAt: T1 }], { char0001: T1 });
    localStorage.setItem(
      sync.LOST_KEY,
      JSON.stringify({
        at: T1,
        characters: [{ id: "char0001", name: "Mine", updatedAt: T0, dockets: [{ caseNumber: "26CC00009" }] }],
      }),
    );
    const calls = stubFetch(
      { status: 200, body: { rev: 1, updated: "u1", data: { characters: [{ id: "char0001", name: "Theirs", updatedAt: T1 }] } } },
      { status: 200, body: { rev: 2, updated: "u2" } },
    );
    await sync.init();
    expect(sync.getState().lost).toBe(1);
    expect(sync.restoreLost()).toBe(1);
    expect(names()).toEqual(["Mine"]);
    expect(characterStore().get("char0001")?.updatedAt! > T1).toBe(true);
    expect(docketStore().list("char0001").map((d) => d.caseNumber)).toEqual(["26CC00009"]);
    expect(sync.getState().lost).toBe(0);
    expect(localStorage.getItem(sync.LOST_KEY)).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls.map((c) => c.method)).toEqual(["GET", "PUT"]);
    expect(pushedNames(calls[1])).toEqual(["Mine"]);
  });

  it("discardLost forgets the kept copy", () => {
    localStorage.setItem(sync.LOST_KEY, JSON.stringify({ at: T1, characters: [{ id: "char0001", name: "Mine" }] }));
    sync.discardLost();
    expect(localStorage.getItem(sync.LOST_KEY)).toBeNull();
    expect(sync.getState().lost).toBe(0);
  });
});

describe("enable / link / disable / destroy", () => {
  it("enable stores the new code and uploads this browser's data", async () => {
    characterStore().save({ name: "Jane Doe" });
    const calls = stubFetch({ status: 201, body: { code: CODE } }, { status: 200, body: { rev: 1, updated: "u1" } });
    expect(await sync.enable()).toBe(CODE);
    expect(calls[0]).toMatchObject({ url: "/api/account", method: "POST", body: {} });
    expect(calls[0].headers.Authorization).toBeUndefined();
    expect(calls[1]).toMatchObject({ method: "PUT" });
    expect((calls[1].body as { rev: number }).rev).toBe(0);
    expect(sync.code()).toBe(CODE);
    expect(localStorage.getItem(sync.REV_KEY)).toBe("1");
  });

  it("enable throws the server's error", async () => {
    stubFetch({ status: 503, body: { error: "Sync storage is full." } });
    await expect(sync.enable()).rejects.toThrow("Sync storage is full.");
    expect(sync.code()).toBeNull();
  });

  it("link rejects a malformed code before any request", async () => {
    const calls = stubFetch({ status: 200 });
    await expect(sync.link("JSA-1234")).rejects.toThrow(sync.BAD_CODE);
    await expect(sync.link("../etc")).rejects.toThrow(sync.BAD_CODE);
    expect(calls).toHaveLength(0);
  });

  it("link reports an unknown code", async () => {
    stubFetch({ status: 404, body: { error: "Unknown sync code." } });
    await expect(sync.link(CODE)).rejects.toThrow("No synced data for that code. Check it was typed correctly.");
    expect(sync.code()).toBeNull();
  });

  it("link merges local characters into the server copy (server wins on id) and uploads", async () => {
    characterStore().save({ id: "shared01", name: "Local Shared" });
    characterStore().save({ id: "local001", name: "Local Only" });
    const calls = stubFetch(
      { status: 200, body: { rev: 4, updated: "u4", data: { characters: [{ id: "shared01", name: "Server Shared" }] } } },
      { status: 200, body: { rev: 5, updated: "u5" } },
    );
    await sync.link("  " + CODE.toLowerCase() + " ");
    expect(calls[0].headers.Authorization).toBe("Bearer " + CODE);
    expect(sync.code()).toBe(CODE);
    expect(names()).toEqual(["Server Shared", "Local Only"]);
    const put = calls[1].body as { rev: number; data: sync.SyncDoc };
    expect(put.rev).toBe(4);
    expect(put.data.characters.map((c) => c.name)).toEqual(["Server Shared", "Local Only"]);
    expect(localStorage.getItem(sync.REV_KEY)).toBe("5");
  });

  it("disable clears the keys and keeps local data; destroy deletes then disables", async () => {
    characterStore().save({ name: "Jane Doe" });
    localStorage.setItem(sync.CODE_KEY, CODE);
    localStorage.setItem(sync.REV_KEY, "2");
    localStorage.setItem(sync.DIRTY_KEY, "1");
    sync.disable();
    expect(sync.code()).toBeNull();
    expect(localStorage.getItem(sync.REV_KEY)).toBeNull();
    expect(localStorage.getItem(sync.DIRTY_KEY)).toBeNull();
    expect(sync.getState().status).toBe("off");
    expect(names()).toEqual(["Jane Doe"]);

    localStorage.setItem(sync.CODE_KEY, CODE);
    const calls = stubFetch({ status: 204 });
    await sync.destroy();
    expect(calls[0]).toMatchObject({ url: "/api/account", method: "DELETE" });
    expect(sync.code()).toBeNull();
    expect(names()).toEqual(["Jane Doe"]);

    localStorage.setItem(sync.CODE_KEY, CODE);
    stubFetch({ status: 500, body: { error: "Couldn't delete sync data." } });
    await expect(sync.destroy()).rejects.toThrow("Couldn't delete sync data.");
    expect(sync.code()).toBe(CODE);
  });

  it("merge keeps the server copy and appends local-only characters", () => {
    characterStore().save({ id: "local001", name: "Local Only" });
    characterStore().save({ id: "shared01", name: "Local Shared" });
    const merged = sync.merge({ characters: [{ id: "shared01", name: "Server Shared" }] });
    expect(merged.characters.map((c) => c.name)).toEqual(["Server Shared", "Local Only"]);
    expect(sync.merge(null).characters.map((c) => c.id)).toEqual(["local001", "shared01"]);
  });

  it("exposes the reference badge labels", () => {
    expect(sync.BADGES).toEqual({
      off: "Off",
      loading: "Loading…",
      pending: "Saving…",
      saving: "Saving…",
      synced: "Synced",
      conflict: "Synced",
      offline: "Offline",
      error: "Problem",
    });
  });
});
