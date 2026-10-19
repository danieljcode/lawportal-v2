// @vitest-environment jsdom
// Error boundaries (LP-88): a render error shows the "Application Error" box in
// that panel's place, the rest of the app keeps working, and its buttons reload,
// download a backup and copy details without the sync code or form text.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/components/App";
import ErrorBoundary from "@/components/ErrorBoundary";
import { EMPTY_STATE, writeDraft } from "@/lib/formState";
// The form crashes by making something only FormView uses while rendering throw: its draft writer.
import * as draftWriter from "@/lib/draftWriter";
import { defaultKV } from "@/lib/storage";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CODE = "JSA-ABCD-EFGH-JKLM-NPQR-STUV";
const SECRET = "Secret plaintiff text";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function must<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
}

function render(node: React.ReactElement): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(node));
}

function click(sel: string): void {
  act(() => must(sel).click());
}

function Bomb({ message }: { message: string }): never {
  throw new Error(message);
}

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(sync, "init").mockResolvedValue(undefined);
  // React and the boundary log the error; keep the test output quiet.
  vi.spyOn(console, "error").mockImplementation(() => {});
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

describe("a crash in one panel (LP-88)", () => {
  it("shows the crash box in the form's place; the sidebar and toolbar keep working, and the preview hides", () => {
    vi.spyOn(draftWriter, "createDraftWriter").mockImplementation(() => {
      throw new Error("form broke");
    });
    history.replaceState(null, "", "#civil-complaint");
    render(createElement(App));
    expect(must("#crash-title").textContent).toBe("Application Error");
    expect(must("#crash-text").textContent).toContain("Something went wrong in this form.");
    expect(document.querySelector("#form-view")).toBeNull();
    expect(document.querySelector("#output")).toBeNull();
    expect(must("#sidebar")).toBeTruthy();
    // The rest of the app still works: another dialog opens fine.
    click("#open-characters");
    expect(must("#characters-dialog").hasAttribute("open")).toBe(true);
  });

  it("Try again brings the form back once the fault has gone", () => {
    const spy = vi.spyOn(draftWriter, "createDraftWriter").mockImplementation(() => {
      throw new Error("form broke");
    });
    history.replaceState(null, "", "#civil-complaint");
    render(createElement(App));
    spy.mockRestore();
    click("#crash-retry");
    expect(document.querySelector("#crash-title")).toBeNull();
    expect(must("#form-view")).toBeTruthy();
    expect(must("#output")).toBeTruthy();
  });

  it("Copy error details leaves out the sync code and anything typed into a form", async () => {
    localStorage.setItem("lawapp_sync_code", CODE);
    writeDraft(defaultKV(), "civil-complaint", { ...EMPTY_STATE, values: { "Plaintiff name": SECRET } });
    vi.spyOn(draftWriter, "createDraftWriter").mockImplementation(() => {
      throw new Error(`Bad value "${SECRET}" for ${CODE}`);
    });
    history.replaceState(null, "", "#civil-complaint");
    render(createElement(App));
    await act(async () => {
      must("#crash-copy").click();
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    const details = writeText.mock.calls[0][0] as string;
    expect(details).toContain("Where: this form");
    expect(details).toContain("Error: Error: Bad value");
    expect(details).not.toContain(CODE);
    expect(details).not.toContain(SECRET);
    expect(must(".crash-status").textContent).toContain("Error details copied");
  });

  it("Download a backup saves the full backup, without the sync code", async () => {
    localStorage.setItem("lawapp_chars", '[{"id":"abcd1234","name":"Ann Lee"}]');
    localStorage.setItem("lawapp_sync_code", CODE);
    const blobs: Blob[] = [];
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: (b: Blob) => {
        blobs.push(b);
        return "blob:x";
      },
      revokeObjectURL: () => {},
    });
    render(createElement(ErrorBoundary, { where: "the app", variant: "app" }, createElement(Bomb, { message: "x" })));
    click("#crash-backup");
    expect(blobs).toHaveLength(1);
    const text = await blobs[0].text();
    expect(JSON.parse(text).data).toEqual({ lawapp_chars: '[{"id":"abcd1234","name":"Ann Lee"}]' });
    expect(text).not.toContain(CODE);
    expect(must(".crash-status").textContent).toContain("Backup downloaded");
  });
});

describe("the whole-app and dialog boxes", () => {
  it("the app box offers Reload first, with no Try again", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...location, reload });
    render(createElement(ErrorBoundary, { where: "the app", variant: "app" }, createElement(Bomb, { message: "x" })));
    expect(must(".crash-wrap").className).toContain("crash-app");
    expect(document.querySelector("#crash-retry")).toBeNull();
    expect(must("#crash-reload").className).toContain("primary");
    click("#crash-reload");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("a crashed dialog floats over the app and Close dismisses it", () => {
    const onDismiss = vi.fn();
    render(
      createElement(
        ErrorBoundary,
        { where: "the Characters dialog", variant: "dialog", resetKey: "characters", onDismiss },
        createElement(Bomb, { message: "x" }),
      ),
    );
    expect(must(".crash-wrap").className).toContain("crash-dialog");
    expect(must("#crash-text").textContent).toContain("Something went wrong in the Characters dialog.");
    click("#crash-close");
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
