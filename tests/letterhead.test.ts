// The firm's letterhead on firm letters (LP-23): the store, the rendered block, and
// that court forms never carry it.
import { describe, expect, it } from "vitest";
import { ALL_FORMS } from "@/data";
import { createLetterheadStore, DEFAULT_LETTERHEAD, LETTERHEAD_KEY, validLetterhead } from "@/lib/letterhead";
import { memoryKV } from "@/lib/storage";
import { compile, render } from "@/lib/template";
import { BRANDING } from "@/branding";

const tree = compile('{{Letterhead@letterhead|<p style="text-align:center"><strong>FIRM NAME</strong></p>}}');
const full = {
  firmName: "Friedman & Associates",
  address: "1 Vinewood Blvd\n\nLos Santos",
  phone: "555-0100",
  email: "office@fa.example",
};

describe("letterhead store", () => {
  it("starts with the firm's name from the branding and nothing else", () => {
    const store = createLetterheadStore(memoryKV());
    expect(store.get()).toEqual({ firmName: BRANDING.firmName, address: "", phone: "", email: "" });
  });

  it("saves and reads back", () => {
    const kv = memoryKV();
    createLetterheadStore(kv).set(full);
    expect(createLetterheadStore(kv).get()).toEqual(full);
    expect(kv.get(LETTERHEAD_KEY)).toContain("1 Vinewood Blvd");
  });

  it("cleans bad data field by field and caps long values", () => {
    expect(validLetterhead(null)).toEqual(DEFAULT_LETTERHEAD);
    const clean = validLetterhead({ firmName: 42, address: "x".repeat(1000), phone: "1", email: ["e"] });
    expect(clean).toEqual({ firmName: BRANDING.firmName, address: "x".repeat(300), phone: "1", email: "" });
  });
});

describe("letterhead block", () => {
  it("shows the name, each address line, and phone · email", () => {
    expect(render(tree, {}, { letterhead: full })).toBe(
      '<p style="text-align:center"><strong>Friedman &amp; Associates</strong><br />\n' +
        "1 Vinewood Blvd<br />\nLos Santos<br />\n555-0100 · office@fa.example</p>",
    );
  });

  it("leaves out empty parts in the copied post but marks them in the preview", () => {
    const lh = { ...full, address: "", email: "" };
    expect(render(tree, {}, { letterhead: lh })).toBe(
      '<p style="text-align:center"><strong>Friedman &amp; Associates</strong><br />\n555-0100</p>',
    );
    const preview = render(tree, {}, { letterhead: lh, highlight: true });
    expect(preview).toContain('<mark class="unfilled" title="Letterhead">FIRM ADDRESS</mark>');
  });

  it("shows the fallback without a letterhead", () => {
    expect(render(tree, {}, {})).toBe('<p style="text-align:center"><strong>FIRM NAME</strong></p>');
  });

  it("escapes every part", () => {
    const payload = `<img src=x onerror=alert(1)>"'&`;
    const out = render(
      tree,
      {},
      { letterhead: { firmName: payload, address: payload, phone: payload, email: payload } },
    );
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});

describe("where the letterhead goes", () => {
  it("is only in the Firm Letters, never in a court form or another template", () => {
    const withIt = ALL_FORMS.filter((f) => f.html.includes("@letterhead")).map((f) => f.section);
    expect(withIt.length).toBeGreaterThan(0);
    expect(new Set(withIt)).toEqual(new Set(["Firm Letters"]));
  });
});
