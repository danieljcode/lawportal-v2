// @vitest-environment jsdom
// IndexedDB storage (LP-36): the move from localStorage, the in-memory copy, batched saves and fallbacks.
import { IDBDatabase, IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDB_MARKER, initStorage, openIdbKV } from "@/lib/idb";
import { __resetDefaultKVForTests, backend, defaultKV, saveFailedVersion } from "@/lib/storage";
import { THEME_KEY } from "@/lib/theme";

/** Lets fake-indexeddb finish its transactions and the BroadcastChannel deliver. */
const settle = () => new Promise((r) => setTimeout(r, 30));

beforeEach(() => {
  localStorage.clear();
  globalThis.indexedDB = new IDBFactory();
  __resetDefaultKVForTests();
});

afterEach(() => vi.restoreAllMocks());

describe("IndexedDB storage (LP-36)", () => {
  it("moves localStorage's app data in, then clears it; device keys and other apps' keys stay", async () => {
    localStorage.setItem("lawapp_chars", '[{"id":"abcd1234"}]');
    localStorage.setItem("lawapp_dockets_abcd1234", "{}");
    localStorage.setItem(THEME_KEY, "dark");
    localStorage.setItem("other_app", "x");
    const kv = await openIdbKV();
    expect(kv?.get("lawapp_chars")).toBe('[{"id":"abcd1234"}]');
    expect(kv?.get("lawapp_dockets_abcd1234")).toBe("{}");
    expect(localStorage.getItem("lawapp_chars")).toBeNull();
    expect(localStorage.getItem("lawapp_dockets_abcd1234")).toBeNull();
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(localStorage.getItem("other_app")).toBe("x");
    expect(localStorage.getItem(IDB_MARKER)).toBe("1");
    expect(kv?.get(THEME_KEY)).toBe("dark");
    expect(kv?.keys?.().sort()).toEqual(["lawapp_chars", "lawapp_dockets_abcd1234", THEME_KEY]);
  });

  it("saves writes made in one task in one transaction, and they read back after a reload", async () => {
    const kv = (await openIdbKV())!;
    const tx = vi.spyOn(IDBDatabase.prototype, "transaction");
    kv.set("lawapp_chars", "[1]");
    kv.set("lawapp_dockets_abcd1234", "{}");
    kv.remove("lawapp_dockets_abcd1234");
    expect(kv.get("lawapp_chars")).toBe("[1]");
    await settle();
    expect(tx.mock.calls.filter(([, mode]) => mode === "readwrite")).toHaveLength(1);
    const again = (await openIdbKV())!;
    expect(again.get("lawapp_chars")).toBe("[1]");
    expect(again.get("lawapp_dockets_abcd1234")).toBeNull();
  });

  it("keeps device keys in localStorage, for the theme script", async () => {
    const kv = (await openIdbKV())!;
    kv.set(THEME_KEY, "light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    kv.remove(THEME_KEY);
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it("a failed save raises the notice and goes out with the next one", async () => {
    const kv = (await openIdbKV())!;
    const before = saveFailedVersion();
    vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementationOnce(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    kv.set("lawapp_chars", "[1]");
    await settle();
    expect(saveFailedVersion()).toBe(before + 1);
    kv.set("lawapp_cases", "[2]");
    await settle();
    const again = (await openIdbKV())!;
    expect(again.get("lawapp_chars")).toBe("[1]");
    expect(again.get("lawapp_cases")).toBe("[2]");
  });

  it("another tab's saves reach this tab's copy", async () => {
    const a = (await openIdbKV())!;
    const b = (await openIdbKV())!;
    a.set("lawapp_chars", "[1]");
    await settle();
    expect(b.get("lawapp_chars")).toBe("[1]");
  });

  it("initStorage uses IndexedDB when it opens", async () => {
    await initStorage();
    expect(backend()).toBe("indexeddb");
  });

  it("without IndexedDB the app stays on localStorage, its data untouched", async () => {
    localStorage.setItem("lawapp_chars", "[1]");
    // @ts-expect-error: a browser without IndexedDB
    delete globalThis.indexedDB;
    await initStorage();
    expect(backend()).toBe("local");
    expect(defaultKV().get("lawapp_chars")).toBe("[1]");
  });

  it("an IndexedDB that never opens times out to localStorage, and nothing is cleared", async () => {
    localStorage.setItem("lawapp_chars", "[1]");
    globalThis.indexedDB = { open: () => ({}) } as unknown as IDBFactory;
    await initStorage(20);
    expect(backend()).toBe("local");
    expect(localStorage.getItem("lawapp_chars")).toBe("[1]");
  });

  it("once the data has moved, a failed open falls back to memory, never to an empty localStorage", async () => {
    localStorage.setItem(IDB_MARKER, "1");
    // @ts-expect-error: IndexedDB gone after the move
    delete globalThis.indexedDB;
    await initStorage();
    expect(backend()).toBe("memory");
  });
});
