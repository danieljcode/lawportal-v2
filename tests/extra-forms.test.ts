// @vitest-environment jsdom
// AC 24 (unit part): the Additional Templates, with the four Firm Letters (LP-9).
import { describe, expect, it } from "vitest";
import { ALL_FORMS, COURTS, getForm } from "@/data";
import { EXTRA_FORMS } from "@/data/extra-forms";
import { fromHtml } from "@/lib/bbcode";
import { DEFENDANT_LABELS, formToDocketPatch, hasField, materializeBlocks, PLAINTIFF_LABELS } from "@/lib/formState";
import { compile, fields, render } from "@/lib/template";
import type { Entry, Field, Values } from "@/lib/types";

const SPEC: Record<string, { title: string; section: string; sections: string[]; headings: string[] }> = {
  "extra-general-petition": {
    title: "General Petition",
    section: "Petitions",
    sections: ["Court & Caption", "Petition", "Signature"],
    headings: ["PRAYER FOR RELIEF", "Respectfully submitted,"],
  },
  "extra-name-change": {
    title: "Petition for Name Change",
    section: "Petitions",
    sections: ["Court & Caption", "Name Change", "Signature"],
    headings: ["PETITION FOR CHANGE OF NAME", "PRAYER FOR RELIEF", "Respectfully submitted,"],
  },
  "extra-general-motion": {
    title: "General Motion",
    section: "Motions",
    sections: ["Court & Caption", "Motion", "Signature", "Certificate of Service"],
    headings: ["Respectfully submitted,", "CERTIFICATE OF SERVICE"],
  },
  "extra-interrogatories": {
    title: "Interrogatories",
    section: "Discovery",
    sections: ["Court & Caption", "Discovery Details", "Interrogatories", "Signature"],
    headings: ["Definitions and Instructions", "INTERROGATORIES", "Respectfully submitted,"],
  },
  "extra-subpoena": {
    title: "Subpoena",
    section: "Discovery",
    sections: ["Court & Caption", "Subpoena Details", "Items Demanded", "Signature"],
    headings: [
      "SUBPOENA",
      "Failure to obey this subpoena may be punished as contempt of court.",
      "Respectfully submitted,",
    ],
  },
  "extra-service-contract": {
    title: "Service Agreement",
    section: "Contracts",
    sections: ["Parties", "Services & Compensation", "Additional Clauses", "Signatures"],
    headings: [
      "SERVICES AGREEMENT",
      "Independent Contractor",
      "Governing Law",
      "Entire Agreement",
      "IN WITNESS WHEREOF",
    ],
  },
  "extra-engagement-letter": {
    title: "Engagement Letter",
    section: "Firm Letters",
    sections: ["Letterhead", "Client", "Engagement", "Signature", "Acceptance"],
    headings: ["Re: Engagement of legal services", "Scope of the representation", "ACKNOWLEDGED AND AGREED"],
  },
  "extra-retainer-agreement": {
    title: "Retainer Agreement",
    section: "Firm Letters",
    sections: ["Parties", "Fees", "Terms", "Signatures"],
    headings: ["RETAINER AGREEMENT", "Retainer.", "Payment terms.", "No guarantee."],
  },
  "extra-demand-letter": {
    title: "Demand Letter",
    section: "Firm Letters",
    sections: ["Letterhead", "Recipient", "Demand", "Signature"],
    headings: ["This firm represents", "we demand payment of", "without prejudice", "Yours faithfully,"],
  },
  "extra-representation-letter": {
    title: "Letter of Representation",
    section: "Firm Letters",
    sections: ["Letterhead", "Recipient", "Representation", "Signature"],
    headings: ["Please be advised that", "do not contact our client directly", "Sincerely,"],
  },
};

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

function allFields(entries: Entry[]): Field[] {
  return entries.flatMap((e) => ("field" in e ? [e.field] : "block" in e || "cond" in e ? allFields(e.fields) : []));
}

