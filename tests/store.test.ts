// @vitest-environment jsdom
// The shared store base (LP-2, LP-99): versioned saves, step-by-step
// migrations, reads that never write, and characters, dockets and the J.A.P.
// rebuilt on it.
import { describe, expect, it, vi } from "vitest";
import { countsOf } from "@/lib/backup";
import { CHARACTER_MIGRATIONS, CHARS_KEY, CHARS_VERSION, createCharacterStore, LEGACY_KEY } from "@/lib/characters";
import { runMigrations } from "@/lib/migrations";
import { createPortfolioStore, JAP_PREFIX, JAP_VERSION } from "@/lib/portfolio";
import { isId, listSetAside, memoryKV, type KV } from "@/lib/storage";
import { createKeyedStore, createStore, isEnvelope, unwrap, type Migration } from "@/lib/store";

/** A memory KV that counts writes. */
function spyKV(initial?: Record<string, string>): KV & { writes: string[] } {
  const kv = memoryKV(initial);
  const writes: string[] = [];
  return {
    ...kv,
    writes,
    set(k, v) {
      writes.push(k);
      kv.set(k, v);
    },
    remove(k) {
      writes.push(k);
      kv.remove(k);
    },
  };
}

interface Note {
  title: string;
  tags: string[];
}

const validNotes = (data: unknown): Note[] =>
  Array.isArray(data)
    ? data.filter((n): n is Note => !!n && typeof n === "object" && typeof (n as Note).title === "string")
    : [];

/** v1 notes were plain strings; v2 notes are { title, tags }. */
const toV2: Migration = {
  to: 2,
  up: (data) => (Array.isArray(data) ? data.map((s) => ({ title: String(s), tags: [] })) : data),
};

const notes = (kv: KV, migrations: Migration[] = [toV2], version = 2) =>
  createStore<Note[]>(kv, {
    key: "lawapp_notes",
    version,
    validate: validNotes,
    migrations,
    isEmpty: (l) => !l.length,
  });

