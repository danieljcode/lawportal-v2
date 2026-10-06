// Judicial Advancement Portfolio (J.A.P.) for Court Commissioners (INV §e.3).
//
// Two fixed forum templates (Court Commissioner I and II). The filer adds the
// cases, warrants and optional tasks they have completed; render() puts them
// into the template and keeps the template's placeholder lines for anything
// not done yet. Kept per character under lawapp_jap_<charId>; each level's work
// is stored separately. The task texts, counts, colours and notes are the
// court's requirements, transcribed from the reference js_portfolio.js.

import type { Character, Portfolio, PortfolioEntry, PortfolioLevel } from "./types";
import { createChannel, defaultKV, isId, ISO_DATE_RE, ISO_TIME_RE, readJson, writeJson, type KV } from "./storage";

export const JAP_PREFIX = "lawapp_jap_";
export const MAX_ENTRIES = 60;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export const NOTE_MOTIONS =
  'This includes standalone motions (such as when the defendant files a motion to dismiss for a speedy trial violation under a standalone docket) or motions made as part of an ongoing case. If you are linking the latter, make sure you hit "share" on your response and use that link.';
export const NOTE_TRAFFIC =
  "This should show the date when the in-game Traffic Court session was conducted along with a link to the court transcript in the Publications subforum.";
export const NOTE_PROBATION =
  "In addition to linking the case, you need to link your discord message of reaching out to CSB/SADCR.";
export const NOTE_APPELLATE = "Reach out to your supervisor for a specific assignment to complete this task.";
export const INTRO_OPTIONAL =
  "This section contains optional tasks that may be completed multiple times. If you complete an optional task more than once, add a new line for each completion. While all tasks in sections 1 and 2 must be completed to be eligible for promotion, completing additional optional tasks may help offset any mistakes made in sections 1 and 2 and result in a faster promotion.";

export type EntryKey = keyof PortfolioEntry;

export interface KindField {
  key: EntryKey;
  label: string;
  /** The template's placeholder for this part of the line. */
  ph: string;
  url?: boolean;
  date?: boolean;
}

export type BaseKind = "case" | "civil" | "warrant" | "transcript" | "probation";
export type TaskKind = "case" | "civil" | "AW" | "SW" | "ESW" | "transcript" | "probation";

export const KINDS: Readonly<Record<BaseKind, readonly KindField[]>> = {
  case: [
    { key: "num", label: "Case number", ph: "XXGJCR00000" },
    { key: "caption", label: "Case name", ph: "People of the State of San Andreas v. John Doe" },
    { key: "link", label: "Link", ph: "LINKTOCASE", url: true },
  ],
  civil: [
    { key: "num", label: "Case number", ph: "XXGJCC00000" },
    { key: "caption", label: "Case name", ph: "John Doe v. John Doe" },
    { key: "link", label: "Link", ph: "LINKTOCASE", url: true },
  ],
  warrant: [
    { key: "num", label: "Warrant number", ph: "AW-00000" },
    { key: "link", label: "Link", ph: "LINKTOWARRANT", url: true },
  ],
  transcript: [
    { key: "date", label: "Session date", ph: "01/JAN/2000", date: true },
    { key: "link", label: "Transcript link", ph: "LINKTOTRANSCRIPTS", url: true },
  ],
  probation: [
    { key: "num", label: "Case number", ph: "XXGJCR00000" },
    { key: "caption", label: "Case name", ph: "People of the State of San Andreas v. John Doe" },
    { key: "link", label: "Case link", ph: "LINKTOCASE", url: true },
    { key: "discord", label: "Discord message link", ph: "LINKTODISCORDMESSAGE", url: true },
  ],
};

export interface Task {
  id: string;
  text: string;
  note?: string;
  /** null: a task with nothing to list (only its heading and note are posted). */
  kind: TaskKind | null;
  /** Required lines; absent for optional tasks. */
  count?: number;
}

export interface Section {
  title: string;
  intro?: string;
  optional?: boolean;
  color: string;
  tasks: readonly Task[];
}

