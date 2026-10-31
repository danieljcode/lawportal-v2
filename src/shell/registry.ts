// The programs (LP-103): one entry each, so a program is added in one place.
// The shell draws the open one full-screen in its own window and gives each the
// File, View and Help menus; the Program Manager (LP-104) shows the visible
// ones as icons, in their group.

import { createElement, lazy, type ComponentType } from "react";
import { flagOn, type Flag } from "@/lib/flags";
import type { ShellMode } from "@/lib/shell";
import { CONTROL_TITLE, SETTINGS_TITLE, type ProgramId, type Route } from "./useRoute";
import type { ProgramProps } from "./program";

type Module = { default: ComponentType<ProgramProps> };

/**
 * A program's code, loaded the first time it's opened or preloaded (LP-122). Until it's loaded the
 * view suspends (App shows Loading…); after that it renders at once, with no Loading… flash.
 */
function lazyProgram(load: () => Promise<Module>): Pick<ProgramDef, "load" | "View"> {
  let loaded: Module["default"] | null = null;
  const preload = () => load().then((m) => ((loaded = m.default), m));
  const Lazy = lazy(preload);
  return { load: preload, View: (props) => createElement(loaded ?? Lazy, props) };
}

/** The Program Manager's groups, in order. */
export const GROUPS = { court: "Court Work", main: "Main" } as const;
export type ProgramGroup = keyof typeof GROUPS;

export interface ProgramDef {
  id: ProgramId;
  title: string;
  /** Its name in the Classic layout, when that differs ("Control Panel" for Settings, LP-109). */
  classicTitle?: string;
  /** A one-character icon for the title bar, the Program Manager and the taskbar. */
  icon: string;
  /** The Program Manager group it's in. */
  group: ProgramGroup;
  /** Where it opens. */
  start: string;
  /** Who can see it in the Program Manager (anyone can open a link to it). */
  visible(who: { commissioner: boolean }): boolean;
  /** Unfinished: listed only while this flag is on (LP-120). */
  flag?: Flag;
  /** Its navigation pane, shown as a drawer at phone width: the pane's id and what it lists. */
  nav?: { id: string; label: string };
  /** Its pages, for the File menu and the jump box (LP-128). */
  sections?: readonly { label: string; href: string }[];
  /** Fetch its code now (App does when idle, so opening it later is instant). */
  load(): Promise<unknown>;
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
    ...lazyProgram(() => import("@/programs/filings")),
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
    ...lazyProgram(() => import("@/programs/cases")),
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
      { label: "Rolodex", href: "#clients/rolodex" },
    ],
    ...lazyProgram(() => import("@/programs/clients")),
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
    ...lazyProgram(() => import("@/programs/library")),
  },
  {
    id: "jap",
    title: "J.A.P.",
    icon: "★",
    group: "court",
    start: "#jap",
    visible: (who) => who.commissioner,
    ...lazyProgram(() => import("@/programs/jap")),
  },
  {
    id: "control",
    title: SETTINGS_TITLE,
    classicTitle: CONTROL_TITLE,
    icon: "⚙",
    group: "main",
    start: "#control",
    visible: everyone,
    ...lazyProgram(() => import("@/programs/control")),
  },
];

/** Whether a program is listed (Program Manager, Home, jump box, preload) for this character. */
export function shown(p: Pick<ProgramDef, "visible" | "flag">, who: { commissioner: boolean }): boolean {
  return (!p.flag || flagOn(p.flag)) && p.visible(who);
}

/** A program's name in this layout. */
export function titleIn(p: Pick<ProgramDef, "title" | "classicTitle">, layout: ShellMode): string {
  return (layout === "classic" && p.classicTitle) || p.title;
}

/** The program a route belongs to; null for home (the Program Manager). */
export function programFor(route: Route): ProgramDef | null {
  if (route.program === "home") return null;
  return PROGRAMS.find((p) => p.id === route.program)!;
}
