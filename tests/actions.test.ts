// Next actions on cases (LP-170): cleaning, the open and done lists, overdue,
// and keeping them through a case's save, merge (sync) and backup.
import { describe, expect, it } from "vitest";
import { cleanAction, cleanActions, doneActions, isOverdue, MAX_ACTIONS, openActions } from "@/lib/actions";
import { CASES_KEY, cleanCase, createCaseStore, unifyCases } from "@/lib/cases";
import { makeBackup } from "@/lib/backup";
import { memoryKV } from "@/lib/storage";
import type { CaseAction } from "@/lib/types";

const a = (over: Partial<CaseAction>): CaseAction => ({ id: "act00001", title: "Call the client", ...over });

describe("cleaning an action", () => {
  it("keeps a title, an owner id, a due date and done", () => {
    expect(cleanAction({ id: "act00001", title: " Call ", owner: "alice001", due: "1990-10-25", done: true })).toEqual({
      id: "act00001",
      title: "Call",
      owner: "alice001",
      due: "1990-10-25",
      done: true,
    });
  });

  it("drops one with no title, and anything that isn't valid", () => {
    expect(cleanAction({ title: "  " })).toBeNull();
    expect(cleanAction("Call")).toBeNull();
    const c = cleanAction({ title: "Call", owner: "<b>", due: "25/10/1990", done: "yes" })!;
    expect(c).toEqual({ id: expect.any(String), title: "Call" });
  });

  it("drops repeated ids and caps the list", () => {
    expect(cleanActions([a({}), a({ title: "Again" })])).toEqual([a({})]);
    const many = Array.from({ length: MAX_ACTIONS + 5 }, (_, i) => ({ title: "Task " + i }));
    expect(cleanActions(many)).toHaveLength(MAX_ACTIONS);
    expect(cleanActions(null)).toEqual([]);
  });
});

describe("open and done", () => {
  const list = [
    a({ id: "nodate01", title: "No date" }),
    a({ id: "later001", title: "Later", due: "1990-11-01" }),
    a({ id: "done0001", title: "Done", due: "1990-10-01", done: true }),
    a({ id: "sooner01", title: "Sooner", due: "1990-10-20" }),
  ];

  it("lists open ones soonest first, undated last, and done ones apart", () => {
    expect(openActions(list).map((x) => x.id)).toEqual(["sooner01", "later001", "nodate01"]);
    expect(doneActions(list).map((x) => x.id)).toEqual(["done0001"]);
  });

  it("is overdue only when open and past its due date", () => {
    expect(isOverdue(a({ due: "1990-10-18" }), "1990-10-19")).toBe(true);
    expect(isOverdue(a({ due: "1990-10-19" }), "1990-10-19")).toBe(false);
    expect(isOverdue(a({ due: "1990-10-18", done: true }), "1990-10-19")).toBe(false);
    expect(isOverdue(a({}), "1990-10-19")).toBe(false);
  });
});

describe("actions on a case", () => {
  it("a case keeps its actions, and an existing case has none", () => {
    expect(cleanCase({ caseNumber: "90SCCR00147", actions: [a({})] }).actions).toEqual([a({})]);
    expect(cleanCase({ caseNumber: "90SCCR00147" })).not.toHaveProperty("actions");
  });

  it("two copies of a case keep every action; the newer copy's version of one wins", () => {
    const base = cleanCase({ id: "case0001", caseNumber: "90SCCR00147", lead: "alice001" });
    const older = {
      ...base,
      updated: "2026-10-01T00:00:00.000Z",
      actions: [a({}), a({ id: "act00002", title: "Old" })],
    };
    const newer = { ...base, updated: "2026-10-02T00:00:00.000Z", actions: [a({ done: true })] };
    expect(unifyCases([older], [newer])[0].actions).toEqual([a({ done: true }), a({ id: "act00002", title: "Old" })]);
  });

  it("are in the backup with their case", () => {
    const kv = memoryKV();
    createCaseStore(kv).save({ caseNumber: "90SCCR00147", lead: "alice001", actions: [a({ owner: "alice001" })] });
    const saved = JSON.parse(makeBackup(kv).data[CASES_KEY] as string) as { data: Array<{ actions: unknown }> };
    expect(saved.data[0].actions).toEqual([a({ owner: "alice001" })]);
  });
});
