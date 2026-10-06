// Clipboard helpers for the output panes (FR7). Client only.
//
// copyRich puts HTML (keeps tables, bold, sizes) and BBCode on the clipboard in
// one go. Over plain http on the LAN `navigator.clipboard` doesn't exist, so
// both helpers fall back to a selection plus execCommand("copy").

function execCopy(): boolean {
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

/** Select a rendered copy of `html` in a hidden contenteditable box and copy it. */
function copyViaSelection(html: string): boolean {
  const box = document.createElement("div");
  box.contentEditable = "true";
  box.className = "copy-buffer";
  // Engine output only: every user value in it is escaped (design §Invariants).
  box.innerHTML = html;
  document.body.appendChild(box);
  const sel = window.getSelection();
  let ok = false;
  try {
    const range = document.createRange();
    range.selectNodeContents(box);
    sel?.removeAllRanges();
    sel?.addRange(range);
    ok = execCopy();
  } finally {
    sel?.removeAllRanges();
    box.remove();
  }
  return ok;
}

function copyTextViaSelection(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.className = "copy-buffer";
  document.body.appendChild(ta);
  try {
    ta.select();
    return execCopy();
  } finally {
    ta.remove();
  }
}

/** Copy `html` as text/html with `text` as text/plain. Resolves false when every method failed. */
export async function copyRich(html: string, text: string): Promise<boolean> {
  const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  if (clip && typeof clip.write === "function" && typeof ClipboardItem !== "undefined") {
    try {
      await clip.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return true;
    } catch {
      // rejected (permissions, unsupported type): fall back below
    }
  }
  return copyViaSelection(html);
}

/** Copy plain text. Resolves false when every method failed. */
export async function copyText(text: string): Promise<boolean> {
  const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  if (clip && typeof clip.writeText === "function") {
    try {
      await clip.writeText(text);
      return true;
    } catch {
      // fall back below
    }
  }
  return copyTextViaSelection(text);
}
