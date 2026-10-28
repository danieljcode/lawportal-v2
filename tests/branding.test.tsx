// @vitest-environment jsdom
// The firm's branding (LP-22): one config for the name, logo and colours; the
// window title, browser tab, toolbar, favicon and Help → About read it; and
// court forms stay unbranded however they're filled in.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { appTitle, BRANDING, iconHref, titleScript, type Branding } from "@/branding";
import { ALL_FORMS } from "@/data";
import { markBooted } from "@/lib/boot";
import { toDiscord } from "@/lib/discord";
import { fromHtml } from "@/lib/bbcode";
import { compile, fields, render } from "@/lib/template";
import { APP_VERSION } from "@/lib/version";
import { setShell } from "@/lib/shell";
import * as sync from "@/lib/sync";
import { fixture } from "./fixtures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OTHER: Branding = {
  firmName: "Lee & Partners",
  shortName: "L&P",
  productName: "Case System",
  logo: null,
  colours: { primary: "#800000", accent: "#ffffff" },
  wallpaper: null,
};

describe("the branding config", () => {
  it("names the system after the firm", () => {
    expect(appTitle()).toBe("Friedman & Associates: Court Filing System");
    expect(BRANDING.shortName).toBe("F&A");
    expect(appTitle(OTHER)).toBe("Lee & Partners: Case System");
  });

  it("sets the starting tab title with a script that a firm name can't break out of", () => {
    expect(titleScript()).toBe('document.title="Friedman & Associates: Court Filing System";');
    const hostile = titleScript({ ...OTHER, firmName: '</script><script>alert(1)</script>"' });
    expect(hostile).not.toContain("</script>");
    const set = vi.spyOn(document, "title", "set");
    new Function(hostile)();
    expect(set).toHaveBeenCalledWith('</script><script>alert(1)</script>": Case System');
  });

  it("uses the firm's logo as the favicon, or scales in the firm's colours", () => {
    expect(decodeURIComponent(iconHref())).toContain("fill='#000080'");
    expect(decodeURIComponent(iconHref(OTHER))).toContain("fill='#800000'");
    expect(iconHref({ ...OTHER, logo: "/logo.png" })).toBe("/logo.png");
  });
});

describe("court forms stay unbranded", () => {
  it("never carry the firm's name in the forum post, BBCode or Discord text", () => {
    for (const form of ALL_FORMS) {
      const tree = compile(form.html);
      for (const variant of ["A", "B"] as const) {
        const html = render(tree, fixture(fields(tree), variant));
        for (const out of [html, fromHtml(html), toDiscord(html)]) {
          expect(out, form.id).not.toContain(BRANDING.firmName);
          expect(out, form.id).not.toContain("Friedman");
        }
      }
    }
  });
});

/* ---------- through the App ---------- */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

describe("the firm's name in the app (LP-22)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    markBooted();
    // The window title and toolbar checked here are the Classic layout's (LP-125).
    setShell("classic");
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    history.replaceState(null, "", "#");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(createElement(App)));
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    container?.remove();
    container = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("is in the window title and the browser tab", () => {
    // The home screen is the Program Manager (LP-104); the tab keeps the system's name.
    expect(document.querySelector(".app-title .title-bar-text")!.textContent).toBe(
      "Program Manager - Friedman & Associates",
    );
    expect(document.title).toBe("Friedman & Associates: Court Filing System");
    act(() => {
      history.pushState(null, "", "#cases");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(document.title).toBe("Case File · Friedman & Associates: Court Filing System");
  });

  it("is in Help → About, with the version and credits", () => {
    act(() => document.querySelector<HTMLButtonElement>("#menu-help")!.click());
    act(() => document.querySelector<HTMLButtonElement>("#menu-about")!.click());
    const about = document.querySelector("#about-dialog")!;
    expect(about.querySelector("#about-licence")!.textContent).toBe("Licensed to Friedman & Associates");
    expect(about.querySelector("#about-version")!.textContent).toBe("Version " + APP_VERSION);
    expect(about.querySelector("#about-credits")!.textContent).toContain("Made by Dan.");
    act(() => [...about.querySelectorAll("button")].find((b) => b.textContent === "OK")!.click());
    expect(document.querySelector<HTMLDialogElement>("#about-dialog")!.open).toBe(false);
  });
});
