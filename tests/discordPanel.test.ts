// @vitest-environment jsdom
// The Discord tab through the whole App: parts, counts, copy buttons, settings and keyboard.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { EMPTY_STATE, writeDraft } from "@/lib/formState";
import { defaultKV } from "@/lib/storage";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const COURT = "SAN ANDREAS COURT";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function must<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
}

function mount(hash: string): void {
  history.replaceState(null, "", "#" + hash);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(App)));
}

function unmount(): void {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
}

function click(sel: string): void {
  act(() => must(sel).click());
}

function choose(sel: string, value: string): void {
  const select = must<HTMLSelectElement>(sel);
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function key(sel: string, k: string): void {
  act(() => {
    must(sel).dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  });
}

const parts = () => document.querySelectorAll(".dc-part");

/** Part i's raw markdown (opens and closes its Raw view). */
function rawPart(i: number): string {
  click("#dc-raw-" + i);
  const value = must<HTMLTextAreaElement>(`#dc-part-${i} textarea`).value;
  click("#dc-raw-" + i);
  return value;
}

function counts(): Array<{ len: number; limit: number }> {
  return [...document.querySelectorAll(".dc-count")].map((el) => {
    const m = /^([\d,]+) \/ ([\d,]+)$/.exec(el.textContent || "");
    if (!m) throw new Error("bad count " + el.textContent);
    return { len: Number(m[1].replace(/,/g, "")), limit: Number(m[2].replace(/,/g, "")) };
  });
}

const LONG = Array.from({ length: 140 }, (_, i) => `Ground number ${i} supports the motion in full.`).join(" ");

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  unmount();
  document.body.innerHTML = "";
  sync.__resetForTests();
  vi.unstubAllGlobals();
  delete (navigator as { clipboard?: unknown }).clipboard;
  delete (document as { execCommand?: unknown }).execCommand;
  history.replaceState(null, "", "/");
});

