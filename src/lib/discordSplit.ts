// Split a DiscordDoc into messages that each fit Discord's limit.
//
// Works on the IR from discord.ts, so a cut never lands inside a span, link,
// spoiler or code block: every part is serialized from whole runs, code blocks
// that must be split are closed and reopened with the same language tag, and
// formatting is balanced per line (so per part). Break preference: before a
// heading, rule or code block, then at a blank line (paragraph), then any line,
// then (inside an over-long line) after a sentence, then at a word.
// Length is JavaScript string length: UTF-16 code units, as Discord counts.

import { MARKERS, serializeLine, type DiscordDoc, type DLine, type Mark, type Run } from "./discord";

export type DiscordLimit = 2000 | 4000;

export interface SplitOptions {
  limit: number;
  /** Append `-# Part i/n` to each part when there is more than one. */
  markers: boolean;
}

/** The small part marker line. */
export function partMarker(i: number, n: number): string {
  return `-# Part ${i}/${n}`;
}

interface Unit {
  text: string;
  blank: boolean;
  /** Preference for breaking before this unit: 3 heading/rule/code, 2 paragraph, 1 line. */
  prio: number;
  /** Start a new part before this unit (the first piece of an over-long line). */
  fresh?: boolean;
}

const HEADING_RE = /^(> )?(#{1,3}) /;

function isHeading(line: DLine): boolean {
  return line.kind === "text" && HEADING_RE.test(line.prefix);
}

function strongPrio(line: DLine): boolean {
  return line.kind === "rule" || line.kind === "code" || isHeading(line);
}

/* ------------------------------------------------------- over-long pieces */

/** Index ≤ k that doesn't split a surrogate pair or a backslash escape. */
function safeCut(s: string, k: number): number {
  let i = Math.max(1, Math.min(k, s.length));
  const code = s.charCodeAt(i - 1);
  if (code >= 0xd800 && code <= 0xdbff && i < s.length) i--;
  let bs = 0;
  for (let j = i - 1; j >= 0 && s[j] === "\\"; j--) bs++;
  if (bs % 2 === 1) i--;
  return Math.max(1, i);
}

function splitCode(line: Extract<DLine, { kind: "code" }>, budget: number): string[] {
  const open = "```" + line.lang + "\n";
  const close = "\n```";
  const room = Math.max(1, budget - open.length - close.length);
  const chunks: string[] = [];
  let cur: string[] = [];
  let size = 0;
  const flush = () => {
    if (cur.length) chunks.push(open + cur.join("\n") + close);
    cur = [];
    size = 0;
  };
  const lines: string[] = [];
  for (const l of line.lines) {
    let rest = l;
    while (rest.length > room) {
      const k = safeCut(rest, room);
      lines.push(rest.slice(0, k));
      rest = rest.slice(k);
    }
    lines.push(rest);
  }
  for (const l of lines) {
    const add = cur.length ? 1 + l.length : l.length;
    if (cur.length && size + add > room) flush();
    size += cur.length ? 1 + l.length : l.length;
    cur.push(l);
  }
  flush();
  return chunks;
}

interface Piece {
  text: string;
  marks: Mark[];
  atom?: boolean;
}

function piecesOf(runs: Run[]): Piece[] {
  const out: Piece[] = [];
  for (const r of runs) {
    if (r.atom) out.push({ text: r.text, marks: r.marks, atom: true });
    else for (const w of r.text.match(/\S+\s*|\s+/g) || []) out.push({ text: w, marks: r.marks });
  }
  return out;
}

function sameMarks(a: Mark[], b: Mark[]): boolean {
  return a.length === b.length && a.every((m, i) => m === b[i]);
}

function contPrefix(prefix: string): string {
  const h = /^(> )?(#{1,3} |-# )$/.exec(prefix);
  if (h) return prefix;
  return prefix.startsWith(">") ? "> " : "";
}

/** Split one text line into segments that each serialize within the budget. */
function splitText(line: Extract<DLine, { kind: "text" }>, budget: number): string[] {
  const segs: string[] = [];
  const measure = (ps: Piece[], first: boolean) =>
    serializeLine({ kind: "text", prefix: first ? line.prefix : contPrefix(line.prefix), runs: ps });
  const queue = piecesOf(line.runs);
  // The line prefix plus a possible line-start escape (continuations are never longer).
  const PREFIX_MAX = line.prefix.length + 1;
  let cur: Piece[] = [];
  // An upper bound on measure(cur): text, plus every marker opened and closed at each mark change.
  let bound = 0;
  let first = true;
  const extra = (p: Piece, prev: Piece | undefined) =>
    prev && sameMarks(prev.marks, p.marks) ? 0 : 2 * p.marks.reduce((n, m) => n + MARKERS[m].length, 0) + 1;
  const boundOf = (ps: Piece[]) => ps.reduce((n, p, i) => n + p.text.length + extra(p, ps[i - 1]), PREFIX_MAX);
  const emit = (ps: Piece[]) => {
    const s = measure(ps, first);
    first = false;
    if (s.trim()) segs.push(s);
  };
  let qi = 0;
  while (qi < queue.length) {
    const p = queue[qi];
    // Skip the exact (quadratic) measure while the bound says it fits.
    const nextBound = (cur.length ? bound : PREFIX_MAX) + p.text.length + extra(p, cur[cur.length - 1]);
    if (nextBound <= budget || measure([...cur, p], first).length <= budget) {
      cur.push(p);
      bound = nextBound;
      qi++;
      continue;
    }
    if (!cur.length) {
      // One piece longer than the budget: hard-cut it by code units.
      let lo = 1;
      let hi = p.text.length;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (measure([{ ...p, atom: false, text: p.text.slice(0, mid) }], first).length <= budget) lo = mid;
        else hi = mid - 1;
      }
      const k = safeCut(p.text, lo);
      emit([{ ...p, atom: false, text: p.text.slice(0, k) }]);
      queue[qi] = { ...p, atom: false, text: p.text.slice(k) };
      continue;
    }
    // Prefer the last sentence end in the second half of the segment, else the last word.
    let cut = cur.length;
    for (let i = cur.length - 1; i > 0; i--) {
      if (!cur[i - 1].atom && /[.!?:;]\s+$/.test(cur[i - 1].text)) {
        if (measure(cur.slice(0, i), first).length >= budget / 2) cut = i;
        break;
      }
    }
    const rest = cur.slice(cut);
    emit(cur.slice(0, cut));
    cur = rest;
    bound = boundOf(cur);
  }
  if (cur.length) emit(cur);
  return segs;
}

/* ---------------------------------------------------------------- packing */

function unitsOf(doc: DiscordDoc, budget: number): Unit[] {
  const units: Unit[] = [];
  let prevBlank = false;
  for (const line of doc.lines) {
    const blank = line.kind === "blank";
    const prio = strongPrio(line) ? 3 : blank || prevBlank ? 2 : 1;
    prevBlank = blank;
    const text = serializeLine(line);
    if (text.length <= budget) {
      units.push({ text, blank, prio });
    } else if (line.kind === "code") {
      splitCode(line, budget).forEach((t, i) =>
        units.push({ text: t, blank: false, prio: i ? 1 : prio, fresh: false }),
      );
    } else if (line.kind === "text") {
      splitText(line, budget).forEach((t, i) =>
        units.push({ text: t, blank: false, prio: i ? 1 : prio, fresh: i === 0 }),
      );
    } else {
      units.push({ text, blank, prio });
    }
  }
  return units;
}

function joinedLength(units: Unit[]): number {
  return units.reduce((n, u, i) => n + u.text.length + (i ? 1 : 0), 0);
}

function pack(units: Unit[], budget: number): string[] {
  const parts: string[] = [];
  let cur: Unit[] = [];
  let size = 0;
  const emit = (us: Unit[]) => {
    let a = 0;
    let b = us.length;
    while (a < b && us[a].blank) a++;
    while (b > a && us[b - 1].blank) b--;
    if (b > a)
      parts.push(
        us
          .slice(a, b)
          .map((u) => u.text)
          .join("\n"),
      );
  };
  const reset = (us: Unit[]) => {
    let a = 0;
    while (a < us.length && us[a].blank) a++;
    cur = us.slice(a);
    size = joinedLength(cur);
  };
  for (const u of units) {
    if (u.fresh && cur.length) {
      emit(cur);
      reset([]);
    }
    for (;;) {
      if (!cur.length && u.blank) break;
      const next = cur.length ? size + 1 + u.text.length : u.text.length;
      if (next <= budget) {
        cur.push(u);
        size = next;
        break;
      }
      // Cut at the best boundary in the second half of the part (the latest on ties).
      let best = cur.length;
      let bestPrio = u.prio;
      let len = 0;
      for (let j = 1; j < cur.length; j++) {
        len += cur[j - 1].text.length + (j > 1 ? 1 : 0);
        if (len >= budget / 2 && cur[j].prio > bestPrio) {
          best = j;
          bestPrio = cur[j].prio;
        } else if (len >= budget / 2 && cur[j].prio === bestPrio && best !== cur.length) {
          best = j;
        }
      }
      emit(cur.slice(0, best));
      reset(cur.slice(best));
    }
  }
  emit(cur);
  return parts;
}

/** Split a doc into message parts, each at most `limit` UTF-16 code units (markers included). */
export function splitDiscord(doc: DiscordDoc, opts: SplitOptions): string[] {
  const whole = doc.lines.map(serializeLine).join("\n");
  if (!whole.trim()) return [];
  if (whole.length <= opts.limit) return [whole];
  if (!opts.markers) return pack(unitsOf(doc, opts.limit), opts.limit);
  // There are at least ceil(length / limit) parts, so start with that many marker digits.
  for (let d = String(Math.ceil(whole.length / opts.limit)).length; ; d++) {
    const widest = 10 ** d - 1;
    const budget = opts.limit - ("\n" + partMarker(widest, widest)).length;
    const parts = pack(unitsOf(doc, budget), budget);
    if (parts.length <= widest) return parts.map((p, i) => p + "\n" + partMarker(i + 1, parts.length));
  }
}
