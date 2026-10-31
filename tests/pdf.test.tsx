// @vitest-environment jsdom
// Download PDF (LP-35): the browser prints just the final filing, named after the form,
// never the highlighted preview; and printAs puts the title back afterwards.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { EMPTY_STATE, writeDraft } from "@/lib/formState";
import { defaultKV } from "@/lib/storage";
import * as sync from "@/lib/sync";
import { printAs } from "@/ui/printAs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FORM = "extra-general-motion";
const FILLED = { "Plaintiff name": "Ann Lee", "Case number": "90SCCV00123", "Defendant name": "Bo Day", Name: "Jo" };

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(sync, "init").mockResolvedValue(undefined);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("printAs", () => {
  it("shows the sheet and names the page while printing, then puts both back", () => {
    document.title = "Court Filings";
    const seen: string[] = [];
    const show = vi.fn();
    vi.spyOn(window, "print").mockImplementation(() => void seen.push(document.title));
    printAs("my-form", show);
    expect(seen).toEqual(["my-form"]);
    expect(show.mock.calls).toEqual([[true], [false]]);
    expect(document.title).toBe("Court Filings");
  });
});

describe("Download PDF (LP-35)", () => {
  it("prints the final filing, without highlight marks, as the form id", () => {
    writeDraft(defaultKV(), FORM, { ...EMPTY_STATE, values: FILLED });
    history.replaceState(null, "", "#" + FORM);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(createElement(App)));

    const printed: Array<{ title: string; html: string }> = [];
    vi.spyOn(window, "print").mockImplementation(() => {
      printed.push({ title: document.title, html: document.querySelector("#pdf-sheet")?.innerHTML || "" });
    });

    act(() => (document.querySelector("#download-pdf") as HTMLButtonElement).click());
    expect(printed).toHaveLength(1);
    expect(printed[0].title).toBe(FORM);
    expect(printed[0].html).toContain("Ann Lee");
    expect(printed[0].html).not.toMatch(/<mark|class="unfilled/);
    expect(document.querySelector("#pdf-sheet")).toBeNull();
  });
});
