// @vitest-environment jsdom
// Keeping each program's place (LP-126): a program opened stays mounted and
// hidden while another shows, so coming back finds it as it was (the same form,
// case, searches, Law Library chapter and half-typed intake); the rail and the
// Program Manager link back to where each was left; filing as someone else
// starts them afresh. In both layouts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/components/App";
import { markBooted } from "@/lib/boot";
import { caseStore } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { setShell, type ShellMode } from "@/lib/shell";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

function go(hash: string): void {
  act(() => {
    history.pushState(null, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

function setValue(sel: string, value: string): void {
  const el = must<HTMLInputElement>(sel);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

/** Hidden by React's Activity (display: none on the program's top element). */
const hidden = (el: Element) => !!el.closest('[style*="display: none"]');

for (const layout of ["modern", "classic"] as ShellMode[]) {
  describe("keeping each program's place, " + layout + " layout (LP-126)", () => {
    beforeEach(() => {
      localStorage.clear();
      sessionStorage.clear();
      markBooted();
      setShell(layout);
      vi.stubGlobal("requestAnimationFrame", () => 0);
      vi.stubGlobal("cancelAnimationFrame", () => {});
      vi.spyOn(sync, "init").mockResolvedValue(undefined);
      characterStore().save({ id: "alice001", name: "Alice Lawyer", title: "Attorney at Law" });
      characterStore().save({ id: "bob00001", name: "Bob Lawyer", title: "Attorney at Law" });
      characterStore().setActive("alice001");
      caseStore().save({ id: "case0001", caseNumber: "90SCCR00147", plaintiff: "People", defendant: "Lee" });
    });

    afterEach(() => {
      if (root) act(() => root!.unmount());
      root = null;
      container?.remove();
      container = null;
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it("keeps the open form, the very same one, while another program shows", () => {
      mount("#filings/extra-general-motion");
      const grounds = must<HTMLTextAreaElement>("#f-grounds");
      setValue("#f-grounds", "Typed before checking a case.");
      go("#cases");
      expect(hidden(grounds)).toBe(true);
      expect(hidden(must("#case-file"))).toBe(false);
      go("#filings/extra-general-motion");
      expect(must("#f-grounds")).toBe(grounds);
      expect(grounds.value).toBe("Typed before checking a case.");
      expect(hidden(grounds)).toBe(false);
    });

    it("keeps the Case File's search, the Law Library's chapter and search, and a half-typed intake", () => {
      mount("#cases");
      setValue("#case-search", "Lee");
      go("#library/penal-code/offenses-involving-theft");
      setValue("#code-q", "robbery");
      go("#clients/intake");
      setValue("#intake-clientName", "Cy Ng");
      go("#control");

      go("#cases");
      expect(must<HTMLInputElement>("#case-search").value).toBe("Lee");
      go("#library/penal-code/offenses-involving-theft");
      expect(must<HTMLInputElement>("#code-q").value).toBe("robbery");
      go("#clients/intake");
      expect(must<HTMLInputElement>("#intake-clientName").value).toBe("Cy Ng");
    });

    it("links each program back to where it was left", () => {
      mount("#library/penal-code/offenses-involving-theft");
      go("#cases/case0001");
      go(location.pathname);
      // The home screen's tiles or icons (and, in the modern layout, the rail).
      const pm = layout === "modern" ? "#tile-" : "#pm-";
      expect(must(pm + "library").getAttribute("href")).toBe("#library/penal-code/offenses-involving-theft");
      expect(must(pm + "cases").getAttribute("href")).toBe("#cases/case0001");
      expect(must(pm + "clients").getAttribute("href")).toBe("#clients/intake");
      if (layout === "modern") {
        expect(must("#rail-library").getAttribute("href")).toBe("#library/penal-code/offenses-involving-theft");
      }
    });

    it("keeps only the program showing as the scrolling #editor pane", () => {
      mount("#cases");
      go("#library/penal-code");
      expect(document.querySelectorAll("#editor")).toHaveLength(1);
      expect(hidden(must("#editor"))).toBe(false);
      expect(must("#editor").querySelector("#code-q")).not.toBeNull();
    });

    it("starts the other programs afresh when you file as someone else", () => {
      mount("#clients/intake");
      setValue("#intake-clientName", "Cy Ng");
      go("#cases");
      setValue("#active-character", "bob00001");
      // The intake was for the last character: it's gone, and opens fresh.
      expect(document.querySelector("#intake-clientName")).toBeNull();
      go("#clients/intake");
      expect(must<HTMLInputElement>("#intake-clientName").value).toBe("");
    });
  });
}