export interface Level {
  key: PortfolioLevel;
  title: string;
  sections: readonly Section[];
}

function warrantText(what: string, level: PortfolioLevel): string {
  return `Review five ${what}` + (level === "I" ? "." : " (include at least one denial).");
}

function buildSections(color: string, level: PortfolioLevel): Section[] {
  const courtCases: Task[] =
    level === "I"
      ? [
          { id: "1.1", text: "Preside over two trials resolved through summary judgment.", kind: "case", count: 2 },
          { id: "1.2", text: "Preside over two full trials resolved through final judgment.", kind: "case", count: 2 },
          { id: "1.3", text: "Rule on five motions.", note: NOTE_MOTIONS, kind: "case", count: 5 },
        ]
      : [
          { id: "1.1", text: "Preside over five criminal trials resolved through summary judgment.", kind: "case", count: 5 },
          { id: "1.2", text: "Preside over five full criminal trials resolved through final judgment.", kind: "case", count: 5 },
          {
            id: "1.3",
            text: "Preside over two civil trials resolved through a settlement, summary judgment, or final judgment (does not apply to default judgment).",
            kind: "civil",
            count: 2,
          },
          { id: "1.4", text: "Rule on two standalone motions to dismiss for a speedy trial violation.", kind: "case", count: 2 },
          { id: "1.5", text: "Rule on one habeas corpus hearing.", kind: "case", count: 1 },
        ];
  const optional: Task[] =
    level === "I"
      ? [
          { id: "3.1", text: "Preside over a Traffic Court session.", note: NOTE_TRAFFIC, kind: "transcript" },
          { id: "3.2", text: "Preside over a habeas corpus hearing.", kind: "case" },
          { id: "3.3", text: "Preside over a case resulting in probation or self-surrender.", note: NOTE_PROBATION, kind: "probation" },
        ]
      : [
          { id: "3.1", text: "Preside over a Traffic Court session.", note: NOTE_TRAFFIC, kind: "transcript" },
          { id: "3.2", text: "Preside over a case resulting in probation or self-surrender.", note: NOTE_PROBATION, kind: "probation" },
          { id: "3.3", text: "Draft an appellate opinion.", note: NOTE_APPELLATE, kind: null },
        ];
  return [
    { title: "SECTION 1. COURT CASES", color, tasks: courtCases },
    {
      title: "SECTION 2. WARRANTS",
      color,
      tasks: [
        { id: "2.1", text: warrantText("arrest warrants", level), kind: "AW", count: 5 },
        { id: "2.2", text: warrantText("search warrants", level), kind: "SW", count: 5 },
        {
          id: "2.3",
          text: warrantText("electronic surveillance warrants or financial services warrants", level),
          kind: "ESW",
          count: 5,
        },
      ],
    },
    { title: "SECTION 3. OPTIONAL MERIT", intro: INTRO_OPTIONAL, optional: true, color, tasks: optional },
  ];
}

export const LEVELS: Readonly<Record<PortfolioLevel, Level>> = {
  I: { key: "I", title: "Court Commissioner I", sections: buildSections("#335ead", "I") },
  II: { key: "II", title: "Court Commissioner II", sections: buildSections("#223d70", "II") },
};

function isWarrant(kind: TaskKind | null): kind is "AW" | "SW" | "ESW" {
  return kind === "AW" || kind === "SW" || kind === "ESW";
}

/** The parts of one line for a task kind (warrants get their own number prefix). */
export function fieldsFor(kind: TaskKind | null): readonly KindField[] {
  if (isWarrant(kind)) return KINDS.warrant.map((f) => (f.key === "num" ? { ...f, ph: kind + "-00000" } : f));
  return kind ? KINDS[kind] : [];
}

/** Every task of a level, in order. */
export function tasks(level: PortfolioLevel): Task[] {
  return LEVELS[level].sections.flatMap((s) => [...s.tasks]);
}

/* ---------- who gets one ---------- */

const COMMISSIONER = /\bcourt\s+commissioner\b/i;

