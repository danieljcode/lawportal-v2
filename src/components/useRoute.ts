// Hash routing for the app shell (LP-7, from App.tsx): which page is open, the
// last form reopened on boot, back/forward, the page title, and going home.
// #cases is the Case File, #cases/<id> one case in it (LP-101).

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { getForm } from "@/data";
import { LAST_FORM_KEY } from "@/lib/formState";
import { defaultKV } from "@/lib/storage";
import type { FormDef } from "@/lib/types";

export type Route =
  | { kind: "home" }
  | { kind: "form"; id: string }
  | { kind: "jap" }
  | { kind: "cases"; caseId: string | null }
  | { kind: "upcoming" }
  | { kind: "intake" }
  | { kind: "conflicts" };

export const APP_TITLE = "Court Filing Generator";
export const JAP_TITLE = "Judicial Advancement Portfolio";
export const CASES_TITLE = "Case File";
export const UPCOMING_TITLE = "Upcoming";
export const INTAKE_TITLE = "New client intake";
export const CONFLICTS_TITLE = "Conflict check";

/** The hash for a route ("#cases/<id>" for a case). */
export function hashFor(r: Route): string {
  if (r.kind === "form") return "#" + r.id;
  if (r.kind === "jap") return "#jap";
  if (r.kind === "cases") return "#cases" + (r.caseId ? "/" + r.caseId : "");
  if (r.kind === "upcoming") return "#upcoming";
  if (r.kind === "intake") return "#intake";
  if (r.kind === "conflicts") return "#conflicts";
  return "";
}

function parseRoute(): Route {
  let id = "";
  try {
    id = decodeURIComponent(location.hash.slice(1));
  } catch {
    id = "";
  }
  if (id === "jap") return { kind: "jap" };
  if (id === "cases") return { kind: "cases", caseId: null };
  if (id === "upcoming") return { kind: "upcoming" };
  if (id === "intake") return { kind: "intake" };
  if (id === "conflicts") return { kind: "conflicts" };
  const m = /^cases\/([a-z0-9]{4,32})$/.exec(id);
  if (m) return { kind: "cases", caseId: m[1] };
  if (id && getForm(id)) return { kind: "form", id };
  return { kind: "home" };
}

/** Same place: the browser fires popstate and hashchange for one navigation, and both parse alike. */
function sameRoute(a: Route, b: Route): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "cases") return a.caseId === (b as { caseId: string | null }).caseId;
  return a.kind !== "form" || a.id === (b as { id: string }).id;
}

/**
 * On boot with no hash, reopen the last form (or the J.A.P.), as the reference does. Pure (it runs
 * in render): the hook writes the restored hash into the URL in a layout effect.
 */
function initialRoute(): Route {
  if (!location.hash) {
    const last = defaultKV().get(LAST_FORM_KEY);
    if (last === "jap") return { kind: "jap" };
    if (last === "cases") return { kind: "cases", caseId: null };
    if (last === "upcoming") return { kind: "upcoming" };
    if (last && getForm(last)) return { kind: "form", id: last };
  }
  return parseRoute();
}

export interface RouteState {
  route: Route;
  /** The open form, or null (start page, J.A.P., or an unknown id). */
  form: FormDef | null;
  /** The brand and Start button: back to the start page. */
  goHome(e: MouseEvent): void;
}

export function useRoute(): RouteState {
  const [route, setRoute] = useState<Route>(initialRoute);

  // A restored last form gets its hash before paint. Not during render: Next's router
  // listens to history updates and would set state while App renders.
  const bootRoute = useRef(route);
  useLayoutEffect(() => {
    const r = bootRoute.current;
    if (!location.hash && r.kind !== "home") history.replaceState(null, "", hashFor(r));
  }, []);

  useEffect(() => {
    const onNav = () => {
      const next = parseRoute();
      setRoute((prev) => (sameRoute(prev, next) ? prev : next));
    };
    window.addEventListener("hashchange", onNav);
    window.addEventListener("popstate", onNav);
    return () => {
      window.removeEventListener("hashchange", onNav);
      window.removeEventListener("popstate", onNav);
    };
  }, []);

  const form = route.kind === "form" ? getForm(route.id) || null : null;

  useEffect(() => {
    if (route.kind === "home") {
      // The start page forgets the last form, so a refresh stays here.
      defaultKV().remove(LAST_FORM_KEY);
      document.title = APP_TITLE;
    } else if (route.kind === "jap") {
      try {
        defaultKV().set(LAST_FORM_KEY, "jap");
      } catch {
        // private mode
      }
      document.title = JAP_TITLE + " · " + APP_TITLE;
    } else if (route.kind === "cases") {
      try {
        defaultKV().set(LAST_FORM_KEY, "cases");
      } catch {
        // private mode
      }
      document.title = CASES_TITLE + " · " + APP_TITLE;
    } else if (route.kind === "upcoming") {
      try {
        defaultKV().set(LAST_FORM_KEY, "upcoming");
      } catch {
        // private mode
      }
      document.title = UPCOMING_TITLE + " · " + APP_TITLE;
    } else if (route.kind === "intake") {
      document.title = INTAKE_TITLE + " · " + APP_TITLE;
    } else if (route.kind === "conflicts") {
      document.title = CONFLICTS_TITLE + " · " + APP_TITLE;
    } else if (form) {
      document.title = form.title + " · " + APP_TITLE;
    }
  }, [route, form]);

  const goHome = (e: MouseEvent) => {
    e.preventDefault();
    if (location.hash) history.pushState(null, "", location.pathname + location.search);
    setRoute({ kind: "home" });
  };

  return { route, form, goHome };
}
