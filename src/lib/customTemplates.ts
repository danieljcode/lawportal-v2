// The firm's own templates (LP-49) as stored: one list under lawapp_templates,
// synced per template by `updated` and in the full backup. Each is a title and
// a list of blocks the builder edits; myTemplateForm (src/data/myTemplates.ts)
// turns them into token HTML for the template engine. A copy of a built-in form
// (LP-225) points at that form's parts by number and hash: its HTML is never
// stored or synced, only read from the app's own forms. Kept small because sync
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

export const BLOCK_KINDS = ["heading", "paragraph", "field", "list", "signature", "original"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
export const FIELD_TYPES = ["text", "textarea", "date", "number"] as const;
export type BlockFieldType = (typeof FIELD_TYPES)[number];

/** A field's Fills from key (LP-226): its meaning is FILLS in src/data/myTemplates.ts; an unknown one fills nothing. */
const FILL_KEY = /^(char:[a-z]{1,20}|case:[a-z]{1,20}|today)$/;

/** Parts `part` to `part + count - 1` of a built-in form, as they were when copied (`hash`). */
export interface FormPartRef {
  form: string;
  part: number;
  count: number;
  hash: string;
}

export interface TemplateBlock {
  kind: BlockKind;
  /** A heading's or paragraph's words, a field's or list's label, a signature's role line. */
  text: string;
  /** A field's kind of answer. */
  type?: BlockFieldType;
  /** Where a field fills itself from (a FILLS key, LP-226). */
  fill?: string;
  /** A field that must be filled before copying or downloading (LP-87). */
  required?: boolean;
  /** An "original" block's parts, or the part whose look a copied paragraph keeps (LP-225). */
  from?: FormPartRef;
}

export interface CustomTemplate {
  id: string;
  title: string;
  blocks: TemplateBlock[];
  /** The form it was copied from (LP-225); its own title then comes from the original's wording. */
  source?: string;
  /** New labels for the original's fields (old label → new). */
  renames?: Record<string, string>;
  updated: string;
}

const FORM_ID = /^[a-z0-9-]{1,100}$/;
const count = (v: unknown, max: number) =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : -1;

function cleanRef(raw: unknown): FormPartRef | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const part = count(o.part, 999);
  const n = count(o.count, 999);
  if (typeof o.form !== "string" || !FORM_ID.test(o.form) || part < 0 || n < 1) return undefined;
  if (typeof o.hash !== "string" || !/^[0-9a-f]{8}$/.test(o.hash)) return undefined;
  return { form: o.form, part, count: n, hash: o.hash };
}

function cleanBlock(raw: unknown): TemplateBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind = BLOCK_KINDS.find((k) => k === o.kind);
  if (!kind) return null;
  const t = text(o.text, kind === "paragraph" ? 4000 : 120) || "";
  const from = kind === "original" || kind === "paragraph" ? cleanRef(o.from) : undefined;
  if (kind === "original") return from ? { kind, text: "", from } : null;
  if (from) return { kind, text: t, from };
  if (kind !== "field") return { kind, text: t };
  const fill = typeof o.fill === "string" && FILL_KEY.test(o.fill) ? o.fill : undefined;
  return {
    kind,
    text: t,
    type: FIELD_TYPES.find((x) => x === o.type) || "text",
    ...(fill ? { fill } : {}),
    ...(o.required === true ? { required: true } : {}),
  };
}

/** A label as it may go inside a token: letters, numbers, spaces and plain punctuation. */
export const tokenLabel = (s: string) =>
  s
    .replace(/[^\p{L}\p{N} .,'()/-]/gu, "")
    .trim()
    .slice(0, 80);

function cleanRenames(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw).slice(0, 200)) {
    const to = typeof v === "string" ? tokenLabel(v) : "";
    if (k.length <= 120 && to && to !== k) out[k] = to;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Normalise an untrusted template; null without a title. */
export function cleanTemplate(raw: unknown, now: string = new Date().toISOString()): CustomTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = text(o.title, 120);
  if (!title) return null;
  const renames = cleanRenames(o.renames);
  return {
    id: isId(o.id) ? o.id : newId(),
    title,
    blocks: (Array.isArray(o.blocks) ? o.blocks : [])
      .map(cleanBlock)
      .filter((b): b is TemplateBlock => !!b)
      .slice(0, MAX_BLOCKS),
    ...(typeof o.source === "string" && FORM_ID.test(o.source) ? { source: o.source } : {}),
    ...(renames ? { renames } : {}),
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
