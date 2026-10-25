// @vitest-environment jsdom
// Filing history (LP-15): what a filing keeps, duplicates, the cap and a full
// store, search and filters, a case's filings, sync and backup.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeBackup } from "@/lib/backup";
import {
  cleanFiling,
  createFilingStore,
  filingsForCase,
  filingStore,
  filterFilings,
  FILINGS_KEY,
  MAX_FILINGS,
  type Filing,
  type NewFiling,
} from "@/lib/filings";
import { EMPTY_STATE } from "@/lib/formState";
import { memoryKV, type KV } from "@/lib/storage";
import * as sync from "@/lib/sync";
import { renderFiling } from "@/ui/FilingsDialog";

const T1 = "2026-10-01T10:00:00.000Z";
const T2 = "2026-10-02T10:00:00.000Z";

const filing = (over: Partial<NewFiling> = {}): NewFiling => ({
  formId: "civil-complaint",
  formTitle: "Civil Complaint",
  charId: "alice001",
  charName: "Alice Lawyer",
  caseNumber: "90SCCC00001",
  caseId: "case0001",
  via: "forum",
  state: { ...EMPTY_STATE, values: { "Plaintiff name": "Ann" } },
  ...over,
});

describe("the filing store", () => {
  it("keeps the form, character, case, time and values, newest first", () => {
    const store = createFilingStore(memoryKV());
    store.add(filing({ at: T1 }));
    store.add(filing({ at: T2, formId: "extra-subpoena", formTitle: "Subpoena" }));
    const [newest, older] = store.list();
    expect(newest).toMatchObject({ formId: "extra-subpoena", at: T2 });
    expect(older).toMatchObject({
      formId: "civil-complaint",
      charId: "alice001",
      charName: "Alice Lawyer",
      caseNumber: "90SCCC00001",
      caseId: "case0001",
      via: "forum",
      at: T1,
    });
    expect(older.state.values).toEqual({ "Plaintiff name": "Ann" });
  });

  it("copying the same form again (another way) refreshes the newest entry instead of adding one", () => {
    const store = createFilingStore(memoryKV());
    const first = store.add(filing({ at: T1 }))!;
    const again = store.add(filing({ at: T2, via: "docx" }))!;
    expect(store.list()).toHaveLength(1);
    expect(again).toMatchObject({ id: first.id, at: T2, via: "docx" });
    store.add(filing({ state: { ...EMPTY_STATE, values: { "Plaintiff name": "Ann Lee" } } }));
    expect(store.list()).toHaveLength(2);
  });

  it("keeps the newest MAX_FILINGS", () => {
    const store = createFilingStore(memoryKV());
    for (let i = 0; i < MAX_FILINGS + 5; i++) {
      const at = new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString();
      store.add(filing({ at, state: { ...EMPTY_STATE, values: { N: String(i) } } }));
    }
    const list = store.list();
    expect(list).toHaveLength(MAX_FILINGS);
    expect(list[0].state.values.N).toBe(String(MAX_FILINGS + 4));
    expect(list[list.length - 1].state.values.N).toBe("5");
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
    const store = createFilingStore(kv);
    for (let i = 0; i < 8; i++) store.add(filing({ state: { ...EMPTY_STATE, values: { N: "x".repeat(200) + i } } }));
    limit = 1500;
    const kept = store.add(filing({ state: { ...EMPTY_STATE, values: { N: "newest" } } }));
    expect(kept).not.toBeNull();
    expect(store.list()[0].state.values.N).toBe("newest");
    expect(store.list().length).toBeLessThan(9);
  });

  it("refuses what isn't a filing", () => {
    expect(cleanFiling({ formId: "../x", at: T1, state: { values: {} } })).toBeNull();
    expect(cleanFiling({ formId: "civil-complaint", at: "yesterday", state: { values: {} } })).toBeNull();
    expect(cleanFiling({ formId: "civil-complaint", at: T1, state: "nope" })).toBeNull();
    expect(cleanFiling({ formId: "civil-complaint", at: T1, via: "fax", state: { values: {} } })).toMatchObject({
      via: "forum",
      charId: null,
    });
  });
});

