// @vitest-environment jsdom
// Exhibits on a case (LP-12): letters from their order, safe links, cleaning,
// reordering and merging, and the Evidence area on a case: add, edit, reorder
// (letters follow), delete after asking, and links and text shown safely.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { makeBackup } from "@/lib/backup";
import { caseStore, cleanCase, createCaseStore, unifyCases } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { cleanExhibit, cleanExhibits, exhibitLetter, moveExhibit, safeLink, unionExhibits } from "@/lib/exhibits";
import { memoryKV } from "@/lib/storage";
import * as sync from "@/lib/sync";
import type { Exhibit } from "@/lib/types";

const ex = (id: string, title: string): Exhibit => ({ id, title });

describe("exhibit letters", () => {
  it("go A to Z, then AA, AB… like spreadsheet columns", () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(exhibitLetter)).toEqual([
      "A",
      "B",
      "Z",
      "AA",
      "AB",
      "AZ",
      "BA",
      "ZZ",
      "AAA",
    ]);
  });
});

describe("cleaning exhibits", () => {
  it("keeps only http(s) links", () => {
    expect(safeLink("https://i.imgur.com/abc.png")).toBe("https://i.imgur.com/abc.png");
    expect(safeLink("http://example.com/x")).toBe("http://example.com/x");
    for (const bad of ["javascript:alert(1)", "data:text/html,hi", "/relative", "ftp://x.y", "not a url", ""]) {
      expect(safeLink(bad), bad).toBeUndefined();
    }
  });

  it("needs a title; drops a bad link or date; keeps the rest", () => {
    expect(cleanExhibit({ title: " " })).toBeNull();
    expect(
      cleanExhibit({
        id: "exh00001",
        title: " Dashcam ",
        description: "Front camera",
        link: "javascript:x",
        obtained: "19/10/1990",
      }),
    ).toEqual({ id: "exh00001", title: "Dashcam", description: "Front camera" });
    expect(
      cleanExhibits([{ id: "exh00001", title: "A" }, { id: "exh00001", title: "dupe" }, { title: "" }, "x"]),
    ).toEqual([{ id: "exh00001", title: "A" }]);
  });

  it("are kept on a case in order, and a merge keeps both copies'", () => {
    const c = cleanCase({ caseNumber: "90SCCR00001", exhibits: [ex("exh00002", "Second"), ex("exh00001", "First")] });
    expect(c.exhibits.map((e) => e.title)).toEqual(["Second", "First"]);
    const base = {
      caseNumber: "90SCCR00001",
      status: "Open" as const,
      created: "2026-10-01T00:00:00.000Z",
      lead: null,
      assigned: [],
      deadlines: [],
    };
    const [one] = unifyCases(
      [{ ...base, id: "case0001", updated: "2026-10-02T00:00:00.000Z", exhibits: [ex("exh00001", "Mine")] }],
      [{ ...base, id: "case0001", updated: "2026-10-01T00:00:00.000Z", exhibits: [ex("exh00009", "Theirs")] }],
    );
    expect(one.exhibits.map((e) => e.title)).toEqual(["Mine", "Theirs"]);
  });

  it("move up and down, and not past either end", () => {
    const list = [ex("exh00001", "A"), ex("exh00002", "B"), ex("exh00003", "C")];
    expect(moveExhibit(list, "exh00003", -1).map((e) => e.title)).toEqual(["A", "C", "B"]);
    expect(moveExhibit(list, "exh00001", -1)).toBe(list);
    expect(unionExhibits(list, [ex("exh00002", "B again")])).toHaveLength(3);
  });

  it("sync and back up with the case", () => {
    const kv = memoryKV();
    createCaseStore(kv).save({ caseNumber: "90SCCR00001", exhibits: [ex("exh00001", "Dashcam")] });
    expect(JSON.stringify(makeBackup(kv).data)).toContain("Dashcam");
    localStorage.clear();
    sync.__resetForTests();
    caseStore().save({ caseNumber: "90SCCR00002", exhibits: [ex("exh00002", "Bodycam")] });
    expect(sync.snapshot().cases[0].exhibits).toEqual([{ id: "exh00002", title: "Bodycam" }]);
    localStorage.clear();
  });
});

