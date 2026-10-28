// @vitest-environment jsdom
// Firm-owned cases (LP-4): the migration from per-character dockets (several
// characters with one case number included), deleting a character, the docket
// view over cases, merging cases from two devices, sync of old copies, backup.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countsOf, makeBackup } from "@/lib/backup";
import {
  caseIdFor,
  caseProblem,
  CASES_KEY,
  caseStore,
  casesFromDockets,
  createCaseStore,
  filterCases,
  needsLead,
  NEEDS_LEAD,
  unifyCases,
} from "@/lib/cases";
import { createCharacterStore } from "@/lib/characters";
import { createDocketStore, DOCKETS_PREFIX } from "@/lib/dockets";
import { runMigrations } from "@/lib/migrations";
import { createPortfolioStore } from "@/lib/portfolio";
import { deleteCharacter } from "@/lib/services/characters";
import { listSetAside, memoryKV, type KV } from "@/lib/storage";
import * as sync from "@/lib/sync";
import type { Case } from "@/lib/types";

const T1 = "2026-01-01T00:00:00.000Z";
const T2 = "2026-02-01T00:00:00.000Z";
const T3 = "2026-03-01T00:00:00.000Z";

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

/** Two characters' old dockets with one case number in common (in different capitals). */
const OLD = {
  [DOCKETS_PREFIX + "alice001"]: JSON.stringify([
    {
      id: "dock0001",
      caseNumber: "90SCCR00147",
      plaintiff: "Ann",
      notes: "Alice's note",
      status: "Open",
      updated: T1,
    },
  ]),
  // Saved in the LP-99 envelope: both formats migrate.
  [DOCKETS_PREFIX + "bob00001"]: JSON.stringify({
    v: 2,
    data: [
      { id: "dock0002", caseNumber: "90sccr00147", defendant: "Bo", notes: "Bob's note", status: "Open", updated: T2 },
      { id: "dock0003", caseNumber: "90SCCC00001", plaintiff: "Cy", status: "Closed", updated: T1 },
    ],
  }),
};

