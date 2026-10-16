// AC 28: segments()/layout() match the reference renderSections/renderList grouping.
import { describe, expect, it } from "vitest";
import { ALL_FORMS, getForm } from "@/data";
import { layout, segments, type LayoutItem } from "@/lib/formState";
import { compile, fields } from "@/lib/template";
import type { Entry } from "@/lib/types";
import { refRenderSections, type ItemRecord, type SegmentRecord } from "./layoutOracle";
import { hasOracle, paritySuite, refTemplate } from "./oracle";

function records(items: LayoutItem[]): ItemRecord[] {
  return items.map((it): ItemRecord => {
    switch (it.kind) {
      case "field":
        return { kind: "field", label: it.field.label };
      case "checklist":
        return {
          kind: "checklist",
          rows: it.rows.map((r) => ({ check: r.check.label, text: r.text, sub: r.sub, details: r.details.map((d) => d.label) })),
        };
      case "block":
        return { kind: "block", name: it.entry.block.name, items: records(layout(it.entry.fields)) };
      case "cond":
        return { kind: "cond", name: it.entry.cond.name, items: records(layout(it.entry.fields)) };
    }
  });
}

function ours(html: string): SegmentRecord[] {
  return segments(fields(compile(html))).map((s) => ({ name: s.name, items: records(layout(s.entries)) }));
}

function entriesOf(id: string): Entry[] {
  return fields(compile(getForm(id)!.html));
}

describe("segments", () => {
  it("criminal-arraignment has Case details plus its 6 section markers", () => {
    expect(segments(entriesOf("criminal-arraignment")).map((s) => s.name)).toEqual([
      "Case details",
      "Charges",
      "Evidence",
      "Sentencing",
      "Bail recommendations",
      "Detention",
      "Verification",
    ]);
  });

  it("drops empty segments", () => {
    expect(segments([{ section: "A" }, { section: "B" }]).map((s) => s.name)).toEqual([]);
  });

  it("stores the arraignment rows", () => {
    expect(ours(getForm("criminal-arraignment")!.html)).toMatchSnapshot();
  });
});

describe.skipIf(!hasOracle)(paritySuite("layout parity with the reference loop"), () => {
  for (const id of ["criminal-arraignment", "civil-proof-of-service"]) {
    it(`${id} (has checklists)`, () => {
      const html = getForm(id)!.html;
      const ref = refRenderSections(refTemplate!.fields(refTemplate!.compile(html)));
      const mine = ours(html);
      expect(mine).toEqual(ref);
      expect(JSON.stringify(mine)).toContain('"kind":"checklist"');
    });
  }

  for (const form of ALL_FORMS) {
    it(form.id, () => {
      const ref = refRenderSections(refTemplate!.fields(refTemplate!.compile(form.html)));
      expect(ours(form.html)).toEqual(ref);
    });
  }
});
