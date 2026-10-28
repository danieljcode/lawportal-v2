// @vitest-environment jsdom
// The Law Library program (LP-108): Penal Code and Precedents as sections of its
// navigation pane, each with its own address; the penal code browsed by chapter
// (each with its own address) or by title as well as searched; #library still
// landing here; and the Insert citation dialog unchanged.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { hashFor, parseHash } from "@/shell/useRoute";
import { markBooted } from "@/lib/boot";
import { characterStore } from "@/lib/characters";
import { chapterFromSlug, chapters, chapterSlug, PENAL_CODE, sortCharges, type Charge } from "@/lib/penalCode";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("penal code chapters and order", () => {
  it("give each chapter an address that reads back as the chapter", () => {
    expect(chapterSlug("Offenses Against Public Health & Morals")).toBe("offenses-against-public-health-and-morals");
    for (const c of chapters()) expect(chapterFromSlug(chapterSlug(c)), c).toBe(c);
    expect(chapterFromSlug("not-a-chapter")).toBe("");
    expect(chapterFromSlug(undefined)).toBe("");
  });

  it("route a chapter as part of the penal code's address", () => {
    const r = parseHash("#library/penal-code/offenses-involving-theft");
    expect(r).toEqual({ program: "library", page: "penal-code", chapter: "offenses-involving-theft" });
    expect(hashFor(r)).toBe("#library/penal-code/offenses-involving-theft");
    expect(parseHash("#library/penal-code/NOT OK")).toEqual({ program: "library", page: "penal-code" });
    expect(parseHash("#library/precedents/x")).toEqual({ program: "library", page: "precedents" });
  });

  it("sort by section as listed, or by title A to Z", () => {
    const c = (section: string, title: string) => ({ section, title }) as Charge;
    const list = [c("PC 2", "Burglary"), c("PC 1", "Arson"), c("PC 3", "Assault")];
    expect(sortCharges(list, "section").map((x) => x.section)).toEqual(["PC 2", "PC 1", "PC 3"]);
    expect(sortCharges(list, "title").map((x) => x.title)).toEqual(["Arson", "Assault", "Burglary"]);
  });
});

/* ---------- through the App ---------- */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function must<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
}

function mount(hash: string): void {
  history.replaceState(null, "", hash);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(App)));
}

function setValue(sel: string, value: string): void {
  const el = must<HTMLInputElement>(sel);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

function go(hash: string): void {
  act(() => {
    history.pushState(null, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

const current = () => must('#library-nav [aria-current="page"]').textContent;
const chaptersShown = () =>
  new Set([...document.querySelectorAll("#code-list .precedent-meta .muted")].map((m) => m.textContent));
const THEFT = "Offenses Involving Theft";

describe("the Law Library program (LP-108)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    markBooted();
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    characterStore().save({ id: "alice001", name: "Alice Lawyer", title: "Attorney at Law" });
    characterStore().setActive("alice001");
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    container?.remove();
    container = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("lists Penal Code (with its chapters) and Precedents in its pane, and #library lands on the code", () => {
    mount("#library");
    expect(location.hash).toBe("#library/penal-code");
    expect(current()).toBe("All charges");
    expect(must("#library-title").textContent).toBe("Penal Code");
    const links = [...document.querySelectorAll("#library-nav a")].map((a) => a.textContent);
    expect(links[0]).toBe("All charges");
    const theftCount = PENAL_CODE.charges.filter((c) => c.chapter === THEFT && c.status !== "retired").length;
    expect(links).toContain(THEFT + " (" + theftCount + ")");
    expect(links[links.length - 1]).toBe("Precedents");
    expect(must("#toggle-nav").getAttribute("aria-controls")).toBe("library-nav");
  });

  it("browses one chapter at its own address, and the chapter list follows", () => {
    mount("#library/penal-code/" + chapterSlug(THEFT));
    expect(current()).toContain(THEFT);
    expect(must("#library-title").textContent).toBe(THEFT);
    expect(must<HTMLSelectElement>("#code-chapter").value).toBe(THEFT);
    expect([...chaptersShown()]).toEqual([THEFT]);
    // Picking another chapter in the list changes the address.
    const other = chapters()[0];
    setValue("#code-chapter", other);
    expect(location.hash).toBe("#library/penal-code/" + chapterSlug(other));
    expect(must("#library-title").textContent).toBe(other);
    setValue("#code-chapter", "");
    expect(location.hash).toBe("#library/penal-code");
  });

  it("browses by title A to Z, while a search keeps its own order", () => {
    mount("#library/penal-code/" + chapterSlug(THEFT));
    setValue("#code-sort", "title");
    const titles = [...document.querySelectorAll("#code-list .charge-name")].map((n) => n.textContent!.split(" · ")[1]);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, "en-GB")));
    setValue("#code-q", "theft");
    expect(must<HTMLSelectElement>("#code-sort").disabled).toBe(true);
  });

  it("keeps Precedents at its own address, with add and search", () => {
    mount("#library/penal-code");
    go("#library/precedents");
    expect(current()).toBe("Precedents");
    expect(must("#library-title").textContent).toBe("Precedents");
    expect(must("#precedent-new")).toBeTruthy();
    expect(document.querySelector("#code-q")).toBeNull();
  });

  it("opens an unknown chapter at all charges", () => {
    mount("#library/penal-code/no-such-chapter");
    expect(current()).toBe("All charges");
    const all = PENAL_CODE.charges.filter((c) => c.status !== "retired").length;
    expect(must("#code-count").textContent).toBe(all + " charges");
  });

  it("leaves the Insert citation dialog in Court Filings as it was, with both as tabs", () => {
    mount("#filings/extra-general-motion");
    act(() => must("#open-library").click());
    expect(must("#library-dialog-tab-code").getAttribute("aria-selected")).toBe("true");
    act(() => must("#library-dialog-tab-precedents").click());
    expect(must("#library-dialog-tab-precedents").getAttribute("aria-selected")).toBe("true");
  });
});