export function isCommissioner(c: Pick<Character, "title"> | null | undefined): boolean {
  return !!c && COMMISSIONER.test(c.title || "");
}

/** "Court Commissioner II" (or 2) starts on the CC II template; anything else on CC I. */
export function levelFromTitle(title: string | undefined): PortfolioLevel {
  return /\bcommissioner\s+(ii|2)\b/i.test(title || "") ? "II" : "I";
}

export function topicTitle(name: string | undefined): string {
  return "[J.A.P.] " + (String(name || "").trim() || "Firstname Lastname");
}

/* ---------- cleaning (imported and synced data is never trusted) ---------- */

/** Control characters become spaces and square brackets become parentheses (they would open BBCode tags). */
export function cleanText(v: unknown, max = 300): string {
  return String(v == null ? "" : v)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    .trim()
    .slice(0, max);
}

/** http(s) only, up to 1000 chars, with square brackets percent-encoded; anything else is "". */
export function cleanUrl(v: unknown): string {
  const s = String(v == null ? "" : v).trim();
  if (!/^https?:\/\/[^\s]+$/i.test(s) || s.length > 1000) return "";
  return s.replace(/\[/g, "%5B").replace(/\]/g, "%5D");
}

function cleanEntry(kind: TaskKind, e: unknown): PortfolioEntry {
  const out: PortfolioEntry = {};
  if (!e || typeof e !== "object") return out;
  const src = e as Record<string, unknown>;
  for (const f of fieldsFor(kind)) {
    const raw = src[f.key];
    let v: string;
    if (f.url) v = cleanUrl(raw);
    else if (f.date) v = typeof raw === "string" && ISO_DATE_RE.test(raw) ? raw : "";
    else v = cleanText(raw);
    if (v) out[f.key] = v;
  }
  return out;
}

function cleanLevel(level: PortfolioLevel, d: unknown): Record<string, PortfolioEntry[]> {
  const out: Record<string, PortfolioEntry[]> = {};
  if (!d || typeof d !== "object") return out;
  const src = d as Record<string, unknown>;
  for (const t of tasks(level)) {
    const list = src[t.id];
    if (!t.kind || !Array.isArray(list)) continue;
    const kind = t.kind;
    const kept = list
      .slice(0, MAX_ENTRIES)
      .map((e) => cleanEntry(kind, e))
      .filter((e) => Object.keys(e).length > 0);
    if (kept.length) out[t.id] = kept;
  }
  return out;
}

export function clean(input: unknown): Portfolio {
  const p = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    level: p.level === "II" ? "II" : "I",
    I: cleanLevel("I", p.I),
    II: cleanLevel("II", p.II),
    updated: typeof p.updated === "string" && ISO_TIME_RE.test(p.updated) ? p.updated : new Date().toISOString(),
  };
}

export function isEmpty(p: Portfolio | null | undefined): boolean {
  return !p || (!Object.keys(p.I || {}).length && !Object.keys(p.II || {}).length);
}

/* ---------- BBCode ---------- */

/** `2026-01-02` → `02/JAN/2026`; anything else → "". */
export function shortDate(iso: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}/${MONTHS[Number(m[2]) - 1]}/${m[1]}` : "";
}

function line(kind: TaskKind, e: PortfolioEntry | undefined): string {
  const entry = e || {};
  const v: Partial<Record<EntryKey, string>> = {};
  for (const f of fieldsFor(kind)) v[f.key] = (f.date ? shortDate(entry[f.key]) : entry[f.key]) || f.ph;
  if (isWarrant(kind)) return `[*][url=${v.link}]${v.num}[/url]`;
  if (kind === "transcript") return `[*][url=${v.link}]${v.date}[/url]`;
  let out = `[*][url=${v.link}][${v.num}] ${v.caption}[/url]`;
  if (kind === "probation") out += `, [url=${v.discord}]#courts-csb/#sadcr[/url]`;
  return out;
}

/**
 * The finished forum post. Required tasks always list at least as many lines as
 * they ask for, optional ones at least one; missing lines keep the template's placeholders.
 */
