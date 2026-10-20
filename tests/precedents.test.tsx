// @vitest-environment jsdom
// The Law Library's precedents (LP-16): cleaning, tags, search and highlighting,
// the citation, the store, sync and backup, the Law Library page (add, search,
// filter by topic, edit, delete) and Insert citation from a form.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/components/App";
import { makeBackup } from "@/lib/backup";
import { characterStore } from "@/lib/characters";
import * as clipboard from "@/lib/clipboard";
import { EMPTY_STATE, writeDraft } from "@/lib/formState";
import {
  allTags,
  citation,
  cleanPrecedent,
  cleanTags,
  createPrecedentStore,
  filterPrecedents,
  highlightParts,
  precedentStore,
  searchTerms,
  type Precedent,
} from "@/lib/precedents";
import { defaultKV, memoryKV } from "@/lib/storage";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T = "2026-10-20T10:00:00.000Z";
const ruling = (o: Partial<Precedent> & { id: string; caseName: string }): Precedent => ({
  tags: [],
  created: T,
  updated: T,
  ...o,
});

const SMITH = ruling({
  id: "prec0001",
  caseName: "Smith v. Jones",
  caseNumber: "90SCCV00123",
  court: "San Andreas Civil Court",
  date: "1990-10-12",
  judge: "Harlow",
  holding: "A verbal contract for goods over $500 is unenforceable.",
  tags: ["contracts"],
});
const LEE = ruling({
  id: "prec0002",
  caseName: "People v. Lee",
  caseNumber: "90SCCR00147",
  court: "San Andreas Criminal Court",
  date: "1990-09-30",
  judge: "Okafor",
  summary: "Vehicle searched without a warrant after a traffic stop.",
  holding: "Evidence from the warrantless search was suppressed.",
  tags: ["search and seizure", "traffic"],
});

describe("cleaning precedents", () => {
  it("needs a case name; drops a bad link or date; cleans the tags", () => {
    expect(cleanPrecedent({ caseName: " " })).toBeNull();
    const p = cleanPrecedent(
      {
        id: "prec0001",
        caseName: " Smith v. Jones ",
        caseNumber: "",
        link: "javascript:alert(1)",
        date: "12/10/1990",
        tags: "Contracts, search  and Seizure,,contracts",
      },
      T,
    );
    expect(p).toEqual({
      id: "prec0001",
      caseName: "Smith v. Jones",
      tags: ["contracts", "search and seizure"],
      created: T,
      updated: T,
    });
    expect(cleanTags(["A", 5, " b "])).toEqual(["a", "b"]);
  });
});

describe("searching precedents", () => {
  const all = [SMITH, LEE];

  it("finds every word anywhere: keyword, case number, judge, court or tag", () => {
    const ids = (q: string, tag?: string) => filterPrecedents(all, { q, tag }).map((p) => p.id);
    expect(ids("")).toEqual(["prec0001", "prec0002"]);
    expect(ids("warrant")).toEqual(["prec0002"]);
    expect(ids("90sccv00123")).toEqual(["prec0001"]);
    expect(ids("harlow")).toEqual(["prec0001"]);
    expect(ids("criminal court")).toEqual(["prec0002"]);
    expect(ids("seizure")).toEqual(["prec0002"]);
    expect(ids("contract warrant")).toEqual([]);
    expect(ids("", "traffic")).toEqual(["prec0002"]);
    expect(allTags(all)).toEqual(["contracts", "search and seizure", "traffic"]);
  });

  it("marks the matches, ignoring case, longest word first", () => {
    expect(highlightParts("People v. Lee", searchTerms("lee PEOPLE"))).toEqual([
      { text: "People", hit: true },
      { text: " v. ", hit: false },
      { text: "Lee", hit: true },
    ]);
    expect(highlightParts("Jones", ["jo", "jones"])).toEqual([{ text: "Jones", hit: true }]);
    expect(highlightParts("a (b) c", ["(b)"])).toEqual([
      { text: "a ", hit: false },
      { text: "(b)", hit: true },
      { text: " c", hit: false },
    ]);
  });
});

describe("citations", () => {
  it("give the name, number, court and year, as far as they're known", () => {
    expect(citation(SMITH)).toBe("Smith v. Jones, 90SCCV00123 (San Andreas Civil Court 1990)");
    expect(citation(ruling({ id: "prec0003", caseName: "Doe v. Roe" }))).toBe("Doe v. Roe");
    expect(citation(ruling({ id: "prec0003", caseName: "Doe v. Roe", date: "1990-01-02" }))).toBe("Doe v. Roe (1990)");
  });
});

