// The firm's own templates (LP-49) as forms: each builder block becomes token HTML
// for the template engine, so the form, preview, .docx, PDF, Discord copy, filing
// history and drafts work as for any other form. The firm's words are escaped and
// braces become entities, so nothing typed can add HTML or a token; labels keep
// only plain characters, since they sit inside tokens.

import { escapeHtml } from "@/lib/template/escape";
import {
  MY_PREFIX,
  MY_TEMPLATES,
  templateStore,
  type CustomTemplate,
  type TemplateBlock,
} from "@/lib/customTemplates";
import type { FormDef } from "@/lib/types";

const words = (s: string) => escapeHtml(s).replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
const label = (s: string, or: string) => s.replace(/[^\p{L}\p{N} .,'()/-]/gu, "").trim() || or;
const BLANK = "__________";

const TYPE_TOKEN = { text: "", textarea: ":textarea", date: ":date:long", number: ":number" } as const;

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
export function templateHtml(t: Pick<CustomTemplate, "title" | "blocks">): string {
  const lists = new Set<string>();
  const block = (b: TemplateBlock): string => {
    switch (b.kind) {
      case "heading":
        return b.text ? "<p><strong><u>" + words(b.text) + "</u></strong></p>\n" : "";
      case "paragraph":
        return b.text ? paragraph(b.text) : "";
      case "field":
        return "<p>{{" + label(b.text, "Field") + TYPE_TOKEN[b.type || "text"] + "|" + BLANK + "}}</p>\n";
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
  return (
    '<p style="text-align:center"><strong><span style="font-size:20px">' +
    words(t.title) +
    "</span></strong></p>\n" +
    t.blocks.map(block).join("")
  );
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
  const form = { id: formId, court: MY_TEMPLATES, section: "", title: t.title, html: templateHtml(t) };
  forms.set(formId, { updated: t.updated, form });
  return form;
}

/** Every own template as a form, for the forms list. */
export const myTemplateForms = (): FormDef[] =>
  templateStore()
    .list()
    .map((t) => ({ id: MY_PREFIX + t.id, court: MY_TEMPLATES, section: "", title: t.title, html: "" }));
