// Per-form state (AC 29, R1–R3, R6, AC 13 logic, docket mapping).
import { describe, expect, it } from "vitest";
import { getForm } from "@/data";
import {
  addItem,
  afterAddItem,
  applyPrefills,
  autoDate,
  docketToForm,
  draftKey,
  fillFromCharacter,
  formToDocketPatch,
  hasDependents,
  materializeBlocks,
  moveItem,
  openState,
  readDraft,
  removeItem,
  sectionMeta,
  setCond,
  setValue,
  singular,
  swapCaseCode,
  todayDate,
  writeDraft,
  type FormState,
} from "@/lib/formState";
import { divisionFor } from "@/lib/dockets";
import { memoryKV } from "@/lib/storage";
import { compile, fields, todayUTC } from "@/lib/template";
import type { Character, Docket, Entry, Values } from "@/lib/types";

const NOW = new Date("2026-03-10T12:00:00Z");

function entriesOf(id: string): Entry[] {
  return fields(compile(getForm(id)!.html));
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

const state = (values: Values = {}, autofilled: Record<string, string> = {}, derived: Record<string, string> = {}): FormState => ({
  values,
  autofilled,
  derived,
});

const items = (v: Values, block: string) => v["#" + block] as Values[];

const char = (over: Partial<Character>): Character => ({ id: "char0001", name: "Ann Lee", ...over });

describe("update API (AC 29)", () => {
  it("setValue on a nested item changes only that item and never mutates", () => {
    const entries = entriesOf("civil-complaint");
    const s = deepFreeze(openState(entries, null, null, NOW));
    const next = setValue(s, [{ block: "Defendants", index: 1 }, { block: "Accusations", index: 0 }], "Accusation", "Fraud");
    const d0 = items(s.values, "Defendants")[0];
    const d1 = items(next.values, "Defendants")[1];
    expect(items(d1, "Accusations")[0]).toEqual({ Accusation: "Fraud" });
    expect(items(next.values, "Defendants")[0]).toBe(d0);
    expect(items(d1, "Accusations")[1]).toBe(items(items(s.values, "Defendants")[1], "Accusations")[1]);
    expect(items(items(s.values, "Defendants")[1], "Accusations")[0]).toEqual({});
  });

  it("a stale path is a no-op", () => {
    const s = deepFreeze(state({ "#A": [{}] }));
    expect(setValue(s, [{ block: "A", index: 5 }], "x", "y")).toBe(s);
    expect(setValue(s, [{ block: "B", index: 0 }], "x", "y")).toBe(s);
  });

  it("materializeBlocks gives default items, recursively", () => {
    const arr = materializeBlocks(entriesOf("criminal-arraignment"), {});
    expect(items(arr, "Counts")).toHaveLength(4);
    expect(items(arr, "Exhibits")).toHaveLength(3);
    const cc = materializeBlocks(entriesOf("civil-complaint"), {});
    expect(items(cc, "Defendants")).toHaveLength(2);
    for (const d of items(cc, "Defendants")) expect(items(d, "Accusations")).toHaveLength(2);
    // Unchanged input comes back as is, and an emptied block is not refilled.
    expect(materializeBlocks(entriesOf("civil-complaint"), cc)).toBe(cc);
    const empty = { ...cc, "#Exhibits": [] };
    expect(items(materializeBlocks(entriesOf("civil-complaint"), empty), "Exhibits")).toEqual([]);
  });

  it("removeItem can empty a block; addItem then gives 1", () => {
    let s = deepFreeze(state({ "#Exhibits": [{ a: "1" }, { a: "2" }] }));
    s = removeItem(s, [], "Exhibits", 0);
    s = removeItem(s, [], "Exhibits", 0);
    expect(items(s.values, "Exhibits")).toEqual([]);
    expect(removeItem(s, [], "Exhibits", 0)).toBe(s);
    s = addItem(s, [], "Exhibits");
    expect(items(s.values, "Exhibits")).toEqual([{}]);
  });

  it("moveItem swaps and is a no-op at the ends", () => {
    const s = deepFreeze(state({ "#X": [{ a: "1" }, { a: "2" }, { a: "3" }] }));
    expect(moveItem(s, [], "X", 0, -1)).toBe(s);
    expect(moveItem(s, [], "X", 2, 1)).toBe(s);
    expect(items(moveItem(s, [], "X", 1, -1).values, "X").map((i) => i.a)).toEqual(["2", "1", "3"]);
    expect(items(moveItem(s, [], "X", 1, 1).values, "X").map((i) => i.a)).toEqual(["1", "3", "2"]);
  });

  it('setValue("") deletes the key and clears autofilled/derived', () => {
    const s = deepFreeze(state({ Name: "A", Other: "B" }, { Name: "A" }, { Name: "A", Other: "B" }));
    const next = setValue(s, [], "Name", "");
    expect(next.values).toEqual({ Other: "B" });
    expect(next.autofilled).toEqual({});
    expect(next.derived).toEqual({ Other: "B" });
    expect(setValue(s, [], "Flag", false).values).toEqual({ Name: "A", Other: "B" });
    expect(setValue(s, [], "Flag", true).values.Flag).toBe(true);
  });

  it("setValue(Division) swaps the case code in the addressed scope only", () => {
    const s = deepFreeze(state({ "Case number": "90SCCR00999", "#Cases": [{ "Case number": "90SCCR00147" }] }));
    const next = setValue(s, [{ block: "Cases", index: 0 }], "Division", "CIVIL DIVISION");
    expect(items(next.values, "Cases")[0]).toEqual({ "Case number": "90SCCC00147", Division: "CIVIL DIVISION" });
    expect(next.values["Case number"]).toBe("90SCCR00999");
  });

  it('setCond(false) stores "?Name": false', () => {
    const s = deepFreeze(state());
    const off = setCond(s, [], "Respondent", false);
    expect(off.values).toEqual({ "?Respondent": false });
    expect(setCond(off, [], "Respondent", true).values).toEqual({ "?Respondent": true });
  });
});

describe("Division and the case code (R2)", () => {
  const entries = entriesOf("misc-order-decree");

  it("leaves a derived number for applyPrefills", () => {
    const s = deepFreeze(
      state({ Division: "CRIMINAL DIVISION", "Case number": "26SCCR00XXX" }, {}, { "Case number": "26SCCR00XXX" }),
    );
    const next = setValue(s, [], "Division", "CIVIL DIVISION");
    expect(next.values["Case number"]).toBe("26SCCR00XXX");
    expect(hasDependents(entries, next.values, "Division")).toBe(true);
    const after = applyPrefills(entries, next, NOW);
    expect(after.values["Case number"]).toBe("26SCCC00XXX");
    expect(after.derived["Case number"]).toBe("26SCCC00XXX");
  });

  it("swaps a hand-typed number", () => {
    const s = deepFreeze(state({ Division: "CRIMINAL DIVISION", "Case number": "90SCCR00147" }));
    const next = setValue(s, [], "Division", "CIVIL DIVISION");
    expect(next.values["Case number"]).toBe("90SCCC00147");
    expect(applyPrefills(entries, next, NOW).values["Case number"]).toBe("90SCCC00147");
  });

  it("swapCaseCode needs a known division and a matching number", () => {
    const scope = { "Case number": "90SCCR00147" };
    expect(swapCaseCode(scope, "NOWHERE", undefined)).toBe(scope);
    expect(swapCaseCode({ "Case number": "2026-CV-1" }, "CIVIL DIVISION", undefined)).toEqual({ "Case number": "2026-CV-1" });
    expect(swapCaseCode(scope, "TRAFFIC DIVISION", undefined)).toEqual({ "Case number": "90SCTC00147" });
    expect(swapCaseCode(scope, "TRAFFIC DIVISION", "90SCCR00147")).toBe(scope);
  });
});

describe("prefills", () => {
  const entries = entriesOf("criminal-case-schedule");

  it("settles chained dates", () => {
    const s = applyPrefills(entries, state(), NOW);
    expect(s.values["Filing date"]).toBe("2026-03-10");
    expect(s.values.Judgement).toBe("2026-03-31");
    expect(s.values["Pre-trial motions start"]).toBe("2026-03-10");
    expect(s.values["Closing arguments end"]).toBe("2026-03-29");
    expect(s.values["Case number"]).toBe("26SCCR00XXX");

    // Moving the judgement reflows its dependents but not a hand-typed one.
    let next = setValue(s, [], "Witness examinations end", "2026-01-01");
    next = setValue(next, [], "Judgement", "2026-04-30");
    expect(hasDependents(entries, next.values, "Judgement")).toBe(true);
    next = applyPrefills(entries, next, NOW);
    expect(next.values["Pre-trial motions start"]).toBe("2026-04-09");
    expect(next.values["Witness examinations end"]).toBe("2026-01-01");
    expect(next.values.Judgement).toBe("2026-04-30");
  });

  it("returns the same state when nothing changes", () => {
    const s = applyPrefills(entries, state(), NOW);
    expect(applyPrefills(entries, s, NOW)).toBe(s);
  });

  it("Auto recomputes the Filing date (R3)", () => {
    const s = applyPrefills(entries, state(), NOW);
    const typed = setValue(s, [], "Filing date", "2020-01-01");
    expect(typed.values["Filing date"]).toBe("2020-01-01");
    const auto = autoDate(entries, typed, [], "Filing date", NOW);
    expect(auto.values["Filing date"]).toBe(todayUTC(NOW));
  });

  it("Today sets UTC today and reflows only when there are dependents (R3)", () => {
    const s = applyPrefills(entries, state(), NOW);
    const later = new Date("2026-05-01T00:30:00Z");
    const j = todayDate(entries, s, [], "Judgement", later);
    expect(j.values.Judgement).toBe("2026-05-01");
    expect(j.values["Pre-trial motions start"]).toBe("2026-04-10");
    const f = todayDate(entries, s, [], "Filing date", later);
    expect(f.values["Filing date"]).toBe("2026-05-01");
    expect(f.values["Case number"]).toBe(s.values["Case number"]);
  });
});

describe("character fill (AC 13 logic)", () => {
  const entries = entriesOf("civil-complaint");

  it("fills empty fields and follows a switch without overwriting user input", () => {
    let s = fillFromCharacter(entries, state(), char({ name: "Ann" }), false);
    expect(s.values["Plaintiff name"]).toBe("Ann");
    expect(s.autofilled["Plaintiff name"]).toBe("Ann");
    s = fillFromCharacter(entries, s, char({ name: "Bob" }), false);
    expect(s.values["Plaintiff name"]).toBe("Bob");
    s = setValue(s, [], "Plaintiff name", "Typed");
    s = fillFromCharacter(entries, s, char({ name: "Cy" }), false);
    expect(s.values["Plaintiff name"]).toBe("Typed");
    s = fillFromCharacter(entries, s, char({ name: "Cy" }), true);
    expect(s.values["Plaintiff name"]).toBe("Cy");
  });

  it("removes a stale autofill the new character lacks", () => {
    const entries2 = entriesOf("misc-order-decree");
    let s = fillFromCharacter(entries2, state(), char({ name: "Ann", title: "Judge" }), false);
    expect(s.values["Judge title"]).toBe("Judge");
    s = fillFromCharacter(entries2, s, char({ name: "Ann" }), false);
    expect(s.values["Judge title"]).toBeUndefined();
    expect(s.autofilled["Judge title"]).toBeUndefined();
    expect(fillFromCharacter(entries2, s, null, false).values["Judge name"]).toBeUndefined();
  });
});

describe("opening and adding (R1, R6)", () => {
  it("openState restores a stored draft, then prefills and fills", () => {
    const entries = entriesOf("civil-complaint");
    const kv = memoryKV();
    writeDraft(kv, "civil-complaint", state({ "Defendant name": "Cy", "#Exhibits": [{}] }, {}, {}));
    const draft = readDraft(kv, "civil-complaint");
    expect(draft?.values["Defendant name"]).toBe("Cy");
    const s = openState(entries, draft, char({ name: "Ann Lee" }), NOW);
    expect(s.values["Defendant name"]).toBe("Cy");
    expect(items(s.values, "Exhibits")).toHaveLength(1); // the draft's array is kept
    expect(items(s.values, "Defendants")).toHaveLength(2);
    expect(s.values["Case number"]).toBe("26SCCC00XXX");
    expect(s.derived["Case number"]).toBe("26SCCC00XXX");
    expect(s.values["Plaintiff name"]).toBe("Ann Lee");
    expect(s.autofilled["Plaintiff name"]).toBe("Ann Lee");
    // A stored hand-typed number is kept.
    const typed = openState(entries, state({ "Case number": "90SCCC00147" }), null, NOW);
    expect(typed.values["Case number"]).toBe("90SCCC00147");
  });

  it("readDraft discards an invalid draft", () => {
    const kv = memoryKV({ [draftKey("x")]: '{"values":[1]}', [draftKey("y")]: "{oops" });
    expect(readDraft(kv, "x")).toBeNull();
    expect(kv.get(draftKey("x"))).toBeNull();
    const warn = console.warn;
    console.warn = () => {};
    expect(readDraft(kv, "y")).toBeNull();
    console.warn = warn;
    expect(kv.get(draftKey("y"))).toBeNull();
    expect(readDraft(kv, "none")).toBeNull();
  });

  it("afterAddItem materialises the new item's nested blocks", () => {
    const entries = entriesOf("civil-complaint");
    const s = deepFreeze(openState(entries, null, null, NOW));
    const added = addItem(s, [], "Defendants");
    expect(items(added.values, "Defendants")[2]).toEqual({});
    const next = afterAddItem(entries, added, null, NOW);
    expect(items(items(next.values, "Defendants")[2], "Accusations")).toHaveLength(2);
  });
});

describe("dockets ↔ form", () => {
  const docket = (over: Partial<Docket>): Docket => ({
    id: "d1",
    caseNumber: "90SCCC00147",
    status: "Open",
    updated: "2026-01-01T00:00:00.000Z",
    ...over,
  });

  it("docketToForm fills the civil-complaint fields it has", () => {
    const entries = entriesOf("civil-complaint");
    const s = deepFreeze(
      openState(entries, null, char({ name: "Ann" }), NOW),
    );
    const { state: next, filled } = docketToForm(
      entries,
      s,
      docket({ plaintiff: "Ann and Bo", defendant: "Cy", filed: "2026-01-05", court: "x" }),
    );
    expect(filled).toBe(4);
    expect(next.values).toMatchObject({
      "Case number": "90SCCC00147",
      "Plaintiff name": "Ann and Bo",
      "Defendant name": "Cy",
      "Action filed": "2026-01-05",
    });
    expect(next.values.Division).toBeUndefined();
    expect(next.derived["Case number"]).toBeUndefined();
    expect(next.autofilled["Plaintiff name"]).toBeUndefined();
  });

  it("docketToForm fills division and party labels where present", () => {
    const entries = entriesOf("misc-order-decree");
    const { state: next, filled } = docketToForm(entries, state(), docket({ plaintiff: "A, B", defendant: "C" }));
    expect(next.values).toMatchObject({
      Division: "CIVIL DIVISION",
      "Plaintiff name(s)": "A, B",
      "Plaintiff label": "Plaintiffs",
      "Defendant label": "Defendant",
    });
    expect(filled).toBe(6);
  });

  it("docketToForm names our courthouse from the case number, and leaves an old GTAW one as filed (LP-68)", () => {
    const entries = entriesOf("criminal-case-schedule");
    const ours = docketToForm(entries, state(), docket({ caseNumber: "90SCCR00147" })).state;
    expect(ours.values).toMatchObject({ "Case number": "90SCCR00147", Courthouse: "SUPERIOR COURT" });
    const old = docketToForm(entries, state(), docket({ caseNumber: "26GJCR00147" })).state;
    expect(old.values["Case number"]).toBe("26GJCR00147");
    expect(old.values.Courthouse).toBeUndefined();
  });

  it("formToDocketPatch builds the patch and closes judgement forms", () => {
    const j = getForm("criminal-judgement")!;
    const res = formToDocketPatch(j, fields(compile(j.html)), { "Case number": "90SCCR00147" });
    expect(res).toEqual({
      patch: { caseNumber: "90SCCR00147", court: "San Andreas Criminal Court", status: "Closed" },
    });
    const sched = getForm("criminal-case-schedule")!;
    const se = fields(compile(sched.html));
    const s = applyPrefills(se, state({ "Case number": "90SCCR00147", "Plaintiff name": "People" }), NOW);
    const p = formToDocketPatch(sched, se, s.values);
    expect(p).toMatchObject({ patch: { plaintiff: "People", nextEvent: "Judgement", nextDate: "2026-03-31", filed: "2026-03-10" } });
    expect("patch" in p && p.patch.status).toBeFalsy();
  });

  it("formToDocketPatch needs a real case number", () => {
    const f = getForm("civil-complaint")!;
    const e = fields(compile(f.html));
    expect(formToDocketPatch(f, e, { "Case number": "90SCCC00XXX" })).toEqual({ error: "Enter the case number first." });
    expect(formToDocketPatch(f, e, {})).toEqual({ error: "Enter the case number first." });
  });

  it("never writes the general San Andreas Court or Additional Templates as the court", () => {
    const e = entriesOf("misc-order-decree");
    for (const court of ["San Andreas Court", "Additional Templates"]) {
      const p = formToDocketPatch({ id: "x", court }, e, { "Case number": "2026-CV-0042" });
      expect(p).toEqual({ patch: { caseNumber: "2026-CV-0042" } });
    }
    const p = formToDocketPatch({ id: "x", court: "San Andreas Appellate Court" }, e, { "Case number": "2026-CV-0042" });
    expect("patch" in p && p.patch.court).toBe("San Andreas Appellate Court");
  });

  it("reads a docket's division from a FreestyleRP court name or one saved before LP-69", () => {
    expect(divisionFor({ court: "San Andreas Civil Court" })).toBe("CIVIL DIVISION");
    expect(divisionFor({ court: "San Andreas Small Claims Court" })).toBe("SMALL CLAIMS DIVISION");
    expect(divisionFor({ court: "Superior Court of San Andreas - Traffic Division" })).toBe("TRAFFIC DIVISION");
    expect(divisionFor({ court: "San Andreas Appellate Court" })).toBeUndefined();
    // The case number's own code wins.
    expect(divisionFor({ caseNumber: "90SCCR00001", court: "San Andreas Civil Court" })).toBe("CRIMINAL DIVISION");
  });
});

describe("section meta and helpers", () => {
  it("counts filled, ticked and XXX prefills as unfilled", () => {
    const entries = entriesOf("criminal-case-schedule");
    const s = applyPrefills(entries, state(), NOW);
    const first = sectionMeta(entries.slice(0, entries.findIndex((e) => "section" in e)), s.values);
    expect(first.total).toBe(5);
    expect(first.filled).toBe(1); // Filing date; Case number still holds XXX
    expect(first.done).toBe(false);
  });

  it("singular", () => {
    expect(singular("Defendants")).toBe("Defendant");
    expect(singular("Parties")).toBe("Party");
    expect(singular("Sub-points")).toBe("Sub-point");
  });
});
