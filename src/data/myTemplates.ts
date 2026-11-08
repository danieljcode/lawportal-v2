// The firm's own templates (LP-49) as forms: each builder block becomes token HTML
// for the template engine, so the form, preview, .docx, PDF, Discord copy, filing
// history and drafts work as for any other form. The firm's words are escaped and
// braces become entities, so nothing typed can add HTML or a token; labels keep
// only plain characters, since they sit inside tokens.
//
// A copy of a built-in form (LP-225) keeps references to that form's parts, and
// their HTML is read from the app's own forms here, never from storage.

import { escapeHtml } from "@/lib/template/escape";
import {
  MY_PREFIX,
  MY_TEMPLATES,
  templateStore,
  tokenLabel,
  type CustomTemplate,
  type FormPartRef,
  type TemplateBlock,
} from "@/lib/customTemplates";
import type { FormDef } from "@/lib/types";
import { EXTRA_FORMS } from "./extra-forms";
import directoryForms from "./forms.json";
import { fieldLabels, formParts, partHash, renameFields, WORDING_MARK, wordingOf } from "./formParts";

// Not ALL_FORMS from "./index", which imports this file.
const builtIn = (id: string) => (directoryForms as FormDef[]).find((f) => f.id === id) || EXTRA_FORMS.find((f) => f.id === id);

/** The HTML a reference points at, or null when that form is gone or has changed since. */
function partsOf(ref: FormPartRef): string | null {
  const form = builtIn(ref.form);
  if (!form) return null;
  const html = formParts(form.html)
    .slice(ref.part, ref.part + ref.count)
    .join("");
  return partHash(html) === ref.hash ? html : null;
}

const MISSING = "<p><em>[Part of the original form is missing: it has changed since this copy was made.]</em></p>\n";

const words = (s: string) => escapeHtml(s).replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
const label = (s: string, or: string) => tokenLabel(s) || or;
const BLANK = "__________";

const TYPE_TOKEN = { text: "", textarea: ":textarea", date: ":date:long", number: ":number" } as const;

/**
 * Where a field fills itself from (LP-226), named in plain words. A character field fills
 * by its key (`@name`), like the built-in forms; a case field by the label Pick a case
 * fills (src/lib/formState/dockets.ts), so its label is fixed; today by the game date.
 * Kept here, with Court Filings, rather than in the shell's customTemplates.ts.
 */
export interface Fill {
  name: string;
  group: "Your character" | "The case" | "Date";
  /** The character key it fills from. */
  char?: string;
  /** The label it must have (a case field), or the label it starts with. */
  label: string;
  fixedLabel?: boolean;
  date?: boolean;
  today?: boolean;
}

export const FILLS: Readonly<Record<string, Fill>> = {
  "char:name": { name: "Your name", group: "Your character", char: "name", label: "Name" },
  "char:title": { name: "Your title", group: "Your character", char: "title", label: "Title" },
  "char:bar": { name: "Your bar number", group: "Your character", char: "bar", label: "Bar number" },
  "char:phone": { name: "Your phone number", group: "Your character", char: "phone", label: "Phone number" },
  "char:address": { name: "Your address", group: "Your character", char: "address", label: "Address" },
  "char:email": { name: "Your email", group: "Your character", char: "email", label: "Email" },
  "case:number": { name: "Case number", group: "The case", label: "Case number", fixedLabel: true },
  "case:plaintiff": { name: "Plaintiff", group: "The case", label: "Plaintiff name", fixedLabel: true },
  "case:defendant": { name: "Defendant", group: "The case", label: "Defendant name", fixedLabel: true },
  "case:court": { name: "Court", group: "The case", label: "Court name", fixedLabel: true },
  "case:filed": { name: "Date filed", group: "The case", label: "Action filed", fixedLabel: true, date: true },
  today: { name: "Today's date (game time)", group: "Date", label: "Date", date: true, today: true },
};

/** A field's fill, or undefined for none or a key this version doesn't know. */
export const fillOf = (b: TemplateBlock): Fill | undefined =>
  b.fill && Object.prototype.hasOwnProperty.call(FILLS, b.fill) ? FILLS[b.fill] : undefined;

function paragraph(s: string): string {
  return s
    .split(/\n\s*\n/)
    .map((p) => "<p>" + words(p.trim()).replace(/\n/g, "<br />\n") + "</p>\n")
    .join("");
}

/** The signature block the court filings use (src/data/extra-forms.ts). */
const signature = (role: string) =>
  "<p>Dated: {{Filing date=today:date:long|" +
  BLANK +
  "}}</p>\n<p>Respectfully submitted,</p>\n<p><strong>{{Name@name|____________________}}</strong><br />\n" +
  "Bar No. {{Bar number@bar|" +
  BLANK +
  "}}<br />\n{{Firm|FIRM NAME}}<br />\n{{Role@title|" +
  words(role || "Attorney") +
  "}}</p>\n";

