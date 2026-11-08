// Sharing the firm's own templates (LP-50): a .lawtpl.json file holds templates as
// blocks, never HTML, so an imported one is cleaned like synced data and built by
// templateHtml (which escapes its words). Each still goes through the template-safety
// check, and anything the cleaning would drop rejects the template with a reason.

import { cleanTemplate, MAX_TEMPLATES, templateStore, type CustomTemplate } from "@/lib/customTemplates";
import { checkTemplateHtml } from "../../scripts/template-safety.mjs";
import { templateHtml } from "./myTemplates";

export const SHARE_EXT = ".lawtpl.json";
const KIND = "lawapp-templates";
const VERSION = 1;
const MAX_FILE = 1_000_000;

/** The file for some templates: what the builder edits, without ids or times. */
export function exportFile(list: CustomTemplate[]): string {
  // id and updated stay on this device.
  const templates = list.map(({ id, updated, ...t }) => t);
  return JSON.stringify({ kind: KIND, v: VERSION, templates }, null, 2) + "\n";
}

/** A file name for one template's title, or for several. */
export function exportName(list: CustomTemplate[]): string {
  const slug =
    list.length === 1
      ? list[0].title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 60)
      : "";
  return (slug || "templates") + SHARE_EXT;
}

export interface Incoming {
  template: CustomTemplate;
  /** Why it can't be added. */
  problem?: string;
  /** The template already here with the same title. */
  clash?: CustomTemplate;
}

export type ClashChoice = "rename" | "replace" | "skip";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Read a file's text; throws with a reason when it isn't a template file. */
export function readFile(text: string, existing: CustomTemplate[] = templateStore().list()): Incoming[] {
  if (text.length > MAX_FILE) throw new Error("That file is too big to be a template file.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file can't be read: it isn't a template file.");
  }
  const o = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (o.kind !== KIND) throw new Error("That isn't a lawapp template file.");
  if (typeof o.v !== "number" || o.v > VERSION) throw new Error("That file is from a newer lawapp. Update and try again.");
  const raws = Array.isArray(o.templates) ? o.templates.slice(0, MAX_TEMPLATES) : [];
  if (!raws.length) throw new Error("That file has no templates in it.");
  return raws.map((raw, i): Incoming => {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    // A new id always: a file can never overwrite a template by naming its id.
    const t = cleanTemplate({ ...r, id: undefined });
    const fallback = { id: "x" + i, title: "Template " + (i + 1), blocks: [], updated: "" };
    if (!t) return { template: fallback, problem: "It has no title." };
    const blocks = Array.isArray(r.blocks) ? r.blocks.length : 0;
    if (t.blocks.length < blocks) {
      return { template: t, problem: `${blocks - t.blocks.length} of its blocks aren't ones lawapp knows.` };
    }
    const unsafe = checkTemplateHtml(templateHtml(t));
    if (unsafe.length) return { template: t, problem: "It failed the safety check: " + unsafe.join("; ") + "." };
    return { template: t, clash: existing.find((x) => same(x.title, t.title)) };
  });
}

/** "Title (2)", "Title (3)"… not taken by any of `titles`. */
export function freeTitle(title: string, titles: string[]): string {
  for (let n = 2; ; n++) {
    const end = ` (${n})`;
    const next = title.slice(0, 120 - end.length) + end;
    if (!titles.some((x) => same(x, next))) return next;
  }
}

/** Add the importable templates, a clash as chosen (rename by default); returns how many were added. */
export function addImported(items: Incoming[], choices: Record<number, ClashChoice> = {}): number {
  const store = templateStore();
  const titles = store.list().map((t) => t.title);
  const adds: CustomTemplate[] = [];
  items.forEach((it, i) => {
    if (it.problem) return;
    const choice = it.clash ? choices[i] || "rename" : "add";
    if (choice === "skip") return;
    if (choice === "replace") return void adds.push({ ...it.template, id: it.clash!.id });
    const title = titles.some((x) => same(x, it.template.title)) ? freeTitle(it.template.title, titles) : it.template.title;
    titles.push(title);
    adds.push({ ...it.template, title });
  });
  const fresh = adds.filter((t) => !store.get(t.id)).length;
  if (store.list().length + fresh > MAX_TEMPLATES) {
    throw new Error(`You can keep up to ${MAX_TEMPLATES} templates. Skip some, or delete some first.`);
  }
  for (const t of adds) store.save(t);
  return adds.length;
}
