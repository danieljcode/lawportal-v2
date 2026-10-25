// The programs (LP-103): one entry each, so a program is added in one place.
// The shell draws the open one full-screen in its own window and gives each the
// File, View and Help menus; the Program Manager (LP-104) shows the visible
// ones as icons, in their group.

import type { ComponentType } from "react";
import type { ProgramId, Route } from "../useRoute";
import CaseFileProgram from "./CaseFileProgram";
import ClientsProgram from "./ClientsProgram";
import ControlPanelProgram from "./ControlPanelProgram";
import CourtFilingsProgram from "./CourtFilingsProgram";
import JapProgram from "./JapProgram";
import LibraryProgram from "./LibraryProgram";
import type { ProgramProps } from "./shell";

/** The Program Manager's groups, in order. */
export const GROUPS = { court: "Court Work", main: "Main" } as const;
export type ProgramGroup = keyof typeof GROUPS;

export interface ProgramDef {
  id: ProgramId;
  title: string;
  /** A one-character icon for the title bar, the Program Manager and the taskbar. */
  icon: string;
  /** The Program Manager group it's in. */
  group: ProgramGroup;
  /** Where it opens. */
  start: string;
  /** Who can see it in the Program Manager (anyone can open a link to it). */
  visible(who: { commissioner: boolean }): boolean;
  /** Its navigation pane, shown as a drawer at phone width: the pane's id and what it lists. */
  nav?: { id: string; label: string };
  /** Its pages, for the File menu and the jump box (LP-128). */
  sections?: readonly { label: string; href: string }[];
  View: ComponentType<ProgramProps>;
}

const everyone = () => true;

export const PROGRAMS: readonly ProgramDef[] = [
  {
    id: "filings",
    title: "Court Filings",
    icon: "⚖",
    group: "court",
    start: "#filings",
    visible: everyone,
    nav: { id: "sidebar", label: "form list" },
    View: CourtFilingsProgram,
  },
  {
    id: "cases",
    title: "Case File",
    icon: "🗀",
    group: "court",
    start: "#cases",
    visible: everyone,
    nav: { id: "case-nav", label: "Case File pages" },
    sections: [
      { label: "All cases", href: "#cases" },
      { label: "Upcoming", href: "#cases/upcoming" },
    ],
    View: CaseFileProgram,
  },
  {
    id: "clients",
    title: "Clients",
    icon: "☺",
    group: "court",
    start: "#clients/intake",
    visible: everyone,
    nav: { id: "clients-nav", label: "Clients pages" },
    sections: [
      { label: "New client intake", href: "#clients/intake" },
      { label: "Conflict check", href: "#clients/conflicts" },
    ],
    View: ClientsProgram,
  },
  {
    id: "library",
    title: "Law Library",
    icon: "§",
    group: "court",
    start: "#library/penal-code",
    visible: everyone,
    nav: { id: "library-nav", label: "Law Library sections" },
    sections: [
      { label: "Penal Code", href: "#library/penal-code" },
      { label: "Precedents", href: "#library/precedents" },
    ],
    View: LibraryProgram,
  },
  {
    id: "jap",
    title: "J.A.P.",
    icon: "★",
    group: "court",
    start: "#jap",
    visible: (who) => who.commissioner,
    View: JapProgram,
  },
  {
    id: "control",
    title: "Control Panel",
    icon: "⚙",
    group: "main",
    start: "#control",
    visible: everyone,
    View: ControlPanelProgram,
  },
];

/** The program a route belongs to; null for home (the Program Manager). */
export function programFor(route: Route): ProgramDef | null {
  if (route.program === "home") return null;
  return PROGRAMS.find((p) => p.id === route.program)!;
}