/** A template's token HTML. Two lists with one name get " 2", " 3"…, since a list's name is its key. */
export function templateHtml(t: Pick<CustomTemplate, "title" | "blocks" | "source" | "renames">): string {
  const lists = new Set<string>();
  const block = (b: TemplateBlock): string => {
    switch (b.kind) {
      case "heading":
        return b.text ? "<p><strong><u>" + words(b.text) + "</u></strong></p>\n" : "";
      case "paragraph": {
        const part = b.from && partsOf(b.from);
        const was = part && wordingOf(part);
        // Unchanged wording keeps the original exactly; changed wording keeps its look.
        if (was) return was.text === b.text ? part : b.text ? was.shell.replace(WORDING_MARK, words(b.text)) : "";
        return b.text ? paragraph(b.text) : "";
      }
      case "original": {
        const part = b.from && partsOf(b.from);
        return part ? renameFields(part, t.renames) : MISSING;
      }
      case "field": {
        const fill = fillOf(b);
        const how = fill?.today ? "=today" : fill?.char ? "@" + fill.char : "";
        const type = fill ? (fill.date ? TYPE_TOKEN.date : "") : TYPE_TOKEN[b.type || "text"];
        return "<p>{{" + fieldLabel(b) + how + type + "|" + BLANK + "}}</p>\n";
      }
      case "list": {
        let name = label(b.text, "List");
        for (let n = 2; lists.has(name); n++) name = label(b.text, "List") + " " + n;
        lists.add(name);
        return (
          `{{#${name}|1}}<p><strong>{{$index}}.</strong> {{${name} item:textarea|Write the item.}}</p>\n{{/${name}}}`
        );
      }
      case "signature":
        return signature(b.text);
    }
  };
  // A copy's own title is the original's wording.
  const title = t.source
    ? ""
    : '<p style="text-align:center"><strong><span style="font-size:20px">' + words(t.title) + "</span></strong></p>\n";
  return title + t.blocks.map(block).join("");
}

/** The fields in a template's original text (LP-225), by their labels in the original. */
export function originalFields(t: Pick<CustomTemplate, "blocks">): string[] {
  const html = t.blocks.map((b) => (b.kind === "original" && b.from && partsOf(b.from)) || "").join("");
  return fieldLabels(html);
}

/** A short plain-text look at an original block, for the builder. */
export function originalGlimpse(b: TemplateBlock): string {
  const part = b.from && partsOf(b.from);
  if (!part) return "Missing: the original form has changed since this copy was made.";
  const text = part
    .replace(/\{\{[\s\S]*?\}\}/g, " … ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 140 ? text.slice(0, 140) + "…" : text || "(spacing and layout)";
}

/**
 * A new template made from a form (LP-225): a built-in form's wording as paragraphs and
 * everything else as Original text blocks; an own template's blocks copied. Undefined when
 * there's no such form.
 */
export function copyOfForm(formId: string): Omit<CustomTemplate, "id" | "updated"> | undefined {
  if (formId.startsWith(MY_PREFIX)) {
    const t = templateStore().get(formId.slice(MY_PREFIX.length));
    return t && { title: (t.title + " (copy)").slice(0, 120), blocks: t.blocks, source: t.source, renames: t.renames };
  }
  const form = builtIn(formId);
  if (!form) return undefined;
  const blocks: TemplateBlock[] = [];
  let run: string[] = [];
  let runStart = 0;
  const endRun = () => {
    if (!run.length) return;
    blocks.push({
      kind: "original",
      text: "",
      from: { form: form.id, part: runStart, count: run.length, hash: partHash(run.join("")) },
    });
    run = [];
  };
  formParts(form.html).forEach((part, i) => {
    const w = wordingOf(part);
    if (!w) {
      if (!run.length) runStart = i;
      run.push(part);
      return;
    }
    endRun();
    blocks.push({ kind: "paragraph", text: w.text, from: { form: form.id, part: i, count: 1, hash: partHash(part) } });
  });
  endRun();
  return { title: (form.title + " (my version)").slice(0, 120), blocks, source: form.id };
}

// The store parses on every read, so each template's form is kept until it's saved again
// (a new `updated`): the open form only re-renders when its template changes.
const forms = new Map<string, { updated: string; form: FormDef }>();

/** An own template as a form ("my-<id>"), or undefined. */
export function myTemplateForm(formId: string): FormDef | undefined {
  if (!formId.startsWith(MY_PREFIX)) return undefined;
  const t = templateStore().get(formId.slice(MY_PREFIX.length));
  if (!t) return undefined;
  const hit = forms.get(formId);
  if (hit && hit.updated === t.updated) return hit.form;
  const required = requiredLabels(t);
  const form: FormDef = {
    id: formId,
    court: MY_TEMPLATES,
    section: "",
    title: t.title,
    html: templateHtml(t),
    ...(required.length ? { required } : {}),
  };
  forms.set(formId, { updated: t.updated, form });
  return form;
}

/** A field block's label in its token: a case field's is fixed, so Pick a case finds it. */
export function fieldLabel(b: TemplateBlock): string {
  const fill = fillOf(b);
  return fill?.fixedLabel ? fill.label : label(b.text, fill ? fill.label : "Field");
}

/**
 * The labels that must be filled (LP-87): ticked fields, and for a copy (LP-225) the original
 * form's required fields that are still in it, under their new names.
 */
export function requiredLabels(t: Pick<CustomTemplate, "blocks" | "source" | "renames">): string[] {
  const out = t.blocks.filter((b) => b.kind === "field" && b.required).map(fieldLabel);
  const original = t.source ? builtIn(t.source)?.required : undefined;
  if (original) {
    const kept = new Set(originalFields(t));
    for (const l of original) if (kept.has(l)) out.push(t.renames?.[l] || l);
  }
  return [...new Set(out)];
}

/** Every own template as a form, for the forms list. */
export const myTemplateForms = (): FormDef[] =>
  templateStore()
    .list()
    .map((t) => ({ id: MY_PREFIX + t.id, court: MY_TEMPLATES, section: "", title: t.title, html: "" }));
