// Required fields (LP-87): which empty fields block a copy, the default rule
// port-forms applies, and that every form's list names its own fields.
import { describe, expect, it } from "vitest";
import { ALL_FORMS } from "@/data";
import forms from "@/data/forms.json";
import { EXTRA_FORMS } from "@/data/extra-forms";
import { missingRequired } from "@/lib/formState";
import { compile, fields } from "@/lib/template";
import type { Entry, Field } from "@/lib/types";
import { requiredFields } from "../scripts/required-fields.mjs";

const entriesOf = (html: string) => fields(compile(html));

function allFields(entries: Entry[], out: Field[] = []): Field[] {
  for (const e of entries) {
    if ("field" in e) out.push(e.field);
    else if ("fields" in e) allFields(e.fields, out);
  }
  return out;
}

describe("missingRequired", () => {
  const html =
    "{{Case number}} {{Plaintiff name}} {{Notes}}" +
    "{{-- Parties}}{{#Defendants|2}}{{Defendant name}}{{/Defendants}}" +
    "{{?Service|off}}{{Served party}}{{/Service}}" +
    "{{-- Signature}}{{Name@name}} {{Agree:check}}";
  const entries = entriesOf(html);
  const required = ["Case number", "Plaintiff name", "Defendant name", "Served party", "Name", "Agree"];

  it("lists empty required fields in form order, with their section and input key", () => {
    const values = { "Case number": "90SCCV00123", "#Defendants": [{ "Defendant name": "Bo Day" }, {}] };
    expect(missingRequired(entries, values, required)).toEqual([
      { label: "Plaintiff name", where: "", key: "Plaintiff name", section: "Case details" },
      { label: "Defendant name", where: "Defendant 2", key: "Defendants1-Defendant name", section: "Parties" },
      { label: "Name", where: "", key: "Name", section: "Signature" },
    ]);
  });

  it("treats whitespace as empty and ignores fields that aren't required", () => {
    const m = missingRequired(entries, { "Case number": "   ", "Plaintiff name": "Ann", Name: "Jo" }, required);
    expect(m.map((x) => x.label)).toEqual(["Case number"]);
  });

  it("checks an optional section only while it's switched on", () => {
    const filled = { "Case number": "1", "Plaintiff name": "A", Name: "J" };
    expect(missingRequired(entries, filled, required).map((x) => x.label)).toEqual([]);
    expect(missingRequired(entries, { ...filled, "?Service": true }, required).map((x) => x.label)).toEqual([
      "Served party",
    ]);
  });

  it("never requires a tick box, and a form with no list requires nothing", () => {
    expect(missingRequired(entries, {}, ["Agree"])).toEqual([]);
    expect(missingRequired(entries, {}, undefined)).toEqual([]);
  });
});

describe("the default rule (scripts/required-fields.mjs)", () => {
  it("requires the case number, the parties and the character's name and signature", () => {
    expect(
      requiredFields(
        "{{Case number=YYSCCR00XXX|XXX}} {{Plaintiff name}} {{Defendant name>strong}} {{Court|SAN ANDREAS COURT}}" +
          "{{#Items}}{{Appellant name}}{{/Items}} {{Judge name@name}} {{Judge signature@signature:image}}" +
          "{{Filer title@title}} {{Plaintiff name}} {{Respondent name:check}}",
      ),
    ).toEqual(["Case number", "Plaintiff name", "Defendant name", "Appellant name", "Judge name", "Judge signature"]);
  });

  it("is what forms.json holds (re-run port-forms after changing it)", () => {
    for (const f of forms as Array<{ id: string; html: string; required?: string[] }>) {
      expect([f.id, f.required]).toEqual([f.id, requiredFields(f.html)]);
    }
  });
});

describe("every form's required list", () => {
  it.each(ALL_FORMS.map((f) => [f.id, f] as const))("%s names its own fields (no tick boxes)", (_, form) => {
    const byLabel = new Map(allFields(entriesOf(form.html)).map((f) => [f.label, f]));
    for (const label of form.required ?? []) {
      expect(byLabel.has(label), label).toBe(true);
      expect(byLabel.get(label)!.type, label).not.toBe("check");
    }
  });

  it("every Additional Template has one", () => {
    for (const f of EXTRA_FORMS) expect(f.required?.length, f.id).toBeGreaterThan(0);
  });
});
