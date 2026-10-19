// Draft history (LP-89): undo/redo steps with typing grouped, and the snapshots
// kept per form: limits, duplicates, storage-full trimming, 1990 times, backup.
import { describe, expect, it } from "vitest";
import { makeBackup } from "@/lib/backup";
import {
  createDraftHistory,
  filledCount,
  hasContent,
  HISTORY_PREFIX,
  MAX_SNAPSHOTS,
  snapshotTime,
} from "@/lib/draftHistory";
import { change, EMPTY_STATE, GROUP_MS, redo, startUndo, undo, UNDO_LIMIT, type FormState } from "@/lib/formState";
import { memoryKV, type KV } from "@/lib/storage";

const st = (values: FormState["values"]): FormState => ({ ...EMPTY_STATE, values });

describe("undo and redo", () => {
  it("groups typing in one field into one step", () => {
    let u = startUndo(st({}));
    u = change(u, st({ Name: "A" }), "f-name", 1000);
    u = change(u, st({ Name: "An" }), "f-name", 1300);
    u = change(u, st({ Name: "Ann" }), "f-name", 1600);
    expect(u.past.map((s) => s.values)).toEqual([{}]);
    u = undo(u);
    expect(u.state.values).toEqual({});
    u = redo(u);
    expect(u.state.values).toEqual({ Name: "Ann" });
  });

  it("starts a new step after a pause, in another field, or for a change without a key", () => {
    let u = startUndo(st({}));
    u = change(u, st({ Name: "Ann" }), "f-name", 1000);
    u = change(u, st({ Name: "Ann Lee" }), "f-name", 1000 + GROUP_MS + 1); // a pause
    u = change(u, st({ Name: "Ann Lee", Case: "1" }), "f-case", 3000); // another field
    u = change(u, st({}), null, 3100); // Clear form
    expect(u.past.map((s) => s.values)).toEqual([
      {},
      { Name: "Ann" },
      { Name: "Ann Lee" },
      { Name: "Ann Lee", Case: "1" },
    ]);
  });

  it("a new change after undo drops the redo steps", () => {
    let u = startUndo(st({}));
    u = change(u, st({ A: "1" }), null, 1);
    u = change(u, st({ A: "2" }), null, 2);
    u = undo(u);
    expect(u.future).toHaveLength(1);
    u = change(u, st({ A: "3" }), null, 3);
    expect(u.future).toEqual([]);
    expect(redo(u)).toBe(u);
  });

  it("does nothing with nothing to undo, or a change that isn't one", () => {
    const u = startUndo(st({ A: "1" }));
    expect(undo(u)).toBe(u);
    expect(redo(u)).toBe(u);
    expect(change(u, u.state, null, 1)).toBe(u);
  });

  it("keeps at most UNDO_LIMIT steps", () => {
    let u = startUndo(st({}));
    for (let i = 0; i < UNDO_LIMIT + 10; i++) u = change(u, st({ A: String(i) }), null, i);
    expect(u.past).toHaveLength(UNDO_LIMIT);
  });
});

describe("snapshots", () => {
  const FORM = "civil-complaint";
  const at = (min: number) => new Date(Date.UTC(2026, 9, 19, 12, min));

  it("keeps a snapshot, newest first, as v1 under lawapp_history_<form>", () => {
    const kv = memoryKV();
    const h = createDraftHistory(kv);
    expect(h.add(FORM, st({ "Plaintiff name": "Ann" }), at(0))).toBe(true);
    expect(h.add(FORM, st({ "Plaintiff name": "Ann Lee" }), at(5))).toBe(true);
    expect(h.list(FORM).map((s) => s.state.values["Plaintiff name"])).toEqual(["Ann Lee", "Ann"]);
    expect(h.lastAt(FORM)).toBe(at(5).getTime());
    expect(JSON.parse(kv.get(HISTORY_PREFIX + FORM)!).v).toBe(1);
  });

  it("skips an empty form and a copy of the newest snapshot", () => {
    const h = createDraftHistory(memoryKV());
    expect(h.add(FORM, st({ "Plaintiff name": "  ", "?Optional": true, "#Items": [{}] }))).toBe(false);
    expect(h.add(FORM, st({ "Plaintiff name": "Ann" }))).toBe(true);
    expect(h.add(FORM, st({ "Plaintiff name": "Ann" }))).toBe(false);
    expect(h.list(FORM)).toHaveLength(1);
  });

  it("keeps the last MAX_SNAPSHOTS per form, and forms apart", () => {
    const h = createDraftHistory(memoryKV());
    for (let i = 0; i < MAX_SNAPSHOTS + 5; i++) h.add(FORM, st({ N: String(i) }), at(i));
    h.add("extra-subpoena", st({ N: "other" }), at(0));
    const list = h.list(FORM);
    expect(list).toHaveLength(MAX_SNAPSHOTS);
    expect(list[0].state.values.N).toBe(String(MAX_SNAPSHOTS + 4));
    expect(list[list.length - 1].state.values.N).toBe("5");
    expect(h.list("extra-subpoena")).toHaveLength(1);
  });

  it("drops the oldest first when storage is full", () => {
    const base = memoryKV();
    let limit = Infinity;
    const kv: KV = {
      ...base,
      set(k, v) {
        if (v.length > limit) throw new Error("QuotaExceededError");
        base.set(k, v);
      },
    };
    const h = createDraftHistory(kv);
    for (let i = 0; i < 10; i++) h.add(FORM, st({ N: "x".repeat(100) + i }), at(i));
    limit = 600; // room for about three
    expect(h.add(FORM, st({ N: "newest" }), at(30))).toBe(true);
    const list = h.list(FORM);
    expect(list[0].state.values.N).toBe("newest");
    expect(list.length).toBeLessThan(10);
    limit = 10; // not even one fits
    expect(h.add(FORM, st({ N: "too big" }), at(31))).toBe(false);
    expect(h.list(FORM)[0].state.values.N).toBe("newest");
  });

  it("ignores a form id that can't be a key", () => {
    const kv = memoryKV();
    expect(createDraftHistory(kv).add("../x", st({ A: "1" }))).toBe(false);
    expect(kv.keys!()).toEqual([]);
  });

  it("is in the full backup (LP-1)", () => {
    const kv = memoryKV();
    createDraftHistory(kv).add(FORM, st({ A: "1" }));
    expect(Object.keys(makeBackup(kv).data)).toContain(HISTORY_PREFIX + FORM);
  });
});

describe("snapshot details", () => {
  it("shows times on the 1990 calendar", () => {
    // 19 Oct 2026 is a Monday; 19 Oct 1990 was a Friday.
    const local = new Date(2026, 9, 19, 14, 5);
    expect(snapshotTime(local.toISOString())).toBe("Fri 19 Oct 1990, 14:05");
  });

  it("counts filled fields, in blocks too, and tells an empty form", () => {
    const values = { A: "x", B: "", C: true, "?Opt": true, "#Items": [{ D: "y" }, { D: "" }] };
    expect(filledCount(values)).toBe(3);
    expect(hasContent(values)).toBe(true);
    expect(hasContent({ A: " ", "?Opt": true, "#Items": [{ D: "" }] })).toBe(false);
  });
});
