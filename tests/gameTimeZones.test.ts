// Game time (LP-135) is New York time whatever the machine's time zone. CI runs
// in UTC, which hides a stray local-time call, so these cases run under other
// zones: one ahead of New York by a few hours, one by more than half a day.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gameNow } from "@/lib/custody";
import { formatDay, gameToday } from "@/lib/deadlines";
import { snapshotTime } from "@/lib/draftHistory";
import { todayDate } from "@/lib/formState";
import { caseNumberPattern, compile, fields, prefillValue } from "@/lib/template";
import type { Field } from "@/lib/types";

const field = (token: string): Field => {
  const e = fields(compile(token))[0];
  if (!e || !("field" in e)) throw new Error("no field in " + token);
  return e.field;
};

describe.each(["Europe/London", "Asia/Tokyo"])("with the machine on %s", (zone) => {
  const saved = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = zone;
  });
  afterAll(() => {
    process.env.TZ = saved;
  });

  it("really runs in that zone", () => {
    // 10 pm in New York is 2 am in London and 11 am in Tokyo; a local-time call would see those.
    expect(new Date("2026-10-26T02:00:00Z").getHours()).toBe(zone === "Europe/London" ? 2 : 11);
  });

  it("Sun 25 Oct 2026, 10 pm New York, is Sun 25 Oct 1990 everywhere", () => {
    const at = new Date("2026-10-26T02:00:00Z");
    expect(gameToday(at)).toBe("1990-10-25");
    expect(formatDay(gameToday(at))).toBe("Sun 25 Oct 1990");
    expect(prefillValue(field("{{Filed=today:date}}"), at)).toBe("1990-10-25");
    const entries = fields(compile("{{Filing date:date}}"));
    const s = todayDate(entries, { values: {}, autofilled: {}, derived: {} }, [], "Filing date", at);
    expect(s.values["Filing date"]).toBe("1990-10-25");
    expect(gameNow(at)).toBe("1990-10-25T22:00");
    expect(snapshotTime(at.toISOString())).toBe("Sun 25 Oct 1990, 22:00");
  });

  it("Sat 24 Oct 2026, 11:30 pm New York, is 24 Oct 1990", () => {
    const at = new Date("2026-10-25T03:30:00Z");
    expect(gameToday(at)).toBe("1990-10-24");
    expect(prefillValue(field("{{Filed=today:date}}"), at)).toBe("1990-10-24");
    expect(gameNow(at)).toBe("1990-10-24T23:30");
  });

  it("a case number made at 10 pm on New York's New Year's Eve starts with 90", () => {
    const at = new Date("2027-01-01T03:00:00Z");
    const f = field("{{Case number=YYSCCR00XXX}}");
    expect(prefillValue(f, at)).toBe("90SCCR00XXX");
    expect(caseNumberPattern(f, at)).toBe("90SCCR00XXX");
  });
});
