// @vitest-environment jsdom
// AC 7: user values never become markup.
import { describe, expect, it } from "vitest";
import { compile, render } from "@/lib/template";

const TEMPLATE = [
  "<p>{{Text|TEXT}}</p>",
  "<p>{{Textarea:textarea|TEXTAREA}}</p>",
  "<ul>{{List:list|<li>LIST</li>}}</ul>",
  "{{Paras:paras:text-align:justify|<p>PARAS</p>}}",
  "{{Spoiler:spoiler|SPOILER}}",
  "<p>{{Select:select:One;Two|SELECT}}</p>",
  "<p>{{Number:number|0}}</p>",
  "<p>{{Image:image|IMAGE}}</p>",
  "<p>{{Url:url|URL}}</p>",
  "<p>{{Date:date:long|DATE}}</p>",
].join("\n");

const LABELS = ["Text", "Textarea", "List", "Paras", "Spoiler", "Select", "Number", "Image", "Url", "Date"];
const PAYLOAD = `<img src=x onerror=alert(1)>"'&`;
const JS_URL = "javascript:alert(1)";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function assertInert(out: string) {
  expect(out).not.toContain("<img src=x");
  const doc = parse(out);
  for (const el of Array.from(doc.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      expect(attr.name.toLowerCase().startsWith("on"), `${el.tagName} has ${attr.name}`).toBe(false);
    }
  }
  expect(doc.querySelector('img[src="x"]')).toBeNull();
  for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
    expect(a.getAttribute("href")).toMatch(/^https?:\/\//i);
  }
  for (const img of Array.from(doc.querySelectorAll("img[src]"))) {
    expect(img.getAttribute("src")).toMatch(/^https?:\/\//i);
  }
  return doc;
}

describe("XSS", () => {
  const tree = compile(TEMPLATE);

  it("escapes an HTML payload in every field type", () => {
    const values = Object.fromEntries(LABELS.map((l) => [l, PAYLOAD]));
    for (const highlight of [false, true]) {
      const doc = assertInert(render(tree, values, { highlight }));
      expect(doc.body.textContent).toContain(`<img src=x onerror=alert(1)>"'&`);
    }
  });

  it("keeps javascript: URLs as text for url and image fields", () => {
    const out = render(tree, { Url: JS_URL, Image: JS_URL });
    const doc = assertInert(out);
    for (const el of Array.from(doc.querySelectorAll("*"))) {
      for (const attr of Array.from(el.attributes)) expect(attr.value).not.toContain("javascript:");
    }
    expect(doc.body.textContent?.split(JS_URL).length).toBe(3);
  });
});
