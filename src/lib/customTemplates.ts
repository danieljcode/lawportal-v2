// The firm's own templates (LP-49) as stored: one list under lawapp_templates,
// synced per template by `updated` and in the full backup. Each is a title and
// a list of blocks the builder edits; myTemplateForm (src/data/myTemplates.ts)
// turns them into token HTML for the template engine. Kept small because sync
// and the shell's form lookup load it with the app shell.

import { ISO_TIME_RE, defaultKV, isId, newId, text, uniqueById, type KV } from "./storage";
import { createStore } from "./store";
import type { FormInfo } from "./types";

export const TEMPLATES_KEY = "lawapp_templates";
const TEMPLATES_VERSION = 1;
export const MAX_TEMPLATES = 50;
export const MAX_BLOCKS = 80;
/** The forms list's group, and the start of every own template's form id ("my-<id>"). */
export const MY_TEMPLATES = "My Templates";
export const MY_PREFIX = "my-";

export const BLOCK_KINDS = ["heading", "paragraph", "field", "list", "signature"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
export const FIELD_TYPES = ["text", "textarea", "date", "number"] as const;
export type BlockFieldType = (typeof FIELD_TYPES)[number];

export interface TemplateBlock {
  kind: BlockKind;
  /** A heading's or paragraph's words, a field's or list's label, a signature's role line. */
  text: string;
  /** A field's kind of answer. */
  type?: BlockFieldType;
}

export interface CustomTemplate {
  id: string;
  title: string;
  blocks: TemplateBlock[];
  updated: string;
}

function cleanBlock(raw: unknown): TemplateBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind = BLOCK_KINDS.find((k) => k === o.kind);
  if (!kind) return null;
  const t = text(o.text, kind === "paragraph" ? 4000 : 120) || "";
  if (kind !== "field") return { kind, text: t };
  return { kind, text: t, type: FIELD_TYPES.find((x) => x === o.type) || "text" };
}

/** Normalise an untrusted template; null without a title. */
export function cleanTemplate(raw: unknown, now: string = new Date().toISOString()): CustomTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = text(o.title, 120);
  if (!title) return null;
  return {
    id: isId(o.id) ? o.id : newId(),
    title,
    blocks: (Array.isArray(o.blocks) ? o.blocks : [])
      .map(cleanBlock)
      .filter((b): b is TemplateBlock => !!b)
      .slice(0, MAX_BLOCKS),
    updated: typeof o.updated === "string" && ISO_TIME_RE.test(o.updated) ? o.updated : now,
  };
}

const validList = (raw: unknown): CustomTemplate[] => uniqueById(raw, (x) => cleanTemplate(x)).slice(0, MAX_TEMPLATES);

export interface TemplateStore {
  list(): CustomTemplate[];
  get(id: string): CustomTemplate | undefined;
  /** Add or replace one (stamped now); throws when the title is missing or the list is full. */
  save(input: unknown): CustomTemplate;
  remove(id: string): void;
  /** Replace every template (sync). */
  replaceAll(items: unknown): void;
  subscribe(fn: () => void): () => void;
  version(): number;
}

export function createTemplateStore(kv: KV): TemplateStore {
  const store = createStore<CustomTemplate[]>(kv, {
    key: TEMPLATES_KEY,
    version: TEMPLATES_VERSION,
    validate: validList,
    isEmpty: (l) => l.length === 0,
  });
  const list = () => store.get();
  return {
    list,
    get: (id) => list().find((t) => t.id === id),
    save(input) {
      const t = cleanTemplate({ ...(input as object), updated: undefined });
      if (!t) throw new Error("Give the template a title.");
      const all = list();
      if (all.some((x) => x.id === t.id)) store.set(all.map((x) => (x.id === t.id ? t : x)));
      else if (all.length >= MAX_TEMPLATES) throw new Error(`You can keep up to ${MAX_TEMPLATES} templates.`);
      else store.set([...all, t]);
      return t;
    },
    remove: (id) => store.set(list().filter((t) => t.id !== id)),
    replaceAll: (items) => store.set(validList(items)),
    subscribe: store.subscribe,
    version: store.version,
  };
}

let instance: TemplateStore | null = null;

/** The firm's own templates (created on first use; client only). */
export function templateStore(): TemplateStore {
  if (!instance) instance = createTemplateStore(defaultKV());
  return instance;
}

/** An own template's index entry, for routes and titles; undefined for any other id. */
export function customInfo(formId: string): FormInfo | undefined {
  if (!formId.startsWith(MY_PREFIX) || typeof window === "undefined") return undefined;
  const t = templateStore().get(formId.slice(MY_PREFIX.length));
  return t && { id: formId, court: MY_TEMPLATES, section: "", title: t.title };
}
