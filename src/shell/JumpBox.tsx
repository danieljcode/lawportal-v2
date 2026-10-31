// The jump box (LP-128): Ctrl+K (Cmd+K on a Mac), or "/" when not typing in a
// field, opens it from anywhere, in both layouts. Type a few letters to find a
// program, one of its sections or a court form, best matches first; the arrow
// keys and Enter pick one, Esc closes it and puts the focus back. The input is
// an ARIA combobox over a listbox, and the number of results is announced.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { KIND_LABELS, search, type JumpEntry } from "@/lib/jump";
import Dialog from "@/ui/Dialog";

export interface JumpBoxProps {
  open: boolean;
  onClose(): void;
  entries: readonly JumpEntry[];
  /** Go to the picked entry; the box has already closed. */
  onPick(entry: JumpEntry): void;
}

export default function JumpBox({ open, onClose, entries, onPick }: JumpBoxProps) {
  // Esc (or ✕) puts the focus back where it was when the box opened. It's noted before the
  // dialog takes the focus (Dialog opens it in a passive effect) and given back after it closes.
  const before = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) before.current = document.activeElement as HTMLElement | null;
  }, [open]);
  useEffect(() => {
    if (open) {
      // showModal focuses the [autofocus] input; this covers jsdom (tests), which has no showModal.
      document.getElementById("jump-input")?.focus();
      return;
    }
    const el = before.current;
    before.current = null;
    if (el?.isConnected && el !== document.body) el.focus();
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} titleId="jump-title" title="Jump to" id="jump-box" className="jump-box">
      <JumpSearch
        entries={entries}
        onPick={(e) => {
          before.current = null;
          onClose();
          onPick(e);
        }}
      />
    </Dialog>
  );
}

/** The search itself; mounted only while the box is open, so each opening starts empty. */
function JumpSearch({ entries, onPick }: { entries: readonly JumpEntry[]; onPick(e: JumpEntry): void }) {
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const results = useMemo(() => search(query, entries), [query, entries]);
  const current = results.length ? Math.min(at, results.length - 1) : -1;

  // The highlighted result stays in view.
  useEffect(() => {
    if (current < 0) return;
    list.current?.querySelector<HTMLElement>(`[data-index="${current}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [current]);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const n = results.length;
    if (e.key === "ArrowDown") setAt(n ? (current + 1) % n : 0);
    else if (e.key === "ArrowUp") setAt(n ? (current - 1 + n) % n : 0);
    else if (e.key === "Home" && e.ctrlKey) setAt(0);
    else if (e.key === "End" && e.ctrlKey) setAt(Math.max(n - 1, 0));
    else if (e.key === "Enter") {
      if (current >= 0) onPick(results[current]);
    } else return;
    e.preventDefault();
  };

  const optionId = (e: JumpEntry) => "jump-opt-" + e.id;
  return (
    <>
      <label className="jump-label" htmlFor="jump-input">
        Find a program, section or form
      </label>
      <input
        // Read by showModal's focusing steps, so the input gets the focus, not ✕.
        ref={(el) => el?.setAttribute("autofocus", "")}
        id="jump-input"
        className="jump-input"
        type="text"
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls="jump-results"
        aria-autocomplete="list"
        aria-activedescendant={current >= 0 ? optionId(results[current]) : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder="Type a few letters…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setAt(0);
        }}
        onKeyDown={onKey}
      />
      <p className="sr-only" role="status" aria-live="polite" id="jump-count">
        {results.length ? results.length + (results.length === 1 ? " result" : " results") : "No results"}
      </p>
      {results.length ? (
        <ul className="jump-results" id="jump-results" role="listbox" aria-label="Results" ref={list}>
          {results.map((r, i) => (
            <li
              key={r.id}
              id={optionId(r)}
              data-index={i}
              role="option"
              aria-selected={i === current}
              className={"jump-result" + (i === current ? " current" : "")}
              // A click picks it; pressing down mustn't take the focus from the input.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(r)}
              onPointerMove={() => i !== current && setAt(i)}
            >
              <span className="jump-name">{r.label}</span>
              <span className="jump-where">
                <span className="jump-kind">{KIND_LABELS[r.kind]}</span>
                {r.detail && " · " + r.detail}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted jump-empty" id="jump-empty">
          Nothing matches “{query.trim()}”.
        </p>
      )}
      <p className="small muted jump-hint">↑ ↓ to choose, Enter to go, Esc to close</p>
    </>
  );
}

/** Typing in this element: "/" is part of the text there, not the shortcut. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)
    return true;
  return (
    target instanceof HTMLInputElement &&
    !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(target.type)
  );
}

/**
 * The keys that open the jump box: Ctrl+K or Cmd+K anywhere but another dialog (opening it there
 * would close that one and lose what's typed in it, LP-131), or "/" outside a field and any dialog.
 */
export function isJumpKey(e: globalThis.KeyboardEvent): boolean {
  if (e.isComposing || e.altKey) return false;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "k")
    return !document.querySelector("dialog[open]:not(#jump-box)");
  return e.key === "/" && !e.ctrlKey && !e.metaKey && !isTyping(e.target) && !document.querySelector("dialog[open]");
}

/** Ctrl+Shift+F or Cmd+Shift+F: open Find (LP-95), but not over a dialog. */
export function isFindKey(e: globalThis.KeyboardEvent): boolean {
  return (
    !e.isComposing &&
    !e.altKey &&
    (e.ctrlKey || e.metaKey) &&
    e.shiftKey &&
    e.key.toLowerCase() === "f" &&
    !document.querySelector("dialog[open]")
  );
}

/** Ctrl+K, or Cmd+K on a Mac, for the menu. */
export function jumpShortcut(): string {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘K" : "Ctrl+K";
}
