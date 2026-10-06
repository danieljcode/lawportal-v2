// Discord markdown → HTML for the dark preview in the Discord tab.
//
// A close approximation of Discord's renderer for the markdown discord.ts
// produces. Every piece of text goes through escapeHtml, and the only attribute
// built from content is an escaped http(s) href.

import { escapeHtml } from "./template";

const PUNCT = /[!-/:-@[-`{-~]/;
const LINK_RE = /^\[((?:\\[\s\S]|[^\]\\])*)\]\((https?:\/\/[^\s)]+)\)/;
const BARE_URL_RE = /^https?:\/\/[^\s<]+[^\s<.,:;"')\]]/;

function link(href: string, inner: string): string {
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
}

/** Index of the closing delimiter `d` at or after `from`, skipping escapes and inline code; -1 if none. */
function findClose(s: string, from: number, d: string): number {
  for (let j = from; j < s.length; j++) {
    const c = s[j];
    if (c === "\\") {
      j++;
      continue;
    }
    if (c === "`") {
      const k = s.indexOf("`", j + 1);
      if (k > j) {
        j = k;
        continue;
      }
    }
    if (s.startsWith(d, j)) {
      if (d === "**" && s[j + 2] === "*") {
        // `***x***`: the closing `**` is the last two of the run
        let e = j;
        while (s[e] === "*") e++;
        return e - 2 >= from ? e - 2 : -1;
      }
      if (d === "*") {
        if (s[j + 1] === "*") {
          j++;
          continue;
        }
        if (s[j - 1] === " ") continue;
      }
      return j;
    }
  }
  return -1;
}

const SPANS: Array<[string, (inner: string) => string]> = [
  ["**", (x) => `<strong>${x}</strong>`],
  ["__", (x) => `<u>${x}</u>`],
  ["~~", (x) => `<s>${x}</s>`],
  ["||", (x) => `<span class="dc-spoiler" tabindex="0">${x}</span>`],
];

/** Inline markdown of one line → HTML. */
function inline(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length && PUNCT.test(s[i + 1])) {
      out += escapeHtml(s[i + 1]);
      i += 2;
      continue;
    }
    if (c === "`") {
      const k = s.indexOf("`", i + 1);
      if (k > i + 1) {
        out += `<code class="dc-code">${escapeHtml(s.slice(i + 1, k))}</code>`;
        i = k + 1;
        continue;
      }
    }
    if (c === "[") {
      const m = LINK_RE.exec(s.slice(i));
      if (m) {
        out += link(m[2], inline(m[1]));
        i += m[0].length;
        continue;
      }
    }
    if (c === "h" && (s.startsWith("http://", i) || s.startsWith("https://", i))) {
      const m = BARE_URL_RE.exec(s.slice(i));
      if (m) {
        out += link(m[0], escapeHtml(m[0]));
        i += m[0].length;
        continue;
      }
    }
    let matched = false;
    for (const [d, wrap] of SPANS) {
      if (s.startsWith(d, i)) {
        const j = findClose(s, i + d.length, d);
        if (j > i + d.length) {
          out += wrap(inline(s.slice(i + d.length, j)));
          i = j + d.length;
          matched = true;
        }
        break;
      }
    }
    if (matched) continue;
    if (c === "*" && s[i + 1] !== " " && s[i + 1] !== undefined) {
      const j = findClose(s, i + 1, "*");
      if (j > i + 1) {
        out += `<em>${inline(s.slice(i + 1, j))}</em>`;
        i = j + 1;
        continue;
      }
    }
    out += escapeHtml(c);
    i++;
  }
  return out;
}

function renderLines(lines: string[]): string {
  let out = "";
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i] !== "```") body.push(lines[i++]);
      i++; // the closing fence
      out += `<pre class="dc-codeblock"><code>${escapeHtml(body.join("\n"))}</code></pre>`;
      continue;
    }
    if (l === ">" || l.startsWith("> ")) {
      const inner: string[] = [];
      while (i < lines.length && (lines[i] === ">" || lines[i].startsWith("> "))) inner.push(lines[i++].slice(2));
      out += `<blockquote class="dc-quote">${renderLines(inner)}</blockquote>`;
      continue;
    }
    out += renderLine(l);
    i++;
  }
  return out;
}

function renderLine(l: string): string {
  if (!l.trim()) return '<div class="dc-blank"></div>';
  const h = /^(#{1,3}) (.*)$/.exec(l);
  if (h) return `<div class="dc-h${h[1].length}">${inline(h[2])}</div>`;
  if (l.startsWith("-# ")) return `<div class="dc-sub">${inline(l.slice(3))}</div>`;
  const li = /^((?: {2})*)(- |(\d+)\. )(.*)$/.exec(l);
  if (li) {
    const depth = Math.min(li[1].length / 2, 4);
    const bullet = li[3] ? `<span class="dc-bullet">${escapeHtml(li[3])}.</span>` : '<span class="dc-bullet" aria-hidden="true">•</span>';
    return `<div class="dc-li dc-depth-${depth}">${bullet} ${inline(li[4])}</div>`;
  }
  return `<div class="dc-line">${inline(l)}</div>`;
}

/** One message's markdown → preview HTML. */
export function renderDiscordHtml(markdown: string): string {
  return renderLines(markdown.split("\n"));
}