describe("searching filings", () => {
  const LIST = [
    { ...filing({ at: T1 }), id: "fil00001" },
    {
      ...filing({ at: T2, charId: "bob00001", charName: "Bob Lawyer", caseNumber: "90SCCR00002", caseId: null }),
      id: "fil00002",
    },
    { ...filing({ at: T2, formTitle: "Subpoena", caseNumber: undefined, caseId: null }), id: "fil00003" },
  ] as Filing[];
  const ids = (l: Filing[]) => l.map((f) => f.id);

  it("by form, case number or character name; then by character and case number", () => {
    expect(ids(filterFilings(LIST, { q: "subpoena" }))).toEqual(["fil00003"]);
    expect(ids(filterFilings(LIST, { q: "bob" }))).toEqual(["fil00002"]);
    expect(ids(filterFilings(LIST, { charId: "alice001" }))).toEqual(["fil00003", "fil00001"]);
    expect(ids(filterFilings(LIST, { caseNumber: "90sccr00002" }))).toEqual(["fil00002"]);
  });

  it("a case's filings: linked to it, or with its case number", () => {
    expect(ids(filingsForCase(LIST, { id: "case0001", caseNumber: "90SCCC00001" }))).toEqual(["fil00001"]);
    expect(ids(filingsForCase(LIST, { id: "case0009", caseNumber: "90SCCR00002" }))).toEqual(["fil00002"]);
  });
});

describe("sync and backup", () => {
  beforeEach(() => {
    localStorage.clear();
    sync.__resetForTests();
  });
  afterEach(() => localStorage.clear());

  it("filings travel in the sync copy and merge one at a time", () => {
    const mine = filingStore().add(filing({ at: T1 }))!;
    expect(sync.snapshot().filings).toMatchObject([{ id: mine.id }]);
    const theirs = cleanFiling({ ...filing({ at: T2, formId: "extra-subpoena" }), id: "fil00009" })!;
    const { doc, keptLocal } = sync.resolve({ characters: [], cases: [], filings: [theirs] }, null);
    expect(doc.filings!.map((f) => f.id).sort()).toEqual([mine.id, "fil00009"].sort());
    expect(keptLocal).toBe(true);
  });

  it("a copy from before filings synced keeps this browser's", () => {
    filingStore().add(filing({ at: T1 }));
    const { doc, keptLocal } = sync.resolve({ characters: [] }, null);
    expect(doc.filings).toHaveLength(1);
    expect(keptLocal).toBe(true);
  });

  it("filing history is in the full backup", () => {
    const kv = memoryKV();
    createFilingStore(kv).add(filing());
    expect(Object.keys(makeBackup(kv).data)).toContain(FILINGS_KEY);
  });
});

describe("a past filing re-rendered (LP-136)", () => {
  const past = (at: string): Filing =>
    ({ ...filing({ caseNumber: "", caseId: undefined, state: EMPTY_STATE }), id: "fil00001", at }) as Filing;

  it("shows a blank Case number as the pattern, as the original copy did", () => {
    const html = String(renderFiling(past(T1)));
    expect(html).toMatch(/90SC[A-Z]{2}00XXX/);
    // The template's raw fallback was "Court File: YYSCCC#####".
    expect(html).not.toMatch(/YYSC|#####/);
  });

  it("takes the case-number year from when it was filed, in New York", () => {
    // 10 pm on New York's New Year's Eve is still 1990; the next June is 1991.
    expect(String(renderFiling(past("2027-01-01T03:00:00.000Z")))).toMatch(/90SC[A-Z]{2}00XXX/);
    expect(String(renderFiling(past("2027-06-01T12:00:00.000Z")))).toMatch(/91SC[A-Z]{2}00XXX/);
  });
});
