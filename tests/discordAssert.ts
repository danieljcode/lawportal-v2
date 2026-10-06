// Shared checks for the Discord converter and splitter suites (not a test file).

const FENCE_LINE = /^```/;

/** The lines of `md` outside fenced code blocks. */
export function outsideFences(md: string): string[] {
  const out: string[] = [];
  let inCode = false;
  for (const line of md.split("\n")) {
    if (FENCE_LINE.test(line)) {
      inCode = !inCode;
      continue;
    }
    if (!inCode) out.push(line);
  }
  return out;
}

/** Number of fence lines (opening and closing) in `md`. */
export function fenceCount(md: string): number {
  return md.split("\n").filter((l) => FENCE_LINE.test(l)).length;
}

function count(s: string, d: string): [number, string] {
  const parts = s.split(d);
  return [parts.length - 1, parts.join("")];
}

/** One line's formatting markers are balanced (escapes, inline code and URLs ignored). */
export function lineBalanced(line: string): boolean {
  let s = line
    .replace(/\\[\s\S]/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/https?:\/\/[^\s)]+/g, "");
  for (const d of ["**", "__", "~~", "||", "*"]) {
    const [n, rest] = count(s, d);
    if (n % 2) return false;
    s = rest;
  }
  return true;
}

/**
 * Every span in a part is balanced: outside fenced blocks each line has an even number of
 * `**`, `__`, `~~`, `||` and `*`, and the fence lines pair up.
 */
export function balanced(part: string): boolean {
  return fenceCount(part) % 2 === 0 && outsideFences(part).every(lineBalanced);
}

/** No run of 3+ newlines outside code blocks. */
export function noTripleBlank(md: string): boolean {
  let inCode = false;
  let blanks = 0;
  for (const line of md.split("\n")) {
    if (FENCE_LINE.test(line)) {
      inCode = !inCode;
      blanks = 0;
      continue;
    }
    if (inCode) continue;
    blanks = line === "" ? blanks + 1 : 0;
    if (blanks > 1) return false;
  }
  return true;
}
