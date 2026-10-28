// @vitest-environment jsdom
// Filing history through the whole App (LP-15): a copy is kept, Filing history
// lists and previews it, "Use as new draft" on the open form (an undo step) and
// on another form (after asking), "Copy again", and a case's filings in the Case File.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { caseStore } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { draftHistory } from "@/lib/draftHistory";
import { filingStore } from "@/lib/filings";
import { EMPTY_STATE, readDraft, writeDraft } from "@/lib/formState";
import { defaultKV } from "@/lib/storage";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FORM = "civil-complaint";
const FILLED = { "Plaintiff name": "Ann Lee", "Defendant name": "Bo Day", "Case number": "90SCCC00001" };

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let writeText: ReturnType<typeof vi.fn>;
let write: ReturnType<typeof vi.fn>;

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
    history.replaceState(null, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

async function clickAsync(sel: string): Promise<void> {
  await act(async () => {
    must(sel).click();
    await new Promise((r) => setTimeout(r, 0));
  });
}

function setValue(sel: string, value: string): void {
  const el = must<HTMLInputElement>(sel);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const buttonIn = (sel: string, text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>(sel + " button")].find((b) => b.textContent === text)!;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(sync, "init").mockResolvedValue(undefined);
  writeText = vi.fn(() => Promise.resolve());
  write = vi.fn(() => Promise.resolve());
  vi.stubGlobal(
    "ClipboardItem",
    class {
      constructor(public items: Record<string, Blob>) {}
    },
  );
  Object.defineProperty(navigator, "clipboard", { value: { writeText, write }, configurable: true });
  characterStore().save({ id: "alice001", name: "Alice Lawyer", title: "Attorney at Law" });
  characterStore().setActive("alice001");
  caseStore().save({ id: "case0001", caseNumber: "90SCCC00001", lead: "alice001" });
  writeDraft(defaultKV(), FORM, { ...EMPTY_STATE, values: FILLED });
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

describe("filing history (LP-15)", () => {
  it("keeps a filing when it's copied, with the character and case", async () => {
    mount("#" + FORM);
    await clickAsync("#copy-bbcode");
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(filingStore().list()).toMatchObject([
      {
        formId: FORM,
        charId: "alice001",
        charName: "Alice Lawyer",
        caseNumber: "90SCCC00001",
        caseId: "case0001",
        via: "bbcode",
      },
    ]);
    expect(filingStore().list()[0].state.values).toMatchObject(FILLED);
  });

  it("a failed copy isn't kept", async () => {
    writeText.mockImplementation(() => Promise.reject(new Error("denied")));
    Object.defineProperty(document, "execCommand", { value: () => false, configurable: true });
    mount("#" + FORM);
    await clickAsync("#copy-bbcode");
    expect(filingStore().list()).toEqual([]);
  });

  it("Filing history lists and previews filings, and finds them by case number", async () => {
    mount("#" + FORM);
    await clickAsync("#copy-bbcode");
    await clickAsync("#open-filings");
    expect(must("#filings-dialog").hasAttribute("open")).toBe(true);
    expect(must(".filing-list .filing").textContent).toContain("Civil Complaint");
    expect(must(".filing-list .filing").textContent).toContain("Copied as BBCode");
    expect(must("#filings-preview").textContent).toContain("Ann Lee");
    expect(must<HTMLSelectElement>("#filings-case").options[1].value).toBe("90SCCC00001");
  });

  it("Use as new draft on the open form is an undo step", async () => {
    mount("#" + FORM);
    await clickAsync("#copy-bbcode");
    setValue("#f-plaintiff-name", "Changed");
    await clickAsync("#open-filings");
    await act(async () => buttonIn("#filings-dialog .filing", "Use as new draft").click());
    expect(must<HTMLInputElement>("#f-plaintiff-name").value).toBe("Ann Lee");
    expect(must("#docket-status").textContent).toContain("as a new draft");
    act(() => must("#undo").click());
    expect(must<HTMLInputElement>("#f-plaintiff-name").value).toBe("Changed");
  });

  it("Use as new draft for another form replaces its draft after asking, keeping the old one", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mount("#" + FORM);
    await clickAsync("#copy-bbcode");
    go("#extra-subpoena"); // leaving the form saves its draft, so change it afterwards
    writeDraft(defaultKV(), FORM, { ...EMPTY_STATE, values: { "Plaintiff name": "Newer draft" } });
    await clickAsync("#open-filings");
    await act(async () => buttonIn("#filings-dialog .filing", "Use as new draft").click());
    expect(confirmSpy.mock.calls.at(-1)![0]).toContain("Replace your current draft of Civil Complaint");
    act(() => window.dispatchEvent(new HashChangeEvent("hashchange")));
    expect(location.hash).toBe("#filings/" + FORM);
    expect(readDraft(defaultKV(), FORM)?.values).toMatchObject(FILLED);
    expect(draftHistory().list(FORM)[0].state.values["Plaintiff name"]).toBe("Newer draft");
  });

  it("Copy again copies the filing for the forum", async () => {
    mount("#" + FORM);
    await clickAsync("#copy-bbcode");
    await clickAsync("#open-filings");
    await act(async () => {
      buttonIn("#filings-dialog .filing", "Copy again").click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(must("#filings-status").textContent).toContain("Copied Civil Complaint again");
  });

  it("a case's filings show on it in the Case File", async () => {
    mount("#" + FORM);
    await clickAsync("#copy-bbcode");
    go("#cases/case0001");
    expect(must("#case-filings .filing").textContent).toContain("Civil Complaint");
    expect(must("#case-filings .filing").textContent).not.toContain("90SCCC00001");
  });

  it("says so when there are none yet", async () => {
    mount("#" + FORM);
    await clickAsync("#open-filings");
    expect(must("#filings-empty").textContent).toContain("No filings yet");
  });
});