describe("Additional Templates", () => {
  it("adds ten forms after the 39 directory forms", () => {
    expect(ALL_FORMS).toHaveLength(49);
    expect(EXTRA_FORMS.map((f) => f.id)).toEqual(Object.keys(SPEC));
    expect(ALL_FORMS.slice(39).map((f) => f.id)).toEqual(Object.keys(SPEC));
    expect(new Set(ALL_FORMS.map((f) => f.id)).size).toBe(49);
    expect(COURTS).not.toContain("Additional Templates");
  });

  for (const form of EXTRA_FORMS) {
    describe(form.id, () => {
      const spec = SPEC[form.id];
      const tree = compile(form.html);
      const entries = fields(tree);

      it("has its court, section and title", () => {
        expect(form).toMatchObject({ court: "Additional Templates", section: spec.section, title: spec.title });
      });

      it("lists the D2 sections", () => {
        expect(entries.filter((e): e is { section: string } => "section" in e).map((e) => e.section)).toEqual(
          spec.sections,
        );
      });

      it("renders top-level text values and the required headings (HTML and BBCode)", () => {
        const values: Values = {};
        for (const e of entries) if ("field" in e && e.field.type === "text") values[e.field.label] = "VALUE";
        const html = render(tree, values);
        const bb = fromHtml(html, parse);
        expect(html).toContain("VALUE");
        expect(bb).toContain("VALUE");
        for (const h of spec.headings) {
          expect(html, h).toContain(h);
          expect(bb, h).toContain(h);
        }
        expect(bb).not.toContain("[table]");
      });

      it("uses the directory spoiler header", () => {
        const doc = parse(render(tree, {}));
        for (const header of doc.querySelectorAll(".ipsSpoiler_header"))
          expect(header.innerHTML).toBe("<span>Spoiler</span>");
        const raw = form.html.match(/<div class="ipsSpoiler_header">([\s\S]*?)<\/div>/g) || [];
        for (const h of raw) expect(h).toBe('<div class="ipsSpoiler_header"><span>Spoiler</span></div>');
      });

      it("never leaves a literal prefix followed by nothing", () => {
        for (const f of allFields(entries)) expect(f.fallback, f.label).not.toBe("");
        const empty = render(tree, materializeBlocks(entries, {}));
        if (form.html.includes("Bar No. ")) expect(empty).toContain("Bar No. __________");
        expect(empty).not.toMatch(/Bar No\. (<|$)/);
      });

      it("has no Division, Courthouse or Court division field", () => {
        const labels = allFields(entries).map((f) => f.label);
        for (const bad of ["Division", "Courthouse", "Court division"]) expect(labels).not.toContain(bad);
      });
    });
  }

  it("the five captioned forms carry the docket labels; the agreement doesn't", () => {
    for (const id of [
      "extra-general-petition",
      "extra-name-change",
      "extra-general-motion",
      "extra-interrogatories",
      "extra-subpoena",
    ]) {
      const entries = fields(compile(getForm(id)!.html));
      expect(hasField(entries, {}, "Case number"), id).toBe(true);
      expect(
        PLAINTIFF_LABELS.some((l) => hasField(entries, {}, l)),
        id,
      ).toBe(true);
      expect(hasField(entries, {}, "Filing date"), id).toBe(true);
    }
    for (const id of ["extra-general-motion", "extra-interrogatories", "extra-subpoena"]) {
      const entries = fields(compile(getForm(id)!.html));
      expect(
        DEFENDANT_LABELS.some((l) => hasField(entries, {}, l)),
        id,
      ).toBe(true);
    }
    expect(hasField(fields(compile(getForm("extra-service-contract")!.html)), {}, "Case number")).toBe(false);
  });

  describe("Firm Letters (LP-9)", () => {
    const LETTERS = [
      "extra-engagement-letter",
      "extra-retainer-agreement",
      "extra-demand-letter",
      "extra-representation-letter",
    ];
    const characterKeys = (id: string) =>
      Object.fromEntries(
        allFields(fields(compile(getForm(id)!.html)))
          .filter((f) => f.character)
          .map((f) => [f.label, f.character]),
      );

    it("sign off from the active character: name, title, bar number and signature", () => {
      for (const id of LETTERS) {
        expect(characterKeys(id), id).toMatchObject({
          Name: "name",
          Role: "title",
          "Bar number": "bar",
          Signature: "signature",
        });
      }
    });

    it("carry a case number for the case bar, and the representation letter both parties", () => {
      for (const id of LETTERS) expect(hasField(fields(compile(getForm(id)!.html)), {}, "Case number"), id).toBe(true);
      const rep = fields(compile(getForm("extra-representation-letter")!.html));
      expect(PLAINTIFF_LABELS.some((l) => hasField(rep, {}, l))).toBe(true);
      expect(DEFENDANT_LABELS.some((l) => hasField(rep, {}, l))).toBe(true);
    });

    it("use a letter date, not a filing date, so saving to the Case File records no filing", () => {
      for (const id of LETTERS) {
        const entries = fields(compile(getForm(id)!.html));
        expect(hasField(entries, {}, "Filing date"), id).toBe(false);
        const form = getForm(id)!;
        const res = formToDocketPatch(form, entries, { "Case number": "90SCCC00001", "Letter date": "1990-10-19" });
        // The court still comes from the case number's division code, as for every form.
        expect(res, id).toEqual({ patch: { caseNumber: "90SCCC00001", court: "San Andreas Civil Court" } });
      }
    });

    it("the retainer starts with fee defaults", () => {
      const prefills = Object.fromEntries(
        allFields(fields(compile(getForm("extra-retainer-agreement")!.html)))
          .filter((f) => f.prefill)
          .map((f) => [f.label, f.prefill]),
      );
      expect(prefills).toMatchObject({
        "Hourly rate": "$250 per hour",
        "Billing increment": "6 minutes",
        "Retainer amount": "$5,000",
        "Replenish below": "$1,000",
        "Payment terms": "Invoices are due within 14 days of receipt.",
      });
    });

    it("the demand letter's deadline defaults to 14 days out", () => {
      const f = allFields(fields(compile(getForm("extra-demand-letter")!.html))).find(
        (x) => x.label === "Response deadline",
      )!;
      expect(f).toMatchObject({ type: "date", prefill: "today+14" });
    });
  });

  it("Save to docket on extra-general-motion never writes a court", () => {
    const form = getForm("extra-general-motion")!;
    const res = formToDocketPatch(form, fields(compile(form.html)), {
      "Case number": "2026-CV-0042",
      "Plaintiff name": "Ann",
      "Defendant name": "Bob",
    });
    expect(res).toEqual({ patch: { caseNumber: "2026-CV-0042", plaintiff: "Ann", defendant: "Bob" } });
  });
});