export function render(level: PortfolioLevel, data: Record<string, PortfolioEntry[]> | null | undefined, name?: string): string {
  const L = LEVELS[level === "II" ? "II" : "I"];
  const d = data || {};
  const head =
    "[divbox=transparent][br][/br][size=165][b][center]JUDICIAL ADVANCEMENT PORTFOLIO[/center][/b][/size]\n" +
    `[center]${cleanText(name, 100) || "Firstname Lastname"} - ${L.title}[/center][hr]\n`;
  const body = L.sections
    .map((s) => {
      const taskText = s.tasks
        .map((t) => {
          const parts = [`[b]${t.id}. ${t.text}[/b]`];
          if (t.note) parts.push(`[color=#444444]${t.note}[/color]`);
          if (!t.kind) return parts.join("\n") + "\n";
          const entries = d[t.id] || [];
          const want = Math.max(t.count || 1, entries.length);
          const lines: string[] = [];
          for (let i = 0; i < want; i++) lines.push(line(t.kind, entries[i]));
          parts.push("[list]\n" + lines.join("\n") + "\n[/list]");
          return parts.join("\n");
        })
        .join("\n");
      return (
        `[divbox=${s.color}][b][color=#ffffff][center]${s.title}[/center][/color][/b][/divbox]\n` +
        "[divbox4=white][br][/br]" +
        (s.intro ? `[color=#444444]${s.intro}[/color]\n\n` : "") +
        taskText +
        "[br][/br][/divbox4]"
      );
    })
    .join("\n\n");
  return head + body + "[/divbox]";
}

/** A line counts as done when every part except the caption is filled. */
export function complete(kind: TaskKind | null, e: PortfolioEntry | null | undefined): boolean {
  return fieldsFor(kind).every((f) => f.key === "caption" || !!(e && e[f.key]));
}

/** Done lines against required lines (each required task counts at most its own count). */
export function progress(level: PortfolioLevel, data: Record<string, PortfolioEntry[]> | null | undefined): { done: number; need: number } {
  let done = 0;
  let need = 0;
  for (const t of tasks(level)) {
    if (!t.count) continue;
    need += t.count;
    const finished = ((data || {})[t.id] || []).filter((e) => complete(t.kind, e)).length;
    done += Math.min(t.count, finished);
  }
  return { done, need };
}

/* ---------- storage ---------- */

export interface PortfolioStore {
  get(charId: string): Portfolio | null;
  /** Clean and store; null (nothing written) for an invalid charId. */
  save(charId: string, p: unknown): Portfolio | null;
  remove(charId: string): void;
  /** Replace with a copy from the server or an import (null clears it). */
  replace(charId: string, p: unknown): void;
  /** Fires after data mutations. */
  subscribe(fn: () => void): () => void;
  version(): number;
}

export function createPortfolioStore(kv: KV): PortfolioStore {
  const changes = createChannel();
  const key = (charId: string) => JAP_PREFIX + charId;
  return {
    get(charId) {
      if (!isId(charId)) return null;
      const raw = readJson<unknown>(kv, key(charId));
      return raw && typeof raw === "object" ? clean(raw) : null;
    },
    save(charId, p) {
      if (!isId(charId)) return null;
      const data = clean(p);
      data.updated = new Date().toISOString();
      writeJson(kv, key(charId), data);
      changes.emit();
      return data;
    },
    remove(charId) {
      if (!isId(charId)) return;
      kv.remove(key(charId));
      changes.emit();
    },
    replace(charId, p) {
      if (!isId(charId)) return;
      if (p && typeof p === "object") writeJson(kv, key(charId), clean(p));
      else kv.remove(key(charId));
      changes.emit();
    },
    subscribe: changes.subscribe,
    version: changes.version,
  };
}

let instance: PortfolioStore | null = null;

/** The app's portfolio store (created on first use; client only). */
export function portfolioStore(): PortfolioStore {
  if (!instance) instance = createPortfolioStore(defaultKV());
  return instance;
}
