// The programs (LP-103): one entry each, so a program is added in one place.
// The shell draws the open one full-screen in its own window, lists the
// visible ones in the Start menu, and gives each the File, View and Help menus.

import type { ComponentType } from "react";
import type { ProgramId, Route } from "../useRoute";
import CaseFileProgram from "./CaseFileProgram";
import ClientsProgram from "./ClientsProgram";
import ControlPanelProgram from "./ControlPanelProgram";
import CourtFilingsProgram from "./CourtFilingsProgram";
import JapProgram from "./JapProgram";
import LibraryProgram from "./LibraryProgram";
import type { ProgramProps } from "./shell";

export interface ProgramDef {
  id: ProgramId;
  title: string;
  /** A one-character icon for the title bar, Start menu and taskbar. */
  icon: string;
  /** Where it opens. */
  start: string;
  /** Who can see it in the Start menu (anyone can open a link to it). */
  visible(who: { commissioner: boolean }): boolean;
  /** It has a navigation pane, shown as a drawer at phone width. */
  nav?: boolean;
  View: ComponentType<ProgramProps>;
}

const everyone = () => true;

export const PROGRAMS: readonly ProgramDef[] = [
  {
    id: "filings",
    title: "Court Filings",
    icon: "⚖",
    start: "#filings",
    visible: everyone,
    nav: true,
    View: CourtFilingsProgram,
  },
  { id: "cases", title: "Case File", icon: "🗀", start: "#cases", visible: everyone, View: CaseFileProgram },
  { id: "clients", title: "Clients", icon: "☺", start: "#clients/intake", visible: everyone, View: ClientsProgram },
  {
    id: "library",
    title: "Law Library",
    icon: "§",
    start: "#library/penal-code",
    visible: everyone,
    View: LibraryProgram,
  },
  {
    id: "jap",
    title: "J.A.P.",
    icon: "★",
    start: "#jap",
    visible: (who) => who.commissioner,
    View: JapProgram,
  },
  { id: "control", title: "Control Panel", icon: "⚙", start: "#control", visible: everyone, View: ControlPanelProgram },
];

/** The program a route belongs to; home is Court Filings' start page until the Program Manager (LP-104). */
export function programFor(route: Route): ProgramDef {
  const id = route.program === "home" ? "filings" : route.program;
  return PROGRAMS.find((p) => p.id === id)!;
}
