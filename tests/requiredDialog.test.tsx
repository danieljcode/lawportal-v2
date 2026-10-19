// @vitest-environment jsdom
// Required fields through the whole App (LP-87): the "Required" tag in the form,
// the dialog before copying or downloading, its jump links, and Copy anyway.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/components/App";
import { COLLAPSED_KEY, EMPTY_STATE, writeDraft } from "@/lib/formState";
import { defaultKV } from "@/lib/storage";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FORM = "extra-general-motion";
const FILLED = { "Plaintiff name": "Ann Lee", "Case number": "90SCCV00123", "Defendant name": "Bo Day", Name: "Jo" };

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

function click(sel: string): void {
  act(() => must(sel).click());
}

const dialogOpen = () => must("#missing-dialog").hasAttribute("open");
const listed = () => [...document.querySelectorAll("#missing-list li")].map((li) => li.textContent);
const tagged = () => [...document.querySelectorAll(".field.missing > label")].map((l) => l.firstChild?.textContent);

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(sync, "init").mockResolvedValue(undefined);
  writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (navigator as { clipboard?: unknown }).clipboard;
});

describe("required fields (LP-87)", () => {
  it("tags empty required fields in the form, and the tag goes once filled", () => {
    writeDraft(defaultKV(), FORM, { ...EMPTY_STATE, values: { "Plaintiff name": "Ann Lee" } });
    mount(FORM);
    expect(tagged()).toEqual(["Case number", "Defendant name", "Name"]);
    expect(must(".field.missing .tag.req").textContent).toBe("Required");
  });

  it("Copy BBCode lists the empty fields; Go back copies nothing", () => {
    mount(FORM);
    click("#copy-bbcode");
    expect(dialogOpen()).toBe(true);
    expect(listed()).toEqual(["Plaintiff name", "Case number", "Defendant name", "Name"]);
    expect(must("#missing-anyway").textContent).toBe("Copy anyway");
    click("#missing-back");
    expect(dialogOpen()).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("Copy anyway copies", async () => {
    mount(FORM);
    click("#copy-bbcode");
    await act(async () => {
      must("#missing-anyway").click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(dialogOpen()).toBe(false);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(must("#copy-status").textContent).toBe("BBCode copied.");
  });

  it("copies straight away once every required field is filled", async () => {
    writeDraft(defaultKV(), FORM, { ...EMPTY_STATE, values: FILLED });
    mount(FORM);
    expect(tagged()).toEqual([]);
    await act(async () => {
      must("#copy-bbcode").click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(dialogOpen()).toBe(false);
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("a field's link opens its collapsed section and focuses it", async () => {
    writeDraft(defaultKV(), FORM, { ...EMPTY_STATE, values: { ...FILLED, Name: "" } });
    defaultKV().set(COLLAPSED_KEY, JSON.stringify({ [FORM]: ["Signature"] }));
    mount(FORM);
    const signature = () =>
      [...document.querySelectorAll<HTMLDetailsElement>("details.section")].find(
        (d) => d.querySelector(".section-title")?.textContent === "Signature",
      )!;
    expect(signature().open).toBe(false);
    click("#copy-rich");
    expect(listed()).toEqual(["Name"]);
    await act(async () => {
      must<HTMLAnchorElement>("#missing-list a").click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(dialogOpen()).toBe(false);
    expect(signature().open).toBe(true);
    expect(document.activeElement?.id).toBe("f-name");
  });

  it("Download .docx asks first too, as Download anyway", () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetchSpy);
    mount(FORM);
    click("#download-docx");
    expect(dialogOpen()).toBe(true);
    expect(must("#missing-anyway").textContent).toBe("Download anyway");
    expect(fetchSpy).not.toHaveBeenCalled();
    click("#missing-anyway");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
