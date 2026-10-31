// Find (LP-95): one search over cases, contacts, filings, exhibits, invoices and time.
import { describe, expect, it } from "vitest";
import { cleanCase } from "@/lib/cases";
import { cleanContact } from "@/lib/contacts";
import { find, findIndex, MAX_PER_GROUP, type FindSources } from "@/lib/find";
import { cleanEntry } from "@/lib/ledger";
import { createInvoiceStore } from "@/lib/invoices";
import type { Filing } from "@/lib/filings";
import { EMPTY_STATE } from "@/lib/formState";
import { memoryKV } from "@/lib/storage";
import { hashFor, pageTitle, parseHash } from "@/shell/useRoute";

const T0 = "2026-10-29T10:00:00.000Z";

function sources(): FindSources {
  const smith = cleanCase({
    id: "case0001",
    caseNumber: "90SCCR00147",
    defendant: "John Smith",
    status: "Open",
    updated: T0,
    lead: "alice001",
    exhibits: [{ id: "exh00001", title: "Dashcam footage", description: "Unit 4 camera" }],
  });
  const time = [
    cleanEntry({
      id: "time0001",
      caseId: "case0001",
      character: "alice001",
      date: "1990-10-02",
      hours: 2,
      activity: "court",
      note: "Bail hearing",
      created: T0,
    })!,
  ];
  const invoices = createInvoiceStore(memoryKV());
  invoices.create({
    caseId: "case0001",
    caseNumber: "90SCCR00147",
    date: "1990-10-31",
    entries: time,
    rateOf: () => 100,
    nameOf: () => "Alice",
  });
  const filing = {
    id: "fil00001",
    at: T0,
    formId: "civil-complaint",
    formTitle: "Civil Complaint",
    charId: null,
    charName: "Alice Lawyer",
    caseNumber: "90SCCR00147",
    caseId: "case0001",
    via: "forum",
    state: EMPTY_STATE,
  } as Filing;
  return {
    cases: [smith],
    contacts: [cleanContact({ id: "con00001", name: "Judy Smithers", type: "client", phone: "555-0101" })!],
    filings: [filing],
    invoices: invoices.list(),
    time,
    nameOf: (id) => (id === "alice001" ? "Alice Lawyer" : "Someone"),
  };
}

describe("find", () => {
  const index = findIndex(sources());
  const kinds = (q: string) => find(index, q).map((g) => [g.kind, g.items.map((i) => i.title)]);

  it("groups what matches by type, partial words and any case", () => {
    expect(kinds("SMITH")).toEqual([
      ["case", ["90SCCR00147"]],
      ["contact", ["Judy Smithers"]],
    ]);
    expect(kinds("dashcam")).toEqual([["exhibit", ["Exhibit A: Dashcam footage"]]]);
    expect(kinds("bail")).toEqual([["time", ["Alice Lawyer · Court · 2.0 h"]]]);
    expect(kinds("fa-1990")).toEqual([["invoice", ["FA-1990-0001"]]]);
  });

  it("finds a case number with or without dashes, and needs every word", () => {
    const groups = (q: string) => find(index, q).map((g) => g.kind);
    expect(groups("90-SC-CR-00147")).toEqual(["case", "filing", "exhibit", "invoice", "time"]);
    expect(groups("90sccr00147 dashcam")).toEqual(["exhibit"]);
    expect(groups("smith dashcam")).toEqual([]);
    expect(find(index, "  ")).toEqual([]);
  });

  it("links each result to its program", () => {
    const hrefs = Object.fromEntries(find(index, "00147").map((g) => [g.kind, g.items[0].href]));
    expect(hrefs).toEqual({
      case: "#cases/case0001",
      filing: "#cases/case0001",
      exhibit: "#cases/case0001",
      invoice: "#ledger",
      time: "#ledger",
    });
  });

  it("lists at most MAX_PER_GROUP per group but counts them all, quickly", () => {
    const many = Array.from({ length: 3000 }, (_, i) =>
      cleanContact({ id: "con" + String(i).padStart(5, "0"), name: "Witness " + i, type: "witness" })!,
    );
    const big = findIndex({ ...sources(), contacts: many });
    const started = performance.now();
    const [g] = find(big, "witness");
    expect(performance.now() - started).toBeLessThan(100);
    expect(g.items).toHaveLength(MAX_PER_GROUP);
    expect(g.total).toBe(3000);
  });

  it("opens at #find", () => {
    expect(parseHash("#find")).toEqual({ program: "find" });
    expect(hashFor({ program: "find" })).toBe("#find");
    expect(pageTitle({ program: "find" }, null)).toBe("Find");
  });
});