describe("createStore", () => {
  it("saves in an envelope with the version, and removes the key when empty", () => {
    const kv = memoryKV();
    const store = notes(kv);
    expect(store.get()).toEqual([]);
    store.set([{ title: "A", tags: [] }]);
    expect(JSON.parse(kv.get("lawapp_notes")!)).toEqual({ v: 2, data: [{ title: "A", tags: [] }] });
    store.set([]);
    expect(kv.get("lawapp_notes")).toBeNull();
  });

  it("tells subscribers about each change and bumps its version", () => {
    const store = notes(memoryKV());
    const fired = vi.fn();
    const off = store.subscribe(fired);
    const v = store.version();
    store.set([{ title: "A", tags: [] }]);
    expect(fired).toHaveBeenCalledTimes(1);
    expect(store.version()).toBe(v + 1);
    off();
    store.set([]);
    expect(fired).toHaveBeenCalledTimes(1);
  });

  it("reads a bare value saved before the store as version 1, and upgrades it v1 → v2 in memory without writing", () => {
    const kv = spyKV({ lawapp_notes: JSON.stringify(["One", "Two"]) });
    const store = notes(kv);
    expect(store.stored()).toEqual({ version: 1, data: ["One", "Two"] });
    expect(store.get()).toEqual([
      { title: "One", tags: [] },
      { title: "Two", tags: [] },
    ]);
    expect(kv.writes).toEqual([]);
  });

  it("migrate() saves the upgraded value as v2 once, then does nothing", () => {
    const kv = spyKV({ lawapp_notes: JSON.stringify(["One"]) });
    const store = notes(kv);
    const fired = vi.fn();
    store.subscribe(fired);
    expect(store.migrate()).toBe(true);
    expect(JSON.parse(kv.get("lawapp_notes")!)).toEqual({ v: 2, data: [{ title: "One", tags: [] }] });
    expect(fired).toHaveBeenCalledTimes(1);
    const writes = kv.writes.length;
    expect(store.migrate()).toBe(false);
    expect(kv.writes.length).toBe(writes);
  });

  it("runs the steps in order, from the saved version up, and each step's clean-up once", () => {
    const after = vi.fn();
    const steps: Migration[] = [
      { to: 3, up: (d) => (d as Note[]).map((n) => ({ ...n, tags: [...n.tags, "v3"] })), after },
      toV2,
    ];
    const kv = memoryKV({ lawapp_notes: JSON.stringify({ v: 2, data: [{ title: "A", tags: [] }] }) });
    const store = notes(kv, steps, 3);
    // From v2, only the step to 3 runs.
    expect(store.get()).toEqual([{ title: "A", tags: ["v3"] }]);
    expect(after).not.toHaveBeenCalled(); // reads never run clean-ups
    store.migrate();
    expect(after).toHaveBeenCalledTimes(1);
    expect(JSON.parse(kv.get("lawapp_notes")!).v).toBe(3);

    // From a bare v1 value, both steps run.
    const old = notes(memoryKV({ lawapp_notes: JSON.stringify(["B"]) }), steps, 3);
    expect(old.get()).toEqual([{ title: "B", tags: ["v3"] }]);
  });

  it("reads data from a newer version as it is, and never rewrites it", () => {
    const kv = spyKV({ lawapp_notes: JSON.stringify({ v: 9, data: [{ title: "Future", tags: [] }] }) });
    const store = notes(kv);
    expect(store.get()).toEqual([{ title: "Future", tags: [] }]);
    expect(store.migrate()).toBe(false);
    expect(kv.writes).toEqual([]);
  });

  it("with nothing saved and nothing to bring in, leaves the key absent", () => {
    const kv = spyKV();
    const store = notes(kv);
    expect(store.stored()).toEqual({ version: 0, data: undefined });
    expect(store.migrate()).toBe(false);
    expect(kv.writes).toEqual([]);
  });

  it("sets aside an unreadable value, as every store read does", () => {
    const kv = memoryKV({ lawapp_notes: "{broken" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(notes(kv).get()).toEqual([]);
    expect(listSetAside(kv)).toMatchObject([{ key: "lawapp_notes", raw: "{broken" }]);
    warn.mockRestore();
  });

  it("refuses a version below 1", () => {
    expect(() => notes(memoryKV(), [], 0)).toThrow(/version/);
  });

  it("isEnvelope and unwrap tell a saved envelope from a bare value", () => {
    expect(isEnvelope({ v: 2, data: [] })).toBe(true);
    expect(isEnvelope([1, 2])).toBe(false);
    expect(isEnvelope({ v: 0, data: [] })).toBe(false);
    expect(isEnvelope({ v: 2 })).toBe(false);
    expect(unwrap({ v: 2, data: ["x"] })).toEqual(["x"]);
    expect(unwrap(["x"])).toEqual(["x"]);
  });
});

describe("characters on the store (LP-2)", () => {
  const BARE = [
    { id: "char0001", name: "Ann Lee", title: "Judge", updatedAt: "2026-10-01T10:00:00.000Z" },
    { id: "char0002", name: "Bo Day", docket: true },
  ];

  it("are at version 2, with the old list as step 1 and the envelope as step 2", () => {
    expect(CHARS_VERSION).toBe(2);
    expect(CHARACTER_MIGRATIONS.map((m) => m.to)).toEqual([1, 2]);
  });

  it("upgrade a bare v1 list to v2 with nothing else changed, not even updatedAt", () => {
    const kv = spyKV({ [CHARS_KEY]: JSON.stringify(BARE) });
    const chars = createCharacterStore(kv);
    const before = chars.list();
    expect(before).toEqual(BARE);
    expect(kv.writes).toEqual([]); // reading never writes
    expect(chars.migrate()).toBe(true);
    expect(JSON.parse(kv.get(CHARS_KEY)!)).toEqual({ v: 2, data: BARE });
    expect(chars.list()).toEqual(before);
    expect(chars.migrate()).toBe(false);
  });

  it("save after the upgrade keeps the envelope", () => {
    const kv = memoryKV({ [CHARS_KEY]: JSON.stringify(BARE) });
    const chars = createCharacterStore(kv);
    chars.save({ id: "char0003", name: "Cy Ng" });
    const saved = JSON.parse(kv.get(CHARS_KEY)!);
    expect(saved.v).toBe(2);
    expect(saved.data.map((c: { id: string }) => c.id)).toEqual(["char0001", "char0002", "char0003"]);
  });

  it("show the old lawapp.characters.v1 list before migrating, then bring it in once", () => {
    const kv = spyKV({ [LEGACY_KEY]: JSON.stringify([{ id: "old00001", fullName: "Old One", barNumber: "7" }]) });
    const chars = createCharacterStore(kv);
    expect(chars.list()).toMatchObject([{ id: "old00001", name: "Old One", bar: "7" }]);
    expect(kv.writes).toEqual([]);
    expect(chars.migrate()).toBe(true);
    expect(kv.get(LEGACY_KEY)).toBeNull();
    expect(JSON.parse(kv.get(CHARS_KEY)!)).toMatchObject({ v: 2, data: [{ id: "old00001", name: "Old One" }] });
  });

  it("count in a backup whether bare or wrapped", () => {
    expect(countsOf({ lawapp_chars: JSON.stringify(BARE) }).characters).toBe(2);
    expect(countsOf({ lawapp_chars: JSON.stringify({ v: 2, data: BARE }) }).characters).toBe(2);
  });
});

describe("runMigrations", () => {
  it("upgrades this browser's characters once and drops the old server default", () => {
    localStorage.clear();
    localStorage.setItem(CHARS_KEY, JSON.stringify([{ id: "char0001", name: "Ann Lee", server: "gtaw" }]));
    localStorage.setItem("lawapp_server", "gtaw");
    runMigrations();
    expect(JSON.parse(localStorage.getItem(CHARS_KEY)!)).toEqual({ v: 2, data: [{ id: "char0001", name: "Ann Lee" }] });
    expect(localStorage.getItem("lawapp_server")).toBeNull();
    const after = localStorage.getItem(CHARS_KEY);
    runMigrations();
    expect(localStorage.getItem(CHARS_KEY)).toBe(after);
    localStorage.clear();
  });
});

describe("createKeyedStore (LP-99)", () => {
  const keyed = (kv: KV) =>
    createKeyedStore<Note[]>(kv, {
      prefix: "lawapp_notes_",
      isId,
      version: 2,
      validate: validNotes,
      migrations: [toV2],
      isEmpty: (l) => !l.length,
    });

  it("saves each id under prefix + id in the envelope, and removes it when empty", () => {
    const kv = memoryKV();
    const store = keyed(kv);
    store.set("abcd1234", [{ title: "A", tags: [] }]);
    expect(JSON.parse(kv.get("lawapp_notes_abcd1234")!)).toEqual({ v: 2, data: [{ title: "A", tags: [] }] });
    expect(store.get("abcd1234")).toEqual([{ title: "A", tags: [] }]);
    expect(store.get("efgh5678")).toEqual([]);
    store.set("abcd1234", []);
    expect(kv.get("lawapp_notes_abcd1234")).toBeNull();
  });

  it("never reads or writes an id that can't be saved", () => {
    const kv = spyKV({ "lawapp_notes_../x": JSON.stringify(["Sneaky"]) });
    const store = keyed(kv);
    const fired = vi.fn();
    store.subscribe(fired);
    expect(store.get("../x")).toEqual([]);
    store.set("../x", [{ title: "B", tags: [] }]);
    expect(kv.writes).toEqual([]);
    expect(fired).not.toHaveBeenCalled();
    expect(store.ids()).toEqual([]);
  });

  it("upgrades every saved id once, with one change event", () => {
    const kv = spyKV({
      lawapp_notes_abcd1234: JSON.stringify(["One"]),
      lawapp_notes_efgh5678: JSON.stringify({ v: 2, data: [{ title: "Two", tags: [] }] }),
      lawapp_other: JSON.stringify(["Not mine"]),
    });
    const store = keyed(kv);
    expect(store.get("abcd1234")).toEqual([{ title: "One", tags: [] }]); // in memory first
    expect(kv.writes).toEqual([]);
    const fired = vi.fn();
    store.subscribe(fired);
    expect(store.migrate()).toBe(true);
    expect(fired).toHaveBeenCalledTimes(1);
    expect(kv.writes).toEqual(["lawapp_notes_abcd1234"]);
    expect(JSON.parse(kv.get("lawapp_notes_abcd1234")!).v).toBe(2);
    expect(kv.get("lawapp_other")).toBe(JSON.stringify(["Not mine"]));
    expect(store.migrate()).toBe(false);
  });
});

describe("the J.A.P. on the store (LP-99)", () => {
  it("is at version 2", () => {
    expect(JAP_VERSION).toBe(2);
  });

  it("an old-format J.A.P. reads the same before migrating, then is saved as v2", () => {
    const OLD_JAP = {
      level: "II",
      I: {},
      II: { "1": [{ num: "SC-1", link: "https://example.com/a" }] },
      updated: "2026-01-01T00:00:00.000Z",
    };
    const kv = spyKV({ [JAP_PREFIX + "char0001"]: JSON.stringify(OLD_JAP) });
    const jap = createPortfolioStore(kv);
    const before = jap.get("char0001");
    expect(before).toMatchObject({ level: "II", updated: "2026-01-01T00:00:00.000Z" });
    expect(kv.writes).toEqual([]);
    expect(jap.migrate()).toBe(true);
    const saved = JSON.parse(kv.get(JAP_PREFIX + "char0001")!);
    expect(saved.v).toBe(2);
    expect(saved.data).toEqual(before);
    expect(jap.get("char0001")).toEqual(before);
    jap.remove("char0001");
    expect(kv.get(JAP_PREFIX + "char0001")).toBeNull();
    expect(jap.get("char0001")).toBeNull();
  });
});