describe("Discord tab", () => {
  it("shows parts with counts and copy buttons in place of the preview", () => {
    mount("civil-complaint");
    click("#tab-discord");
    expect(must("#tab-discord").getAttribute("aria-selected")).toBe("true");
    expect(must("#tab-discord").getAttribute("aria-controls")).toBe("discord-pane");
    must("#discord-pane");
    expect(document.querySelector("#preview")).toBeNull();
    expect(document.querySelector("#bbcode")).toBeNull();
    expect(parts().length).toBeGreaterThanOrEqual(1);
    expect(must("#dc-count-1").textContent).toMatch(/^[\d,]+ \/ 2,000$/);
    expect(must("#dc-copy-1").textContent).toBe("Copy part 1");
    expect(must("#dc-part-1 .dc-message").textContent).toContain(COURT);
    const raw = rawPart(1);
    expect(counts()[0].len).toBe(raw.length);
    expect(raw).toContain("# **SAN ANDREAS COURT**");
    expect(must("#dc-summary").textContent).toMatch(/^\d+ parts?, up to 2,000 characters each$/);
  });

  it("splits a long filing into parts with markers, and drops markers when unchecked", () => {
    writeDraft(defaultKV(), "extra-general-motion", { ...EMPTY_STATE, values: { Grounds: LONG + "\n" + LONG } });
    mount("extra-general-motion");
    click("#tab-discord");
    const n = parts().length;
    expect(n).toBeGreaterThanOrEqual(2);
    for (const c of counts()) expect(c.len).toBeLessThanOrEqual(2000);
    for (let i = 1; i <= n; i++) {
      const raw = rawPart(i);
      expect(raw.split("\n").pop()).toBe(`-# Part ${i}/${n}`);
      expect(counts()[i - 1].len).toBe(raw.length);
      expect(must(`#dc-part-${i}`).getAttribute("aria-label")).toBe(`Part ${i} of ${n}`);
    }
    click("#dc-markers");
    expect(must<HTMLInputElement>("#dc-markers").checked).toBe(false);
    for (let i = 1; i <= parts().length; i++) expect(rawPart(i)).not.toMatch(/-# Part \d+\/\d+$/);
  });

  it("switches to the Nitro limit and to plain-line tables", () => {
    writeDraft(defaultKV(), "civil-complaint", {
      ...EMPTY_STATE,
      values: { "Factual background": LONG + "\n" + LONG },
    });
    mount("civil-complaint");
    click("#tab-discord");
    const before = parts().length;
    expect(rawPart(1)).toContain("```");
    choose("#dc-limit", "4000");
    for (const c of counts()) {
      expect(c.limit).toBe(4000);
      expect(c.len).toBeLessThanOrEqual(4000);
    }
    expect(must("#dc-count-1").textContent).toMatch(/ \/ 4,000$/);
    expect(parts().length).toBeLessThan(before);
    choose("#dc-tables", "lines");
    expect(rawPart(1)).not.toContain("```");
  });

  it("persists the settings", () => {
    mount("civil-complaint");
    click("#tab-discord");
    choose("#dc-limit", "4000");
    choose("#dc-tables", "lines");
    click("#dc-markers");
    expect(JSON.parse(localStorage.getItem("lawapp_discord") || "null")).toEqual({
      limit: 4000,
      tables: "lines",
      markers: false,
    });
    unmount();
    mount("criminal-arraignment");
    click("#tab-discord");
    expect(must<HTMLSelectElement>("#dc-limit").value).toBe("4000");
    expect(must<HTMLSelectElement>("#dc-tables").value).toBe("lines");
    expect(must<HTMLInputElement>("#dc-markers").checked).toBe(false);
  });

  it("copies a part and reports it", async () => {
    writeDraft(defaultKV(), "extra-general-motion", { ...EMPTY_STATE, values: { Grounds: LONG + "\n" + LONG } });
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    mount("extra-general-motion");
    click("#tab-discord");
    const raw2 = rawPart(2);
    // The motion still has empty required fields (LP-87), so the copy asks first.
    click("#dc-copy-2");
    expect(must("#missing-dialog").hasAttribute("open")).toBe(true);
    await act(async () => {
      must("#missing-anyway").click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(writeText).toHaveBeenCalledWith(raw2);
    expect(must("#copy-status").textContent).toBe("Part 2 copied. Paste it into Discord.");
  });

  it("reports a failed copy", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("denied")) },
      configurable: true,
    });
    Object.defineProperty(document, "execCommand", { value: () => false, configurable: true });
    mount("civil-complaint");
    click("#tab-discord");
    click("#dc-copy-1");
    await act(async () => {
      must("#missing-anyway").click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(must("#copy-status").textContent).toBe("Copy failed: select the text and press Ctrl+C.");
    expect(must("#copy-status").className).toContain("bad");
  });

  it("moves between the three tabs with the arrow keys, Home and End", () => {
    mount("civil-complaint");
    click("#tab-bbcode");
    key("#tab-bbcode", "ArrowRight");
    expect(must("#tab-discord").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement?.id).toBe("tab-discord");
    key("#tab-discord", "ArrowRight");
    expect(must("#tab-preview").getAttribute("aria-selected")).toBe("true");
    must("#preview");
    key("#tab-preview", "ArrowLeft");
    expect(must("#tab-discord").getAttribute("aria-selected")).toBe("true");
    key("#tab-discord", "Home");
    expect(must("#tab-preview").getAttribute("aria-selected")).toBe("true");
    key("#tab-preview", "End");
    expect(must("#tab-discord").getAttribute("aria-selected")).toBe("true");
  });

  for (const id of ["criminal-arraignment", "small-claims-writ-of-execution", "extra-general-motion"]) {
    it(`renders ${id}`, () => {
      mount(id);
      click("#tab-discord");
      expect(parts().length).toBeGreaterThanOrEqual(1);
      expect(must("#discord-pane").textContent).not.toContain("undefined");
      for (const c of counts()) expect(c.len).toBeLessThanOrEqual(c.limit);
    });
  }
});