describe("the precedent store", () => {
  it("adds, updates (keeping when it was added), orders newest ruling first and deletes", () => {
    const store = createPrecedentStore(memoryKV());
    const lee = store.save(LEE);
    const smith = store.save({ caseName: "Smith v. Jones", date: "1990-10-12" });
    expect(store.list().map((p) => p.caseName)).toEqual(["Smith v. Jones", "People v. Lee"]);
    const edited = store.save({ ...smith, judge: "Harlow" });
    expect(edited.created).toBe(smith.created);
    expect(store.get(smith.id)!.judge).toBe("Harlow");
    expect(() => store.save({ caseName: "" })).toThrow("case name");
    store.remove(lee.id);
    expect(store.list()).toHaveLength(1);
  });

  it("syncs (merged per ruling, the newer edit wins) and is in the backup", () => {
    const kv = memoryKV();
    createPrecedentStore(kv).save(SMITH);
    expect(JSON.stringify(makeBackup(kv).data)).toContain("Smith v. Jones");

    localStorage.clear();
    sync.__resetForTests();
    precedentStore().save(LEE);
    expect(sync.snapshot().precedents!.map((p) => p.caseName)).toEqual(["People v. Lee"]);
    const theirs = { ...precedentStore().list()[0], judge: "Newer", updated: "2099-01-01T00:00:00.000Z" };
    const doc = sync.resolve({ characters: [], precedents: [theirs, SMITH] }, null).doc;
    expect(doc.precedents!.map((p) => p.caseName + " " + (p.judge || ""))).toEqual([
      "People v. Lee Newer",
      "Smith v. Jones Harlow",
    ]);
    // A copy from before LP-16 has none: this browser's are kept.
    expect(sync.resolve({ characters: [] }, null).doc.precedents).toHaveLength(1);
    localStorage.clear();
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

function setValue(sel: string, value: string): void {
  const el = must<HTMLInputElement>(sel);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

const click = (el: Element) => act(() => (el as HTMLElement).click());
const button = (scope: ParentNode, text: string) =>
  [...scope.querySelectorAll("button")].find((b) => b.textContent === text)!;
const names = (prefix: string) =>
  [...document.querySelectorAll(`#${prefix}-list .precedent-name`)].map((n) => n.textContent);

function mount(hash: string): void {
  history.replaceState(null, "", hash);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(App)));
}

describe("the Law Library (LP-16)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    characterStore().save({ id: "alice001", name: "Alice Lawyer" });
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

  it("adds a ruling, then searches, highlights and filters by topic", () => {
    precedentStore().save(LEE);
    mount("#library");
    click(must("#library-tab-precedents"));
    expect(document.title).toContain("Law Library");
    click(must("#precedent-new"));
    act(() => must("#precedent-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(must("#precedent-error").textContent).toContain("case name");
    setValue("#precedent-name", "Smith v. Jones");
    setValue("#precedent-number", "90SCCV00123");
    setValue("#precedent-court", "San Andreas Civil Court");
    setValue("#precedent-date", "1990-10-12");
    setValue("#precedent-judge", "Harlow");
    setValue("#precedent-holding", "A verbal contract over $500 is unenforceable.");
    setValue("#precedent-link", "https://forum.example/thread/1");
    setValue("#precedent-tags", "Contracts");
    act(() => must("#precedent-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(document.querySelector("#precedent-form")).toBeNull();
    expect(names("precedents")).toEqual(["Smith v. Jones", "People v. Lee"]);
    expect(precedentStore().list()[0]).toMatchObject({ judge: "Harlow", tags: ["contracts"] });

    setValue("#precedents-q", "harlow");
    expect(names("precedents")).toEqual(["Smith v. Jones"]);
    expect([...document.querySelectorAll("#precedents-list mark")].map((m) => m.textContent)).toEqual(["Harlow"]);
    expect(must("#precedents-count").textContent).toBe("1 of 2 rulings");

    setValue("#precedents-q", "");
    setValue("#precedents-tag", "traffic");
    expect(names("precedents")).toEqual(["People v. Lee"]);
    // Clicking a tag toggles the filter too.
    click(button(must("#precedents-list"), "traffic"));
    expect(names("precedents")).toHaveLength(2);
    const a = must<HTMLAnchorElement>("#precedents-list a");
    expect(a.getAttribute("href")).toBe("https://forum.example/thread/1");
    expect(a.rel).toContain("noopener");
  });

  it("edits and deletes a ruling, and shows typed text as text", () => {
    precedentStore().save({ ...LEE, caseName: '<img src=x onerror="alert(1)">' });
    mount("#library");
    click(must("#library-tab-precedents"));
    expect(document.querySelector("#precedents-list img")).toBeNull();
    click(button(must(".precedent"), "Edit"));
    setValue("#precedent-name", "People v. Lee");
    act(() => must("#precedent-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(names("precedents")).toEqual(["People v. Lee"]);
    expect(precedentStore().list()[0].tags).toEqual(["search and seizure", "traffic"]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    click(button(must(".precedent"), "Delete"));
    expect(must("#precedents-empty").textContent).toContain("No rulings");
  });

  it("copies a citation", async () => {
    const copy = vi.spyOn(clipboard, "copyText").mockResolvedValue(true);
    precedentStore().save(SMITH);
    mount("#library");
    click(must("#library-tab-precedents"));
    await act(async () => button(must(".precedent"), "Copy citation").click());
    expect(copy).toHaveBeenCalledWith("Smith v. Jones, 90SCCV00123 (San Andreas Civil Court 1990)");
  });

  it("inserts a citation into the form field last clicked in", () => {
    precedentStore().save(SMITH);
    writeDraft(defaultKV(), "extra-general-motion", {
      ...EMPTY_STATE,
      values: { Grounds: "As held in , the claim fails." },
    });
    mount("#extra-general-motion");
    // Before any field is picked, Insert citation is off.
    click(must("#open-library"));
    click(must("#library-dialog-tab-precedents"));
    expect(must("#library-target").textContent).toContain("Click in a form field first");
    expect(button(must("#library-dialog"), "Insert citation").disabled).toBe(true);
    click(button(must("#library-dialog"), "Close") || must("#library-dialog button"));

    const area = must<HTMLTextAreaElement>("#f-grounds");
    act(() => area.focus());
    area.setSelectionRange(11, 11);
    click(must("#open-library"));
    click(must("#library-dialog-tab-precedents"));
    expect(must("#library-target").textContent).toContain("Grounds");
    setValue("#library-dialog-q", "jones");
    click(button(must("#library-dialog"), "Insert citation"));
    expect(must<HTMLTextAreaElement>("#f-grounds").value).toBe(
      "As held in Smith v. Jones, 90SCCV00123 (San Andreas Civil Court 1990), the claim fails.",
    );
    expect(defaultKV().get("lawapp_precedents")).toContain("Smith v. Jones");
  });
});
