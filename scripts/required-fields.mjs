// Which fields a court form requires (LP-87), written into forms.json by port-forms.
//
// The rule: the case number, the parties' names, and any name or signature
// filled from the character (the filer's or judge's signature block). Labels
// are read the way src/lib/template/parse.ts reads a token's head; tick boxes
// are never required. The Additional Templates list theirs by hand.

const KEY_LABEL = /^(case number|(plaintiff|defendant|appellant|petitioner|respondent) name)$/i;
const SIGNING = new Set(["name", "signature"]);

/** The required labels for a template, in order of first appearance. */
export function requiredFields(html) {
  const out = [];
  for (const m of html.matchAll(/\{\{([^{}]*)\}\}/g)) {
    const token = m[1];
    if (/^\s*[#/?$]|^\s*--/.test(token)) continue;
    const spec = token.split("|")[0].replace(/\s*>\s*[a-z]+\s*$/, "");
    const parts = spec.split(":");
    if ((parts[1] || "text").trim().toLowerCase() === "check") continue;
    let head = parts[0].trim();
    let character = "";
    const at = head.indexOf("@");
    if (at >= 0) {
      character = head.slice(at + 1).trim();
      head = head.slice(0, at).trim();
    }
    const eq = head.indexOf("=");
    if (eq >= 0) head = head.slice(0, eq).trim();
    if (!head || out.includes(head)) continue;
    if (KEY_LABEL.test(head) || SIGNING.has(character)) out.push(head);
  }
  return out;
}
