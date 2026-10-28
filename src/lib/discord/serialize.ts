// The line IR (DiscordDoc) to markdown text.
import { escapeLineStart } from "./escape";
import { type DLine, FENCE, MARKERS, type Mark, RULE, type Run } from "./model";

/* ------------------------------------------------------------- serializing */

export function splitWs(text: string): [string, string, string] {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text) as RegExpExecArray;
  return [m[1], m[2], m[3]];
}

/**
 * Runs → one line of markdown. Spans open and close around the runs that carry
 * them, whitespace stays outside the markers, no empty spans, and everything is
 * closed at the end.
 */
export function serializeRuns(runs: Run[]): string {
  let out = "";
  let open: Mark[] = [];
  let pendingWs = "";
  for (const run of runs) {
    if (!run.atom && /^\s*$/.test(run.text)) {
      pendingWs += run.text;
      continue;
    }
    const marks = run.marks;
    let k = 0;
    while (k < open.length && k < marks.length && open[k] === marks[k]) k++;
    const closers = open
      .slice(k)
      .reverse()
      .map((m) => MARKERS[m])
      .join("");
    out += closers;
    const [lead, core, trail] = run.atom ? ["", run.text, ""] : splitWs(run.text);
    const ws = pendingWs + lead;
    out += ws;
    pendingWs = "";
    const openers = marks
      .slice(k)
      .map((m) => MARKERS[m])
      .join("");
    // `**a**` + `*b*` would read as `***`: keep same-char markers apart.
    if (closers && openers && !ws && closers[closers.length - 1] === openers[0]) out += "\u200b";
    out += openers + core;
    open = marks.slice();
    pendingWs = trail;
  }
  out += open
    .slice()
    .reverse()
    .map((m) => MARKERS[m])
    .join("");
  return out.trimEnd();
}

/** One IR line as markdown. A code line is the whole fenced block. */
export function serializeLine(line: DLine): string {
  switch (line.kind) {
    case "blank":
      return "";
    case "rule":
      return RULE;
    case "code":
      return FENCE + line.lang + "\n" + line.lines.join("\n") + "\n" + FENCE;
    case "text":
      return line.prefix + escapeLineStart(serializeRuns(line.runs));
  }
}
