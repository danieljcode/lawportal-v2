// Hash routing for the program shell (LP-103; from App.tsx in LP-7): which
// program is open and where in it, the last place reopened on boot,
// back/forward, the page title, and going home. Routes are prefixed by
// program: #filings/<formId>, #cases/<caseId>, #cases/upcoming,
// #clients/intake, #clients/conflicts, #library/penal-code,
// #library/precedents, #jap, #control. The old flat hashes (#cases, #upcoming,
// #intake, #conflicts, #library, #jap, #<formId>) still open the same place
// and are rewritten to the new ones.

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { getForm } from "@/data";
import { appTitle } from "@/branding";
import { LAST_FORM_KEY } from "@/lib/formState";
import { defaultKV } from "@/lib/storage";
import type { FormDef } from "@/lib/types";

export type ProgramId = "filings" | "cases" | "clients" | "library" | "jap" | "control";
export type ClientsPage = "intake" | "conflicts";
export type LibraryPage = "penal-code" | "precedents";

export type Route =
  | { program: "home" }
  | { program: "filings"; formId: string | null }
  | { program: "cases"; caseId: string | null; upcoming?: boolean }
  | { program: "clients"; page: ClientsPage }
  | { program: "library"; page: LibraryPage }
  | { program: "jap" }
  | { program: "control" };

/** The window title and the browser tab's suffix, from the firm's branding (LP-22). */
export const APP_TITLE = appTitle();
export const JAP_TITLE = "Judicial Advancement Portfolio";
export const CASES_TITLE = "Case File";
export const UPCOMING_TITLE = "Upcoming";
export const INTAKE_TITLE = "New client intake";
export const CONFLICTS_TITLE = "Conflict check";
export const LIBRARY_TITLE = "Law Library";
export const CONTROL_TITLE = "Control Panel";

/** The one hash for a route: "#cases/<id>", "#filings/<formId>", "" for home. */
export function hashFor(r: Route): string {
  switch (r.program) {
    case "home":
      return "";
    case "filings":
      return "#filings" + (r.formId ? "/" + r.formId : "");
    case "cases":
      return "#cases" + (r.upcoming ? "/upcoming" : r.caseId ? "/" + r.caseId : "");
    case "clients":
      return "#clients/" + r.page;
    case "library":
      return "#library/" + r.page;
    default:
      return "#" + r.program;
  }
}

const CASE_ID = /^[a-z0-9]{4,32}$/;

/**
 * The route for a hash (with or without "#"), new or old. Anything unknown is home; a
 * program with an unknown page opens at its start.
 */
export function parseHash(hash: string): Route {
  let id = "";
  try {
    id = decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    id = "";
  }
  const [head, rest = ""] = id.split(/\/(.*)/s);
  switch (head) {
    case "":
      return { program: "home" };
    case "filings":
      return { program: "filings", formId: rest && getForm(rest) ? rest : null };
    case "cases":
      if (rest === "upcoming") return { program: "cases", caseId: null, upcoming: true };
      return { program: "cases", caseId: CASE_ID.test(rest) ? rest : null };
    case "clients":
      return { program: "clients", page: rest === "conflicts" ? "conflicts" : "intake" };
    case "library":
      return { program: "library", page: rest === "precedents" ? "precedents" : "penal-code" };
    case "jap":
      return { program: "jap" };
    case "control":
      return { program: "control" };
    // The flat hashes from before LP-103.
    case "upcoming":
      return { program: "cases", caseId: null, upcoming: true };
    case "intake":
      return { program: "clients", page: "intake" };
    case "conflicts":
      return { program: "clients", page: "conflicts" };
  }
  if (!rest && getForm(head)) return { program: "filings", formId: head };
  return { program: "home" };
}

/** The page's own name, for the browser tab ("Case File", a form's title…); null for home. */
export function pageTitle(r: Route, form: FormDef | null): string | null {
  switch (r.program) {
    case "home":
      return null;
    case "filings":
      return form ? form.title : "Court Filings";
    case "cases":
      return r.upcoming ? UPCOMING_TITLE : CASES_TITLE;
    case "clients":
      return r.page === "conflicts" ? CONFLICTS_TITLE : INTAKE_TITLE;
    case "library":
      return LIBRARY_TITLE;
    case "jap":
      return JAP_TITLE;
    case "control":
      return CONTROL_TITLE;
  }
}

function sameRoute(a: Route, b: Route): boolean {
  return hashFor(a) === hashFor(b);
}

/**
 * On boot with no hash, reopen the last place (saved as a hash without "#", or a form id or
 * "jap"/"cases"/"upcoming" from before LP-103). Pure (it runs in render): the hook writes the
 * hash into the URL in a layout effect.
 */
function initialRoute(): Route {
  if (!location.hash) {
    const last = defaultKV().get(LAST_FORM_KEY);
    if (last) return parseHash(last);
  }
  return parseHash(location.hash);
}

export interface RouteState {
  route: Route;
  /** The open form (Court Filings), or null. */
  form: FormDef | null;
  /** The brand and Exit: back to the start page. */
  goHome(e?: MouseEvent): void;
}

export function useRoute(): RouteState {
  const [route, setRoute] = useState<Route>(initialRoute);

  // The URL always shows the route's own hash: a restored last place gets its hash, and an
  // old hash its new one, before paint. Not during render: Next's router listens to history
  // updates and would set state while App renders.
  const bootRoute = useRef(route);
  useLayoutEffect(() => {
    const want = hashFor(bootRoute.current);
    if (want && location.hash !== want) history.replaceState(null, "", want);
  }, []);

  useEffect(() => {
    const onNav = () => {
      const next = parseHash(location.hash);
      const want = hashFor(next);
      if (want && location.hash !== want) history.replaceState(null, "", want);
      setRoute((prev) => (sameRoute(prev, next) ? prev : next));
    };
    window.addEventListener("hashchange", onNav);
    window.addEventListener("popstate", onNav);
    return () => {
      window.removeEventListener("hashchange", onNav);
      window.removeEventListener("popstate", onNav);
    };
  }, []);

  const form = route.program === "filings" && route.formId ? getForm(route.formId) || null : null;

  useEffect(() => {
    if (route.program === "home") {
      // The start page forgets the last place, so a refresh stays here.
      defaultKV().remove(LAST_FORM_KEY);
      document.title = APP_TITLE;
      return;
    }
    try {
      defaultKV().set(LAST_FORM_KEY, hashFor(route).slice(1));
    } catch {
      // private mode
    }
    document.title = pageTitle(route, form) + " · " + APP_TITLE;
  }, [route, form]);

  const goHome = (e?: MouseEvent) => {
    e?.preventDefault();
    if (location.hash) history.pushState(null, "", location.pathname + location.search);
    setRoute({ program: "home" });
  };

  return { route, form, goHome };
}