/* ---------- the Evidence area ---------- */

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
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function submit(): void {
  act(() => must("#exhibit-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}

function click(el: Element): void {
  act(() => (el as HTMLElement).click());
}

const letters = () =>
  [...document.querySelectorAll(".exhibit")].map(
    (li) => li.querySelector(".exhibit-letter")!.textContent + " " + li.querySelector(".exhibit-title")!.textContent,
  );
const button = (li: Element, text: string) =>
  [...li.querySelectorAll("button")].find(
    (b) => b.textContent === text || b.getAttribute("aria-label")?.startsWith(text),
  )!;

describe("the Evidence area on a case (LP-12)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    characterStore().save({ id: "alice001", name: "Alice Lawyer" });
    caseStore().save({ id: "case0001", caseNumber: "90SCCR00147", lead: "alice001" });
    history.replaceState(null, "", "#cases/case0001");
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

  const add = (title: string, link = "", obtained = "") => {
    click(must("#exhibit-new"));
    setValue("#exhibit-title", title);
    if (link) setValue("#exhibit-link", link);
    if (obtained) setValue("#exhibit-obtained", obtained);
    submit();
  };

  it("adds exhibits, lettered in order, with the date and a safe link", () => {
    expect(must("#exhibit-empty").textContent).toContain("No exhibits yet");
    add("Dashcam footage", "https://example.com/dashcam.mp4", "1990-10-18");
    add("Witness statement");
    expect(letters()).toEqual(["Exhibit A Dashcam footage", "Exhibit B Witness statement"]);
    const a = must<HTMLAnchorElement>(".exhibit a");
    expect(a.getAttribute("href")).toBe("https://example.com/dashcam.mp4");
    expect(a.rel).toContain("noopener");
    expect(must(".exhibit").textContent).toContain("Obtained Thu 18 Oct 1990");
    expect(caseStore().get("case0001")!.exhibits).toHaveLength(2);
  });

  it("refuses a link that isn't http(s), and needs a title", () => {
    click(must("#exhibit-new"));
    submit();
    expect(must("#exhibit-error").textContent).toBe("Give the exhibit a title.");
    setValue("#exhibit-title", "Bad");
    setValue("#exhibit-link", "javascript:alert(1)");
    submit();
    expect(must("#exhibit-error").textContent).toContain("http:// or https://");
    expect(caseStore().get("case0001")!.exhibits).toEqual([]);
  });

  it("reorders, and the letters follow", () => {
    add("First");
    add("Second");
    add("Third");
    click(button(document.querySelectorAll(".exhibit")[2], "Move Exhibit C up"));
    expect(letters()).toEqual(["Exhibit A First", "Exhibit B Third", "Exhibit C Second"]);
    expect(
      caseStore()
        .get("case0001")!
        .exhibits.map((e) => e.title),
    ).toEqual(["First", "Third", "Second"]);
  });

  it("edits an exhibit", () => {
    add("Dashcam");
    click(button(must(".exhibit"), "Edit"));
    expect(must<HTMLInputElement>("#exhibit-title").value).toBe("Dashcam");
    setValue("#exhibit-title", "Dashcam footage, unit 4");
    submit();
    expect(letters()).toEqual(["Exhibit A Dashcam footage, unit 4"]);
  });

  it("deletes after asking, and the later exhibits are relettered", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    add("First");
    add("Second");
    click(button(must(".exhibit"), "Delete"));
    expect(letters()).toHaveLength(2);
    click(button(must(".exhibit"), "Delete"));
    expect(confirmSpy.mock.calls[1][0]).toContain("Delete Exhibit A (First)?");
    expect(letters()).toEqual(["Exhibit A Second"]);
  });

  it("shows typed text as text, never markup", () => {
    add('<img src=x onerror="alert(1)">');
    expect(document.querySelector(".exhibit img")).toBeNull();
    expect(must(".exhibit-title").textContent).toBe('<img src=x onerror="alert(1)">');
  });
});
