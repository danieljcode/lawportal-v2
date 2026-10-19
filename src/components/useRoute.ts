// Hash routing for the app shell (LP-7, from App.tsx): which page is open, the
// last form reopened on boot, back/forward, the page title, and going home.

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { getForm } from "@/data";
import { LAST_FORM_KEY } from "@/lib/formState";
import { defaultKV } from "@/lib/storage";
import type { FormDef } from "@/lib/types";

export type Route = { kind: "home" } | { kind: "form"; id: string } | { kind: "jap" };

export const APP_TITLE = "Court Filing Generator";
export const JAP_TITLE = "Judicial Advancement Portfolio";

function parseRoute(): Route {
  let id = "";
  try {
    id = decodeURIComponent(location.hash.slice(1));
  } catch {
    id = "";
  }
  if (id === "jap") return { kind: "jap" };
  if (id && getForm(id)) return { kind: "form", id };
  return { kind: "home" };
}

/** Same place: the browser fires popstate and hashchange for one navigation, and both parse alike. */
function sameRoute(a: Route, b: Route): boolean {
  if (a.kind !== b.kind) return false;
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
    if (!location.hash && r.kind !== "home") history.replaceState(null, "", "#" + (r.kind === "form" ? r.id : "jap"));
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
