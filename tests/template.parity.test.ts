// AC 5: differential parity of our engine against the reference js_template.js.
import { describe, expect, it } from "vitest";
import { ALL_FORMS, getForm } from "@/data";
import { compile, fields, render } from "@/lib/template";
import type { Entry } from "@/lib/types";
import { fixture } from "./fixtures";
import { hasOracle, refTemplate, type RefEntry } from "./oracle";

/** Comparable form of a fields() list from either engine. */
function normalize(entries: readonly (Entry | RefEntry)[]): unknown[] {
  return entries.map((e) => {
    if ("section" in e) return { section: e.section };
    if ("field" in e) {
      const f = e.field;
      return {
        field: {
          label: f.label,
          type: f.type,
          options: f.options,
          fallback: f.fallback,
          prefill: f.prefill,
          character: f.character,
          wrap: f.wrap,
          line: f.line,
          text: f.text,
          indent: f.indent,
        },
      };
    }
    if ("block" in e) return { block: e.block.name, count: e.block.count, fields: normalize(e.fields) };
    return { cond: e.cond.name, on: e.cond.on, fields: normalize(e.fields) };
  });
}

describe.skipIf(!hasOracle)("template engine parity with the reference", () => {
  // Compiled lazily inside each test, so collection never touches a missing oracle.
  function both(html: string) {
    const ref = refTemplate!;
    const ours = compile(html);
    const theirs = ref.compile(html);
    const refEntries = ref.fields(theirs);
    return { ref, ours, theirs, refEntries };
  }

  for (const form of ALL_FORMS) {
    describe(form.id, () => {
      it("fields() matches", () => {
        const { ours, refEntries } = both(form.html);
        expect(normalize(fields(ours))).toEqual(normalize(refEntries));
      });

      it("renders empty values identically (highlight off and on)", () => {
        const { ref, ours, theirs } = both(form.html);
        expect(render(ours, {}, {})).toBe(ref.render(theirs, {}, {}));
        expect(render(ours, {}, { highlight: true })).toBe(ref.render(theirs, {}, { highlight: true }));
      });

      for (const variant of ["A", "B"] as const) {
        it(`renders fixture ${variant} identically`, () => {
          const { ref, ours, theirs, refEntries } = both(form.html);
          const values = fixture(refEntries, variant);
          expect(render(ours, values, {})).toBe(ref.render(theirs, values, {}));
          expect(render(ours, values, { highlight: true })).toBe(ref.render(theirs, values, { highlight: true }));
        });
      }
    });
  }
});

// Runs without the oracle, so regressions are caught even if .agents/ is absent.
describe("template engine snapshot", () => {
  for (const id of ["criminal-arraignment", "misc-bail-application", "misc-order-decree"]) {
    it(id, () => {
      const form = getForm(id);
      expect(form).toBeDefined();
      const tree = compile(form!.html);
      expect(render(tree, {}, { highlight: true })).toMatchSnapshot("empty, highlighted");
      expect(render(tree, fixture(fields(tree), "A"), {})).toMatchSnapshot("fixture A");
    });
  }
});
