// @vitest-environment jsdom
// The forum preview through the whole App: opening a form renders its template
// into #preview, typing updates it, and the browser's popstate + hashchange pair
// for one in-app navigation doesn't blank it (the pane used to go empty when the
// second event re-ran the route effect after FormView's rAF had emitted output).
//
// requestAnimationFrame is stubbed to never fire (a throttled, occluded or
// background browser window): the preview must be rendered from the very first
// commit of a form, on every route, without waiting for a frame.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/components/App";
import { characterStore } from "@/lib/characters";
import { docketStore } from "@/lib/dockets";
import { EMPTY_STATE, LAST_FORM_KEY, writeDraft } from "@/lib/formState";
import { defaultKV } from "@/lib/storage";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const COURT = "SAN ANDREAS COURT";
const COURT_LS = "SAN ANDREAS COURT, COUNTY OF LOS SANTOS";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function must<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
}

function type(sel: string, value: string): void {
  const input = must<HTMLInputElement>(sel);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Let FormView's requestAnimationFrame output land. */
const frame = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

/** Preview text with non-breaking spaces folded, so headings match regardless of &nbsp;. */
const previewText = () => (must("#preview").textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ");

function mount(): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(App)));
}

/** A hash-only navigation as tests/dialogs.test.ts does it: one hashchange. */
async function open(id: string): Promise<void> {
  act(() => {
    history.replaceState(null, "", "#" + id);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  await frame();
}

/** A sidebar click as the browser does it: popstate, a frame, then hashchange. */
async function navigate(id: string): Promise<void> {
  act(() => {
    history.replaceState(null, "", "#" + id);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await frame();
  act(() => {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  await frame();
}

/** The same sidebar-click sequence with no frame in between or after (synchronous reads follow). */
function navigateNow(id: string): void {
  act(() => {
    history.pushState(null, "", "#" + id);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  act(() => {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

/** Browser back/forward to a hash: the URL is already there, then popstate + hashchange. */
function traverse(hash: string): void {
  act(() => {
    history.replaceState(null, "", hash || "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  act(() => {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

function unmount(): void {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
}

function click(el: HTMLElement): void {
  act(() => el.click());
}

function choose(sel: string, value: string): void {
  const select = must<HTMLSelectElement>(sel);
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** Read #preview right now (no frame): it must already show the rendered template. */
function expectRendered(...texts: string[]): string {
  const text = previewText();
  for (const t of texts) expect(text).toContain(t);
  return text;
}

function saveCharacter(name: string, title: string): string {
  let id = "";
  act(() => {
    id = characterStore().save({ name, title }).id;
  });
  return id;
}

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/");
  // A browser that delays or never runs frames (throttled, occluded, background, efficiency mode).
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  unmount();
  document.body.innerHTML = "";
  sync.__resetForTests();
  vi.unstubAllGlobals();
});

describe("forum preview", () => {
  it("renders the template when a form is opened", async () => {
    mount();
    await open("civil-complaint");
    expect(previewText()).toContain(COURT);
  });

  it("survives the browser's popstate + hashchange pair for one navigation", async () => {
    mount();
    await navigate("small-claims-writ-of-execution");
    const text = previewText();
    expect(text).toContain("Writ of Execution");
    expect(text).toContain("COURTHOUSE NAME");
  });

  it("is unchanged by a stray same-hash hashchange", async () => {
    mount();
    await open("civil-complaint");
    const before = must("#preview").innerHTML;
    expect(before.length).toBeGreaterThan(0);
    act(() => {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await frame();
    expect(must("#preview").innerHTML).toBe(before);
  });

  it("updates when a field is typed", async () => {
    mount();
    await navigate("criminal-arraignment");
    type('#editor input[type="text"]', "ZZPREVIEW");
    await frame();
    expect(must("#preview").innerHTML).toContain("ZZPREVIEW");
  });

  it("shows a saved draft on open", async () => {
    writeDraft(defaultKV(), "criminal-arraignment", { ...EMPTY_STATE, values: { "Defendant name": "Jane Draft" } });
    mount();
    await navigate("criminal-arraignment");
    expect(previewText()).toContain("Jane Draft");
  });

  it("switches to the next form's output", async () => {
    mount();
    await open("civil-complaint");
    expect(previewText()).toContain(COURT);
    await navigate("small-claims-writ-of-execution");
    const text = previewText();
    expect(text).toContain("Writ of Execution");
    expect(text).not.toContain(COURT);
  });
});

describe("forum preview with no frames and no input", () => {
  it("is rendered on an initial load with a hash", () => {
    history.replaceState(null, "", "#civil-complaint");
    mount();
    expectRendered(COURT, "CIVIL DIVISION");
  });

  it("is rendered after a refresh, with the saved draft", () => {
    history.replaceState(null, "", "#civil-complaint");
    mount();
    expectRendered(COURT);
    unmount();
    writeDraft(defaultKV(), "civil-complaint", { ...EMPTY_STATE, values: { "Plaintiff name": "Pat Refresh" } });
    mount();
    expectRendered(COURT, "Pat Refresh");
  });

  it("is rendered after back and forward", () => {
    history.replaceState(null, "", "#civil-complaint");
    mount();
    navigateNow("small-claims-writ-of-execution");
    expectRendered("Writ of Execution", "COURTHOUSE NAME");
    traverse("#civil-complaint"); // back
    expect(expectRendered(COURT, "CIVIL DIVISION")).not.toContain("Writ of Execution");
    traverse("#small-claims-writ-of-execution"); // forward
    expect(expectRendered("Writ of Execution")).not.toContain(COURT);
  });

  it("is rendered when the last form is restored on boot", () => {
    defaultKV().set(LAST_FORM_KEY, "criminal-arraignment");
    mount();
    expect(location.hash).toBe("#filings/criminal-arraignment");
    expectRendered(COURT, "CRIMINAL DIVISION", "People of the State of San Andreas");
  });

  it("is rendered for an Additional Templates form", () => {
    mount();
    navigateNow("extra-general-motion");
    expectRendered(COURT_LS, "MOTION TITLE");
  });

  it("shows a docket loaded with Use in form", () => {
    const id = saveCharacter("John Doe", "Attorney at Law");
    act(() => {
      characterStore().setActive(id);
      docketStore().upsert(id, { caseNumber: "90SCCC00147", plaintiff: "Ann Smith" });
    });
    history.replaceState(null, "", "#civil-complaint");
    mount();
    expectRendered(COURT, "John Doe");
    click(must("#open-dockets"));
    const use = [...document.querySelectorAll<HTMLButtonElement>("#docket-list button")].find(
      (b) => b.textContent === "Use in form",
    );
    expect(use).toBeDefined();
    click(use!);
    expectRendered(COURT, "90SCCC00147", "Ann Smith");
  });

  it("follows a Filing as character switch", () => {
    const a = saveCharacter("Dan Tester", "Judge");
    const b = saveCharacter("Other Person", "Attorney at Law");
    act(() => characterStore().setActive(a));
    history.replaceState(null, "", "#civil-complaint");
    mount();
    expectRendered(COURT, "Dan Tester");
    choose("#active-character", b);
    expect(expectRendered(COURT, "Other Person")).not.toContain("Dan Tester");
  });

  it("shows the new character, not the old output, when the same form is reopened", () => {
    const a = saveCharacter("Dan Tester", "Judge");
    const b = saveCharacter("Other Person", "Attorney at Law");
    act(() => characterStore().setActive(a));
    history.replaceState(null, "", "#civil-complaint");
    mount();
    expectRendered("Dan Tester");
    traverse(""); // home
    expect(document.querySelector("#preview")).toBeNull();
    choose("#active-character", b);
    // Every node the reopen inserts or removes, so even an intermediate commit with the old
    // instance's output (replaced before paint) is caught.
    const seen: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const r of records) for (const n of [...r.addedNodes, ...r.removedNodes]) seen.push(n.textContent || "");
    });
    observer.observe(document.body, { childList: true, subtree: true });
    navigateNow("civil-complaint");
    observer.takeRecords().forEach((r) => {
      for (const n of [...r.addedNodes, ...r.removedNodes]) seen.push(n.textContent || "");
    });
    observer.disconnect();
    expect(expectRendered(COURT, "Other Person")).not.toContain("Dan Tester");
    expect(seen.filter((t) => t.includes("Dan Tester"))).toEqual([]);
  });

  it("keeps highlight marks on unfilled fields from the first read", () => {
    history.replaceState(null, "", "#civil-complaint");
    mount();
    expect(document.querySelectorAll("#preview mark.unfilled").length).toBeGreaterThan(0);
    act(() => must<HTMLInputElement>("#highlight").click());
    expect(document.querySelectorAll("#preview mark.unfilled").length).toBe(0);
    expectRendered(COURT);
  });
});
