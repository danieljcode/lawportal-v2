// Sticky notes (LP-55), one set shown two ways: a Notes panel on Modern's Home
// (small cards, newest first) and notes on the Classic desktop that can be
// dragged anywhere and resized, kept inside the desktop at any width. Both
// load the first time Home shows. The notes themselves: src/lib/notes.ts.

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { caseStore } from "@/lib/cases";
import { NOTE_COLOURS, NOTE_SIZE, noteStore, type Note } from "@/lib/notes";
import { useCaseVersion, useNoteVersion } from "@/ui/useStore";

const COLOUR_LABELS = { yellow: "Yellow", pink: "Pink", blue: "Blue", green: "Green" } as const;
/** How far an arrow key moves a note on the desktop. */
const KEY_STEP = 16;

function useNotes(): Note[] {
  const version = useNoteVersion();
  return version >= 0 ? noteStore().list() : [];
}

function remove(note: Note) {
  if (confirm(note.text.trim() ? `Delete the note "${note.text.trim().slice(0, 40)}"?` : "Delete this note?"))
    noteStore().remove(note.id);
}

/** The note's text, colour, case link and delete button, the same in both looks. */
function NoteBody({ note, n }: { note: Note; n: number }) {
  const caseVersion = useCaseVersion();
  const cases = caseVersion >= 0 ? caseStore().list() : [];
  const linked = note.caseId ? cases.find((c) => c.id === note.caseId) : undefined;
  const save = (change: Partial<Note>) => noteStore().save({ ...note, ...change });
  return (
    <>
      <textarea
        className="sticky-text"
        aria-label={"Note " + n}
        placeholder="Type a note…"
        value={note.text}
        maxLength={500}
        onChange={(e) => save({ text: e.target.value })}
      />
      <div className="sticky-tools">
        <span className="sticky-swatches" role="group" aria-label="Colour">
          {NOTE_COLOURS.map((c) => (
            <button
              key={c}
              type="button"
              className={"sticky-swatch sticky-" + c}
              aria-label={COLOUR_LABELS[c]}
              aria-pressed={note.colour === c}
              onClick={() => save({ colour: c })}
            />
          ))}
        </span>
        <select
          className="sticky-case"
          aria-label="Case"
          value={linked ? linked.id : ""}
          onChange={(e) => save({ caseId: e.target.value || undefined })}
        >
          <option value="">No case</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.caseNumber}
            </option>
          ))}
        </select>
        <button type="button" className="mini sticky-delete" aria-label="Delete note" onClick={() => remove(note)}>
          ×
        </button>
      </div>
      {linked && (
        <a className="sticky-link small" href={"#cases/" + linked.id}>
          Open {linked.caseNumber}
        </a>
      )}
    </>
  );
}

/** Modern's Home: the notes as small cards, newest first, with + New note. */
export function NotesPanel() {
  const notes = useNotes();
  return (
    <section className="home-card home-notes" aria-labelledby="home-notes-title">
      <div className="home-work-head">
        <h3 id="home-notes-title">Notes</h3>
        <button type="button" className="mini" id="new-note" onClick={() => noteStore().add()}>
          + New note
        </button>
      </div>
      {notes.length ? (
        <ul className="notes-list" id="notes-list">
          {notes.map((note, i) => (
            <li key={note.id} className={"sticky sticky-" + note.colour}>
              <NoteBody note={note} n={i + 1} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted" id="notes-empty">
          No notes yet. Jot down a reminder like &ldquo;Call the DA about the plea&rdquo;.
        </p>
      )}
    </section>
  );
}

/** Keep a note inside the desktop: as much of it as fits, and never its top-left corner outside. */
export function clampNote(note: Pick<Note, "x" | "y" | "w" | "h">, width: number, height: number) {
  const w = Math.min(note.w, Math.max(NOTE_SIZE.minW, width));
  const h = Math.min(note.h, Math.max(NOTE_SIZE.minH, height));
  return {
    x: Math.max(0, Math.min(note.x, width - w)),
    y: Math.max(0, Math.min(note.y, height - h)),
    w,
    h,
  };
}

type Drag = { kind: "move" | "size"; id: string; startX: number; startY: number; from: Note };

/** Classic's desktop: the notes on top of the Program Manager, each dragged by its title strip and sized by its corner. */
export function DesktopNotes() {
  const notes = useNotes();
  const layer = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);
  /** The dragged note's place while the pointer is down; saved when it's let go. */
  const [live, setLive] = useState<Note | null>(null);

  useEffect(() => {
    const el = layer.current;
    if (!el) return;
    const measure = () => setArea({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const watch = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    watch?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      watch?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const start = (e: PointerEvent<HTMLElement>, kind: Drag["kind"], note: Note) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ kind, id: note.id, startX: e.clientX, startY: e.clientY, from: note });
    setLive(note);
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const f = drag.from;
    setLive(
      drag.kind === "move"
        ? { ...f, x: f.x + dx, y: f.y + dy }
        : {
            ...f,
            w: Math.min(NOTE_SIZE.maxW, Math.max(NOTE_SIZE.minW, f.w + dx)),
            h: Math.min(NOTE_SIZE.maxH, Math.max(NOTE_SIZE.minH, f.h + dy)),
          },
    );
  };
  /** Inside the desktop, once its size is known. */
  const fit = (note: Note): Note => (area.width ? { ...note, ...clampNote(note, area.width, area.height) } : note);
  const end = () => {
    if (drag && live) noteStore().save(fit(live));
    setDrag(null);
    setLive(null);
  };
  const nudge = (e: KeyboardEvent<HTMLElement>, note: Note) => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!step) return;
    e.preventDefault();
    noteStore().save(fit({ ...note, x: note.x + step[0] * KEY_STEP, y: note.y + step[1] * KEY_STEP }));
  };

  return (
    <div className="desktop-notes" ref={layer} id="desktop-notes">
      {/* Oldest first, so the newest note sits on top. */}
      {[...notes].reverse().map((saved, i) => {
        const n = notes.length - i;
        const note = live && live.id === saved.id ? live : saved;
        const place = fit(note);
        return (
          <article
            key={note.id}
            className={"sticky desktop-note sticky-" + note.colour + (drag?.id === note.id ? " dragging" : "")}
            style={{ left: place.x, top: place.y, width: place.w, height: place.h }}
            aria-label={"Note " + n}
          >
            <div
              className="sticky-grip"
              role="button"
              tabIndex={0}
              aria-label="Move note (drag, or use the arrow keys)"
              onPointerDown={(e) => start(e, "move", note)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              onKeyDown={(e) => nudge(e, note)}
            />
            <NoteBody note={note} n={n} />
            <div
              className="sticky-resize"
              aria-hidden="true"
              onPointerDown={(e) => start(e, "size", note)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            />
          </article>
        );
      })}
    </div>
  );
}
