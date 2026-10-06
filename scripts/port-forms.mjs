// One-off: port the directory forms from the reference client into src/data/forms.json.
// DES §Data steps 1–4. The source is JSON after `window.FORMS =`, so it is parsed, never evaluated.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkTemplateHtml } from "./template-safety.mjs";
import { unwrapBlockedLinks } from "./scrub-links.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, ".agents", "reference", "jsa", "js_forms.data.js");
const target = path.join(root, "src", "data", "forms.json");
const EXPECTED = 39;
const KEYS = ["id", "court", "section", "title", "html"];

function fail(msg) {
  console.error(`port-forms: ${msg}`);
  process.exit(1);
}

let text;
try {
  text = readFileSync(source, "utf8");
} catch (err) {
  fail(`cannot read ${source}: ${err.message}`);
}

const start = text.indexOf("[");
const end = text.lastIndexOf("]");
if (start < 0 || end <= start) fail("no JSON array found in the source file");

let forms;
try {
  forms = JSON.parse(text.slice(start, end + 1));
} catch (err) {
  fail(`the forms array is not valid JSON: ${err.message}`);
}

if (!Array.isArray(forms)) fail("the forms data is not an array");
if (forms.length !== EXPECTED) fail(`expected ${EXPECTED} forms, found ${forms.length}`);

const ids = new Set();
forms.forEach((form, i) => {
  if (!form || typeof form !== "object") fail(`form #${i} is not an object`);
  for (const key of KEYS) {
    if (typeof form[key] !== "string") fail(`form #${i} (${form.id}) has a non-string "${key}"`);
  }
  if (ids.has(form.id)) fail(`duplicate form id "${form.id}"`);
  ids.add(form.id);
  // Drop links to the old forum hosts; the link text stays.
  form.html = unwrapBlockedLinks(form.html);
});

const problems = [];
for (const form of forms) {
  for (const p of checkTemplateHtml(form.html)) problems.push(`${form.id}: ${p}`);
}
if (problems.length) {
  for (const p of problems) console.error(p);
  fail(`${problems.length} template safety problem(s); nothing written`);
}

const out = forms.map((f) => ({ id: f.id, court: f.court, section: f.section, title: f.title, html: f.html }));
mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(out, null, 1), "utf8");
console.log(`port-forms: wrote ${out.length} forms to ${path.relative(root, target)}`);
