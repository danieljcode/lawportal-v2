// The charge calculator's list and totals (LP-218), on a small code of its own.
import { describe, expect, it } from "vitest";
import {
  addCharge,
  CHARGE_LIST_KEY,
  chargeListText,
  chargeTotals,
  readChargeList,
  setCount,
  timeText,
  writeChargeList,
} from "@/lib/chargeList";
import type { Charge, PenalCode } from "@/lib/penalCode";
import { memoryKV } from "@/lib/storage";

const charge = (c: Partial<Charge> & Pick<Charge, "section" | "title">): Charge => ({
  chapter: "Test",
  class: "Misdemeanor",
  description: "",
  status: "unchanged",
  ...c,
});

const CODE: PenalCode = {
  title: "Test code",
  updated: "2026-11-07",
  charges: [
    charge({ section: "PC 1", title: "Assault", jail: 10, min: 8, max: 13, fine: 300 }),
    charge({ section: "PC 2", title: "Speeding", class: "Infraction", jail: 0, min: 0, max: 0, fine: 150 }),
    charge({ section: "PC 3", title: "Murder", class: "Capital", min: 1000 }),
    charge({ section: "PC 4", title: "Fraud", class: "Felony", min: 12, max: 24, fine: 1000 }),
    charge({ section: "PC 5", title: "Loitering", jail: 2 }),
  ],
};

describe("the charge list", () => {
  it("adds a charge once and counts repeats, from 1 to 99", () => {
    let list = addCharge([], "PC 1");
    list = addCharge(list, "PC 1");
    list = addCharge(list, "PC 2");
    expect(list).toEqual([
      { section: "PC 1", count: 2 },
      { section: "PC 2", count: 1 },
    ]);
    expect(setCount(list, "PC 1", 0)[0].count).toBe(1);
    expect(setCount(list, "PC 1", 500)[0].count).toBe(99);
  });

  it("saves and reads back, dropping charges no longer in the code, repeats and bad counts", () => {
    const kv = memoryKV();
    expect(writeChargeList([{ section: "PC 1", count: 3 }], kv)).toBe(true);
    expect(readChargeList(kv, CODE)).toEqual([{ section: "PC 1", count: 3 }]);
    kv.set(
      CHARGE_LIST_KEY,
      JSON.stringify([{ section: "PC 9", count: 1 }, { section: "PC 2", count: "x" }, { section: "PC 2" }, null]),
    );
    expect(readChargeList(kv, CODE)).toEqual([{ section: "PC 2", count: 1 }]);
    kv.set(CHARGE_LIST_KEY, "{");
    expect(readChargeList(kv, CODE)).toEqual([]);
  });
});

describe("the totals", () => {
  it("add up time, the range and fines, times each count", () => {
    const t = chargeTotals(
      [
        { section: "PC 1", count: 2 },
        { section: "PC 5", count: 1 },
      ],
      CODE,
    );
    expect(t).toMatchObject({ jail: 22, min: 18, max: 28, fine: 600, counted: 3, discretion: [] });
    expect(timeText(t)).toBe("22 months (range 18–28 months)");
  });

  it("list the judge's discretion charges apart, still adding their fines", () => {
    const t = chargeTotals(
      [
        { section: "PC 3", count: 1 },
        { section: "PC 4", count: 2 },
      ],
      CODE,
    );
    expect(t.counted).toBe(0);
    expect(timeText(t)).toBe("");
    expect(t.fine).toBe(2000);
    expect(t.discretion.map((c) => c.section)).toEqual(["PC 3", "PC 4"]);
  });

  it("say No jail when the set time is nothing, and drop the range when there is none", () => {
    expect(timeText(chargeTotals([{ section: "PC 2", count: 2 }], CODE))).toBe("No jail");
    expect(timeText(chargeTotals([{ section: "PC 5", count: 1 }], CODE))).toBe("2 months");
  });

  it("copy as plain text, ready for a filing or Discord", () => {
    expect(
      chargeListText(
        [
          { section: "PC 1", count: 2 },
          { section: "PC 3", count: 1 },
        ],
        CODE,
      ),
    ).toBe(
      [
        "Charges:",
        "2 × PC 1 Assault",
        "1 × PC 3 Murder",
        "Time: 20 months (range 16–26 months)",
        "Fine: $600",
        "Judge's discretion: PC 3 Murder (up to life)",
      ].join("\n"),
    );
    expect(chargeListText([{ section: "PC 4", count: 1 }], CODE)).toBe(
      ["Charges:", "1 × PC 4 Fraud", "Fine: $1,000", "Judge's discretion: PC 4 Fraud"].join("\n"),
    );
    expect(chargeListText([], CODE)).toBe("");
  });
});
