// The Ledger's time entries (LP-32): cleaning, hours, saving, order, filters, totals and the route.
import { beforeEach, describe, expect, it } from "vitest";
import {
  cleanEntry,
  createTimeStore,
  filterEntries,
  parseHours,
  totalHours,
  type TimeEntry,
  type TimeStore,
} from "@/lib/ledger";
import { memoryKV } from "@/lib/storage";
import { hashFor, pageTitle, parseHash } from "@/shell/useRoute";

const T0 = "2026-10-29T10:00:00.000Z";
const base = { caseId: "case0001", character: "char0001", date: "1990-10-29", hours: 1, activity: "court" as const };

describe("parseHours", () => {
  it("rounds to a tenth and keeps 0.1 to 24", () => {
    expect(parseHours("1.25")).toBe(1.3);
    expect(parseHours(0.1)).toBe(0.1);
    expect(parseHours("24")).toBe(24);
    expect(parseHours("0.04")).toBeNull();
    expect(parseHours(24.1)).toBeNull();
    expect(parseHours("")).toBeNull();
    expect(parseHours("two")).toBeNull();
  });
});

describe("cleanEntry", () => {
  it("keeps a complete entry and drops an empty note", () => {
    expect(cleanEntry({ ...base, id: "time0001", note: "  ", created: T0 })).toEqual({
      ...base,
      id: "time0001",
      created: T0,
      updated: T0,
    });
  });

  it("refuses an entry without a case, character, game date or hours", () => {
    expect(cleanEntry({ ...base, caseId: "" })).toBeNull();
    expect(cleanEntry({ ...base, character: undefined })).toBeNull();
    expect(cleanEntry({ ...base, date: "29/10/1990" })).toBeNull();
    expect(cleanEntry({ ...base, hours: 0 })).toBeNull();
  });

  it("files an unknown activity as research", () => {
    expect(cleanEntry({ ...base, activity: "golf" })?.activity).toBe("research");
  });
});

describe("the time store", () => {
  let store: TimeStore;
  beforeEach(() => {
    store = createTimeStore(memoryKV());
  });

  it("saves newest date first, edits in place and deletes", () => {
    const a = store.save({ ...base, date: "1990-10-01", activity: "research" });
    const b = store.save({ ...base, date: "1990-10-20", hours: 2.5 });
    expect(store.list().map((e) => e.id)).toEqual([b.id, a.id]);
    store.save({ ...a, hours: 3 });
    expect(store.get(a.id)).toMatchObject({ hours: 3, created: a.created });
    store.remove(b.id);
    expect(store.list().map((e) => e.id)).toEqual([a.id]);
  });

  it("says what's missing", () => {
    expect(() => store.save({ ...base, hours: 0 })).toThrow(/hours/);
    expect(() => store.save({ ...base, caseId: "" })).toThrow(/case/);
  });
});

describe("filters and totals", () => {
  const e = (id: string, o: Partial<TimeEntry>) => ({ ...cleanEntry({ ...base, id, created: T0 })!, ...o });
  const list = [
    e("time0001", { date: "1990-10-01", hours: 0.1 }),
    e("time0002", { date: "1990-10-15", hours: 0.2, character: "char0002" }),
    e("time0003", { date: "1990-10-31", hours: 1.4, caseId: "case0002" }),
  ];

  it("filter by case, character and an inclusive date range", () => {
    const ids = (f: Parameters<typeof filterEntries>[1]) => filterEntries(list, f).map((x) => x.id);
    expect(ids({})).toEqual(["time0001", "time0002", "time0003"]);
    expect(ids({ caseId: "case0001" })).toEqual(["time0001", "time0002"]);
    expect(ids({ character: "char0002" })).toEqual(["time0002"]);
    expect(ids({ from: "1990-10-15", to: "1990-10-31" })).toEqual(["time0002", "time0003"]);
  });

  it("total to the tenth without float drift", () => {
    expect(totalHours(list.slice(0, 2))).toBe(0.3);
    expect(totalHours(list)).toBe(1.7);
    expect(totalHours([])).toBe(0);
  });
});

describe("the route", () => {
  it("opens at #ledger", () => {
    const r = parseHash("#ledger");
    expect(r).toEqual({ program: "ledger" });
    expect(hashFor(r)).toBe("#ledger");
    expect(pageTitle(r, null)).toBe("Ledger");
  });
});
