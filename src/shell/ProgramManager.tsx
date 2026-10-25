// The Program Manager (LP-104): the home screen, as in Windows 3.x. Program
// groups ("Court Work", "Main") with an icon and name for each program the
// active character can see; click or Enter opens one, and the arrow keys move
// between icons. Badges: Case File shows a dot when something's due within 48
// hours, and What's new when there's something unread. Movable group windows
// come later (LP-28).

import type { KeyboardEvent, ReactNode } from "react";
import { GROUPS, PROGRAMS, titleIn, type ProgramDef, type ProgramGroup } from "./registry";

export interface ProgramManagerProps {
  commissioner: boolean;
  /** Deadlines due within 48 hours or overdue on the active character's cases (LP-18). */
  casesDue: number;
  changelogUnread: boolean;
  openChangelog(): void;
  /** Where each program's icon goes: back to where it was left (LP-126), or its start. */
  hrefFor?(program: ProgramDef): string;
}

/** The next icon for an arrow key: along the row for left and right, the nearest in the next row for up and down. */
function nextIcon(icons: HTMLElement[], from: HTMLElement, key: string): HTMLElement | null {
  const i = icons.indexOf(from);
  if (key === "ArrowRight") return icons[i + 1] || null;
  if (key === "ArrowLeft") return icons[i - 1] || null;
  if (key === "Home") return icons[0];
  if (key === "End") return icons[icons.length - 1];
  const here = from.getBoundingClientRect();
  const down = key === "ArrowDown";
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of icons) {
    const r = el.getBoundingClientRect();
    const dy = down ? r.top - here.top : here.top - r.top;
    if (dy <= 1) continue;
    const score = dy * 1000 + Math.abs(r.left - here.left);
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

export default function ProgramManager({
  commissioner,
  casesDue,
  changelogUnread,
  openChangelog,
  hrefFor = (p) => p.start,
}: ProgramManagerProps) {
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    const icons = [...e.currentTarget.querySelectorAll<HTMLElement>(".pm-icon")];
    const from = document.activeElement as HTMLElement;
    if (!icons.includes(from)) return;
    const to = nextIcon(icons, from, e.key);
    e.preventDefault();
    to?.focus();
  };

  const icon = (glyph: string, label: string, badge?: ReactNode) => (
    <>
      <span className="pm-glyph" aria-hidden="true">
        {glyph}
        {badge}
      </span>
      <span className="pm-label">{label}</span>
    </>
  );

  const groups: Array<[ProgramGroup, ReactNode[]]> = (Object.keys(GROUPS) as ProgramGroup[]).map((g) => [
    g,
    PROGRAMS.filter((p) => p.group === g && p.visible({ commissioner })).map((p) => {
      const due = p.id === "cases" && casesDue > 0;
      return (
        <li key={p.id}>
          <a
            className="pm-icon"
            id={"pm-" + p.id}
            // Something due: Case File opens on Upcoming.
            href={due ? "#cases/upcoming" : hrefFor(p)}
            title={due ? casesDue + " due within 48 hours: see Upcoming" : undefined}
            aria-label={due ? titleIn(p, "classic") + " (" + casesDue + " due soon)" : undefined}
          >
            {icon(p.icon, titleIn(p, "classic"), due && <span className="pm-badge due-dot" id="due-dot" />)}
          </a>
        </li>
      );
    }),
  ]);
  // What's new isn't a program: it opens its dialog, from the Main group.
  groups[groups.findIndex(([g]) => g === "main")][1].push(
    <li key="changelog">
      <button
        type="button"
        className="pm-icon"
        id="pm-changelog"
        aria-label={changelogUnread ? "What's new (unread)" : undefined}
        onClick={openChangelog}
      >
        {icon("✎", "What's new", changelogUnread && <span className="pm-badge" />)}
      </button>
    </li>,
  );

  return (
    <div className="layout no-nav">
      <main className="editor program-manager" id="program-manager" onKeyDown={onKey}>
        {groups.map(([g, items]) => (
          <section key={g} className="pm-group window" aria-labelledby={"pm-group-" + g}>
            <h2 className="title-bar pm-group-title" id={"pm-group-" + g}>
              <span className="title-bar-text">{GROUPS[g]}</span>
            </h2>
            <ul className="pm-icons">{items}</ul>
          </section>
        ))}
      </main>
    </div>
  );
}
