// @vitest-environment jsdom
// The FEAT-005 UI through the whole App: the Characters dialog (12 fields, the
// name error, the docket box following the title, storage note), J.A.P. gating
// and output, the Dockets dialog, and What's new clearing the unread dot.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/components/App";
import { CHANGELOG } from "@/data/changelog";
import { characterStore } from "@/lib/characters";
import { docketStore } from "@/lib/dockets";
import { portfolioStore } from "@/lib/portfolio";
import { S_JAP_OFF, S_STORAGE_LOCAL } from "@/lib/strings";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);

function must<T extends Element = HTMLElement>(sel: string): T {
  const el = $<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
}

function click(sel: string): void {
  act(() => must(sel).click());
}

function type(sel: string, value: string): void {
  const input = must<HTMLInputElement>(sel);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function choose(sel: string, value: string): void {
  const select = must<HTMLSelectElement>(sel);
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function go(hash: string): void {
  act(() => {
    history.replaceState(null, "", hash || location.pathname);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

function submit(formSel: string): void {
  const form = must<HTMLFormElement>(formSel);
  act(() => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(createElement(App)));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  sync.__resetForTests();
});

describe("Characters dialog", () => {
  it("opens as a dialog with the sync panel and the storage note, and closes from the title bar", () => {
    click("#open-characters");
    const dialog = must<HTMLDialogElement>("#characters-dialog");
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.getAttribute("aria-labelledby")).toBe("characters-title");
    expect(must("#sync-badge").textContent).toBe("Off");
    expect(must("#storage-note").textContent).toBe(S_STORAGE_LOCAL);
    expect(must("#char-list").textContent).toContain("No characters yet.");
    click("#characters-dialog [data-close]");
    expect(dialog.hasAttribute("open")).toBe(false);
    expect($("#char-list")).toBeNull();
  });

  it("offers Restore my version when a sync merge kept this browser's copy aside (LP-64)", () => {
    act(() => root.unmount());
    sync.__resetForTests();
    localStorage.setItem(
      sync.LOST_KEY,
      JSON.stringify({ at: "2026-02-01T00:00:00.000Z", characters: [{ id: "char0001", name: "Kept Aside" }] }),
    );
    root = createRoot(container);
    act(() => root.render(createElement(App)));
    click("#open-characters");
    expect(must("#sync-lost").textContent).toContain("Your version of 1 character was replaced");
    click("#sync-restore");
    expect($("#sync-lost")).toBeNull();
    expect(characterStore().get("char0001")?.name).toBe("Kept Aside");
    expect(must("#char-list").textContent).toContain("Kept Aside");
  });

  it("has the 13 fields, needs a name, and the docket box follows the title", () => {
    click("#open-characters");
    click("#new-character");
    const ids = [...document.querySelectorAll("#char-fields :is(input, textarea, select)")].map((e) => e.id);
    expect(ids).toEqual([
      "char-name",
      "char-title",
      "char-dob",
      "char-gender",
      "char-phone",
      "char-address",
      "char-occupation",
      "char-bar",
      "char-email",
      "char-signature",
      "char-notes",
      "char-server",
      "char-docket",
    ]);
    submit("#char-form");
    expect(must("#char-error").textContent).toBe("A character needs a name.");

    type("#char-name", "Jane Roe");
    type("#char-title", "Court Commissioner II");
    expect(must<HTMLInputElement>("#char-docket").checked).toBe(true);
    type("#char-title", "Clerk");
    expect(must<HTMLInputElement>("#char-docket").checked).toBe(false);
    type("#char-title", "Court Commissioner II");
    submit("#char-form");

    expect($("#char-form")).toBeNull();
    const [c] = characterStore().list();
    expect(c.name).toBe("Jane Roe");
    expect(characterStore().activeId()).toBe(c.id); // the first character becomes active
    expect(must("#char-list").textContent).toContain("active");
    expect($("#open-jap")).not.toBeNull();
    expect($("#open-dockets")).not.toBeNull();
  });
});

describe("J.A.P.", () => {
  it("shows the gate without a commissioner and the portfolio with one", () => {
    go("#jap");
    expect($("#jap-gate")).not.toBeNull();
    expect($("#jap-body")).toBeNull();
    expect($("#jap-output")).toBeNull();
    expect(must<HTMLSelectElement>("#jap-level").disabled).toBe(true);

    let id = "";
    act(() => {
      id = characterStore().save({ name: "Jane Roe", title: "Court Commissioner II" }).id;
      characterStore().setActive(id);
    });
    expect($("#jap-gate")).toBeNull();
    expect(must<HTMLSelectElement>("#jap-level").value).toBe("II");
    expect(must("#jap-server-text").textContent).toBe(S_JAP_OFF);
    expect(must("#jap-topic").textContent).toBe("[J.A.P.] Jane Roe");
    expect(must<HTMLTextAreaElement>("#jap-bbcode").value).toMatch(
      /^\[divbox=transparent\]\[br\]\[\/br\]\[size=165\]\[b\]\[center\]JUDICIAL ADVANCEMENT PORTFOLIO/,
    );

    // CC II 2.1 asks for five arrest warrants; the entry saves immediately.
    expect(document.querySelectorAll("[id^='jap-2-1-'][id$='-num']")).toHaveLength(5);
    type("#jap-2-1-0-num", "AW-00042");
    type("#jap-2-1-0-link", "not a link");
    expect(must("#jap-2-1-0-link").classList.contains("invalid")).toBe(true);
    type("#jap-2-1-0-link", "https://example.com/aw42");
    expect(portfolioStore().get(id)?.II["2.1"]).toEqual([{ num: "AW-00042", link: "https://example.com/aw42" }]);
    expect(must<HTMLTextAreaElement>("#jap-bbcode").value).toContain("[*][url=https://example.com/aw42]AW-00042[/url]");

    // CC I keeps its own list.
    choose("#jap-level", "I");
    expect(must<HTMLTextAreaElement>("#jap-bbcode").value).not.toContain("AW-00042");

    choose("#active-character", "");
    expect($("#jap-gate")).not.toBeNull();
    expect($("#jap-output")).toBeNull();
  });
});

describe("Dockets dialog", () => {
  it("adds a case, rejects a duplicate, filters closed cases and offers Use in form", () => {
    let id = "";
    act(() => {
      id = characterStore().save({ name: "John Doe", title: "Attorney at Law" }).id;
      characterStore().setActive(id);
    });
    go("#civil-complaint");
    click("#open-dockets");
    expect(must("#dockets-title").textContent).toBe("John Doe's docket");
    expect(must("#docket-list").textContent).toContain("No cases yet.");

    click("#new-docket");
    type("#docket-caseNumber", "26GJCC00147");
    type("#docket-plaintiff", "Ann Smith");
    submit("#docket-form");
    expect(docketStore().list(id).map((d) => d.caseNumber)).toEqual(["26GJCC00147"]);

    click("#new-docket");
    type("#docket-caseNumber", "26gjcc00147");
    submit("#docket-form");
    expect(must("#docket-error").textContent).toBe("26gjcc00147 is already on this docket.");
    click("#cancel-docket");

    type("#docket-search", "ann smith");
    expect(must("#docket-list").textContent).toContain("26GJCC00147");
    const buttons = () => [...document.querySelectorAll<HTMLButtonElement>("#docket-list button")];
    expect(buttons().map((b) => b.textContent)).toEqual(["Use in form", "Edit", "Close case", "Delete"]);

    act(() => buttons().find((b) => b.textContent === "Close case")!.click());
    expect(must("#docket-list").textContent).toContain("No cases match.");
    choose("#docket-filter", "");
    expect(must("#docket-list").textContent).toContain("Closed");

    act(() => buttons().find((b) => b.textContent === "Use in form")!.click());
    expect(must<HTMLDialogElement>("#dockets-dialog").hasAttribute("open")).toBe(false);
    expect(must<HTMLInputElement>("#f-case-number").value).toBe("26GJCC00147");
    expect(must("#docket-status").textContent).toMatch(/^Loaded 26GJCC00147/);
  });
});

describe("What's new", () => {
  it("lists our entries and hides the unread dot once opened", () => {
    expect($("#changelog-dot")).not.toBeNull();
    click("#open-changelog");
    expect($("#changelog-dot")).toBeNull();
    expect(document.querySelectorAll("#changelog-list article.log-entry")).toHaveLength(CHANGELOG.length);
    expect(must("#changelog-list time").getAttribute("datetime")).toBe(CHANGELOG[0].date);
    expect([...document.querySelectorAll(".log-entry:first-child .log-type")].map((e) => e.textContent)).toEqual([
      "New",
      "Fixed",
    ]);
    expect([...document.querySelectorAll(".log-entry:nth-child(2) .log-type")].map((e) => e.textContent)).toEqual([
      "New",
      "Updated",
    ]);
    expect([...document.querySelectorAll(".log-entry:nth-child(3) .log-type")].map((e) => e.textContent)).toEqual([
      "New",
    ]);
    expect([...document.querySelectorAll(".log-entry:nth-child(4) .log-type")].map((e) => e.textContent)).toEqual([
      "Updated",
    ]);
  });
});