describe("the migration from per-character dockets", () => {
  it("makes one case per case number: the newest entry's character leads, nothing is lost, the old keys go", () => {
    const kv = spyKV({ ...OLD });
    const cases = createCaseStore(kv);
    expect(cases.migrate()).toBe(true);
    const list = cases.list();
    expect(list).toHaveLength(2);
    const shared = cases.byNumber("90SCCR00147")!;
    expect(shared).toMatchObject({
      id: "c90sccr00147",
      caseNumber: "90sccr00147", // Bob's entry is newer, so its fields win
      lead: "bob00001",
      assigned: ["alice001"],
      plaintiff: "Ann", // a gap filled from Alice's entry
      defendant: "Bo",
      notes: "Bob's note\n\nAlice's note",
      updated: T2,
      created: T1,
    });
    expect(cases.byNumber("90SCCC00001")).toMatchObject({ lead: "bob00001", assigned: [], status: "Closed" });
    expect(kv.get(DOCKETS_PREFIX + "alice001")).toBeNull();
    expect(kv.get(DOCKETS_PREFIX + "bob00001")).toBeNull();
    expect(JSON.parse(kv.get(CASES_KEY)!).v).toBe(1);
  });

  it("runs once: dockets turning up later aren't brought in again", () => {
    const kv = memoryKV({ ...OLD });
    const cases = createCaseStore(kv);
    cases.migrate();
    kv.set(DOCKETS_PREFIX + "carol001", JSON.stringify([{ caseNumber: "90SCTC00009", updated: T3 }]));
    expect(cases.migrate()).toBe(false);
    expect(cases.list()).toHaveLength(2);
  });

  it("shows the cases before migrating without writing anything", () => {
    const kv = spyKV({ ...OLD });
    const dockets = createDocketStore(createCaseStore(kv));
    expect(dockets.list("alice001").map((d) => d.caseNumber)).toEqual(["90sccr00147"]);
    expect(dockets.list("bob00001")).toHaveLength(2);
    expect(kv.writes).toEqual([]);
  });

  it("sets aside an unreadable docket instead of losing it", () => {
    const kv = memoryKV({ ...OLD, [DOCKETS_PREFIX + "dave0001"]: "{broken" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    createCaseStore(kv).migrate();
    expect(kv.get(DOCKETS_PREFIX + "dave0001")).toBeNull();
    expect(listSetAside(kv)).toMatchObject([{ key: DOCKETS_PREFIX + "dave0001", raw: "{broken" }]);
    warn.mockRestore();
  });

  it("with no dockets, saves nothing", () => {
    const kv = spyKV();
    expect(createCaseStore(kv).migrate()).toBe(false);
    expect(kv.writes).toEqual([]);
  });

  it("gives the same ids on every device", () => {
    expect(caseIdFor("90SCCR00147")).toBe("c90sccr00147");
    expect(caseIdFor("90-SC CR 00147")).toBe("c90sccr00147");
    const a = casesFromDockets([["alice001", [{ caseNumber: "90SCCR00147", updated: T1 }]]]);
    const b = casesFromDockets([["bob00001", [{ caseNumber: "90SCCR00147", updated: T2 }]]]);
    expect(a[0].id).toBe(b[0].id);
  });
});

describe("deleting a character (LP-4)", () => {
  it("takes them off their cases instead of deleting them; a case they led needs a new lead", () => {
    const kv = memoryKV({ ...OLD });
    const cases = createCaseStore(kv);
    cases.migrate();
    const stores = {
      characters: createCharacterStore(kv),
      dockets: createDocketStore(cases),
      portfolio: createPortfolioStore(kv),
    };
    deleteCharacter("bob00001", stores);
    const shared = cases.byNumber("90SCCR00147")!;
    expect(shared).toMatchObject({ lead: null, assigned: ["alice001"] });
    expect(needsLead(shared)).toBe(true);
    // Bob's other case stays too, with nobody on it.
    expect(cases.byNumber("90SCCC00001")).toMatchObject({ lead: null, assigned: [] });
    expect(stores.dockets.list("bob00001")).toEqual([]);
    expect(stores.dockets.list("alice001")).toHaveLength(1);
  });
});

describe("the docket view over cases", () => {
  const setup = () => {
    const cases = createCaseStore(memoryKV());
    return { cases, dockets: createDocketStore(cases) };
  };

  it("lists only the docket fields, sorted as before", () => {
    const { dockets } = setup();
    dockets.save("alice001", { caseNumber: "90SCCR00002", status: "Closed" });
    dockets.save("alice001", { caseNumber: "90SCCR00001", nextDate: "1990-10-20" });
    const list = dockets.list("alice001");
    expect(list.map((d) => d.caseNumber)).toEqual(["90SCCR00001", "90SCCR00002"]);
    expect(Object.keys(list[0]).sort()).toEqual(["caseNumber", "id", "nextDate", "status", "updated"]);
  });

  it("saving a case number the firm already has puts the character on that case", () => {
    const { cases, dockets } = setup();
    dockets.save("alice001", { caseNumber: "90SCCR00147", plaintiff: "Ann" });
    dockets.save("bob00001", { caseNumber: "90sccr00147", defendant: "Bo" });
    expect(cases.list()).toHaveLength(1);
    expect(cases.list()[0]).toMatchObject({ lead: "alice001", assigned: ["bob00001"], defendant: "Bo" });
    expect(() => dockets.save("bob00001", { caseNumber: "90SCCR00147" })).toThrow(/already on this docket/);
  });

  it("removing a case takes the character off it, and deletes it when nobody's left", () => {
    const { cases, dockets } = setup();
    const d = dockets.save("alice001", { caseNumber: "90SCCR00147" })!;
    dockets.save("bob00001", { caseNumber: "90SCCR00147" });
    dockets.remove("alice001", d.id);
    expect(cases.list()[0]).toMatchObject({ lead: null, assigned: ["bob00001"] });
    dockets.remove("bob00001", d.id);
    expect(cases.list()).toEqual([]);
  });

  it("upsert keeps fields the patch doesn't mention", () => {
    const { dockets } = setup();
    dockets.save("alice001", { caseNumber: "90SCCR00147", plaintiff: "Ann", notes: "Keep me" });
    dockets.upsert("alice001", { caseNumber: "90SCCR00147", defendant: "Bo" });
    expect(dockets.findByCase("alice001", "90sccr00147")).toMatchObject({
      plaintiff: "Ann",
      defendant: "Bo",
      notes: "Keep me",
    });
  });
});

describe("cases from two devices", () => {
  const c = (over: Partial<Case>): Case => ({
    id: "abcd1234",
    caseNumber: "90SCCR00147",
    status: "Open",
    updated: T1,
    deadlines: [],

    exhibits: [],
    created: T1,
    lead: "alice001",
    assigned: [],
    ...over,
  });

  it("the same case number is one case: the newer copy's fields win, everyone stays on it", () => {
    const [one] = unifyCases(
      [c({ id: "aaaa1111", plaintiff: "Ann", updated: T1 })],
      [c({ id: "bbbb2222", lead: "bob00001", defendant: "Bo", updated: T2 })],
    );
    expect(one).toMatchObject({
      id: "aaaa1111", // the first list's id
      lead: "bob00001",
      assigned: ["alice001"],
      plaintiff: "Ann",
      defendant: "Bo",
      updated: T2,
    });
  });
});

describe("sync and backup", () => {
  beforeEach(() => {
    localStorage.clear();
    sync.__resetForTests();
  });
  afterEach(() => localStorage.clear());

  it("a sync copy from before LP-4 (dockets inside characters) is read as cases, matching this browser's", () => {
    localStorage.setItem(DOCKETS_PREFIX + "alice001", OLD[DOCKETS_PREFIX + "alice001"]);
    localStorage.setItem("lawapp_chars", JSON.stringify([{ id: "alice001", name: "Alice" }]));
    runMigrations();
    const oldServer = {
      characters: [
        { id: "alice001", name: "Alice", dockets: JSON.parse(OLD[DOCKETS_PREFIX + "alice001"]) },
        { id: "bob00001", name: "Bob", dockets: [{ caseNumber: "90SCCR00147", defendant: "Bo", updated: T2 }] },
      ],
    };
    const { doc } = sync.resolve(oldServer, null);
    expect(doc.cases).toHaveLength(1);
    expect(doc.cases[0]).toMatchObject({ id: "c90sccr00147", defendant: "Bo" });
    expect(new Set([doc.cases[0].lead, ...doc.cases[0].assigned])).toEqual(new Set(["alice001", "bob00001"]));
  });

  it("the sync copy carries the cases next to the characters", () => {
    localStorage.setItem(CASES_KEY, JSON.stringify({ v: 1, data: [{ caseNumber: "90SCCR00147", lead: "alice001" }] }));
    expect(sync.snapshot().cases).toMatchObject([{ caseNumber: "90SCCR00147", lead: "alice001" }]);
    expect(caseStore().list()).toHaveLength(1);
  });

  it("cases are in the full backup and its counts, old dockets counted for an old backup", () => {
    const kv = memoryKV();
    const cases = createCaseStore(kv);
    cases.save({ caseNumber: "90SCCR00147", lead: "alice001" });
    const backup = makeBackup(kv);
    expect(Object.keys(backup.data)).toContain(CASES_KEY);
    expect(countsOf(backup.data).dockets).toBe(1);
    expect(countsOf({ ...OLD }).dockets).toBe(3);
  });
});

describe("the Case File's search and checks (LP-101)", () => {
  const mk = (over: Partial<Case>): Case => ({
    id: "abcd1234",
    caseNumber: "90SCCR00001",
    status: "Open",
    updated: T1,
    deadlines: [],

    exhibits: [],
    created: T1,
    lead: "alice001",
    assigned: [],
    ...over,
  });
  const LIST = [
    mk({ id: "case0001", caseNumber: "90SCCR00002", plaintiff: "Ann Lee", status: "Closed" }),
    mk({ id: "case0002", caseNumber: "90SCCC00001", defendant: "Bo Day", lead: null, assigned: ["bob00001"] }),
    mk({ id: "case0003", caseNumber: "90SCCR00001", plaintiff: "Cy Ng", assigned: ["bob00001"] }),
  ];
  const ids = (l: Case[]) => l.map((c) => c.id);

  it("lists open cases first, then by case number", () => {
    expect(ids(filterCases(LIST, {}))).toEqual(["case0002", "case0003", "case0001"]);
  });

  it("searches case numbers and parties, ignoring case", () => {
    expect(ids(filterCases(LIST, { q: "ann" }))).toEqual(["case0001"]);
    expect(ids(filterCases(LIST, { q: "bo day" }))).toEqual(["case0002"]);
    expect(ids(filterCases(LIST, { q: "sccr" }))).toEqual(["case0003", "case0001"]);
  });

  it("filters by status, by needing a lead, and by character", () => {
    expect(ids(filterCases(LIST, { status: "Closed" }))).toEqual(["case0001"]);
    expect(ids(filterCases(LIST, { status: NEEDS_LEAD }))).toEqual(["case0002"]);
    expect(ids(filterCases(LIST, { charId: "bob00001" }))).toEqual(["case0002", "case0003"]);
    expect(ids(filterCases(LIST, { charId: "alice001", q: "cy" }))).toEqual(["case0003"]);
  });

  it("needs a case number no other firm case has", () => {
    expect(caseProblem({ id: "", caseNumber: " " }, LIST)).toBe("A case needs a case number.");
    expect(caseProblem({ id: "", caseNumber: "90sccr00002" }, LIST)).toBe("90SCCR00002 is already a firm case.");
    expect(caseProblem({ id: "case0001", caseNumber: "90SCCR00002" }, LIST)).toBeNull();
    expect(caseProblem({ id: "", caseNumber: "90SCCR00099" }, LIST)).toBeNull();
  });
});
