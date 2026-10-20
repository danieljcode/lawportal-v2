// @vitest-environment jsdom
// The penal code in the Law Library (LP-17): the importer that writes the one
// data file, the data file itself, search (section number, keyword, title),
// the sentence wording and citations, and through the App: the Penal Code tab
// (last updated, highlights, filters, retired charges, copy) and Insert
// citation from a form.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/components/App";
import { characterStore } from "@/lib/characters";
import * as clipboard from "@/lib/clipboard";
import { EMPTY_STATE, writeDraft } from "@/lib/formState";
import {
  CHARGE_CLASSES,
  chargeCitation,
  chapters,
  fineText,
  PENAL_CODE,
  searchCharges,
  sentenceText,
  type Charge,
} from "@/lib/penalCode";
import { defaultKV } from "@/lib/storage";
import * as sync from "@/lib/sync";
import { chargesFrom, parseCsv } from "../scripts/import-penal-code.mjs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CSV = [
  '"State of San Andreas Penal Code (Revised Draft) Notes. PC # Crimes Against Persons","Offence ","Severity ","Jail (months) ","Min ","Max ","Fine ($) ","Description / Elements ","Additional Penalties ","Status ","Change Notes ","Previous Values "',
  '"PC 1001","Assault","Misdemeanor","10","8","13","$300","A person who threatens another, ""causing fear"".","","Unchanged","",""',
  '"PC 1029","1st Degree Murder","Capital","","1000","","","The premeditated killing\nof another person.","Weapon seized","Amended","Internal note","Old"',
  '"Offenses Involving Theft","","","","","","","","","","",""',
  '"PC 2001","Petty Theft","Misdemeanor","5","4","6","$1,250","Theft under $500.","","New","",""',
  '"PC 2002","","Infraction","0","0","0","$0","","","Retired","",""',
].join("\r\n");

describe("the importer", () => {
  it("reads quoted CSV: commas, doubled quotes and line breaks inside fields", () => {
    expect(parseCsv('a,"b,c","say ""hi""","two\nlines"\r\nx')).toEqual([["a", "b,c", 'say "hi"', "two\nlines"], ["x"]]);
  });

  it("turns the Penal Code tab into charges by chapter, leaving the review's notes out", () => {
    expect(chargesFrom(parseCsv(CSV))).toEqual([
      {
        section: "PC 1001",
        chapter: "Crimes Against Persons",
        title: "Assault",
        class: "Misdemeanor",
        jail: 10,
        min: 8,
        max: 13,
        fine: 300,
        description: 'A person who threatens another, "causing fear".',
        status: "unchanged",
      },
      {
        section: "PC 1029",
        chapter: "Crimes Against Persons",
        title: "1st Degree Murder",
        class: "Capital",
        min: 1000,
        description: "The premeditated killing of another person.",
        penalties: "Weapon seized",
        status: "amended",
      },
      {
        section: "PC 2001",
        chapter: "Offenses Involving Theft",
        title: "Petty Theft",
        class: "Misdemeanor",
        jail: 5,
        min: 4,
        max: 6,
        fine: 1250,
        description: "Theft under $500.",
        status: "new",
      },
    ]);
  });
});

describe("the penal code data file", () => {
  it("has every charge once, with a title, chapter and known class, and a last-updated date", () => {
    expect(PENAL_CODE.charges.length).toBeGreaterThan(250);
    expect(PENAL_CODE.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const sections = PENAL_CODE.charges.map((c) => c.section);
    expect(new Set(sections).size).toBe(sections.length);
    for (const c of PENAL_CODE.charges) {
      expect(c.section, c.section).toMatch(/^PC \d+$/);
      expect(c.title && c.chapter && c.description !== undefined, c.section).toBeTruthy();
      expect(CHARGE_CLASSES, c.section).toContain(c.class);
    }
    expect(chapters()[0]).toBe("Crimes Against Persons");
  });
});

const charge = (o: Partial<Charge> & { section: string; title: string }): Charge => ({
  chapter: "Crimes Against Persons",
  class: "Felony",
  description: "",
  status: "unchanged",
  ...o,
});

const CODE: Charge[] = [
  charge({ section: "PC 1001", title: "Assault", class: "Misdemeanor", description: "Threatening violence." }),
  charge({ section: "PC 1002", title: "Aggravated Assault", description: "Assault with a deadly weapon." }),
  charge({ section: "PC 1010", title: "Kidnapping", description: "Taking a person by force, e.g. after an assault." }),
  charge({ section: "PC 4006", title: "Criminal Mischief Involving Fire", status: "retired", chapter: "Damage" }),
  charge({ section: "PC 10010", title: "Speeding", class: "Infraction", chapter: "Vehicles" }),
];

describe("searching the penal code", () => {
  const ids = (q: string, f: object = {}) => searchCharges(CODE, { q, ...f }).map((c) => c.section);

  it("finds a section by number, with or without PC, first", () => {
    expect(ids("1001")[0]).toBe("PC 1001");
    expect(ids("PC 1010")).toEqual(["PC 1010"]);
    expect(ids("pc 100")).toEqual(["PC 1001", "PC 1002", "PC 10010"]);
  });

  it("puts title matches before description matches, in code order", () => {
    expect(ids("assault")).toEqual(["PC 1001", "PC 1002", "PC 1010"]);
    expect(ids("deadly weapon")).toEqual(["PC 1002"]);
  });

  it("filters by chapter and class, and leaves retired charges out unless asked or named", () => {
    expect(ids("", { class: "Infraction" })).toEqual(["PC 10010"]);
    expect(ids("", { chapter: "Vehicles" })).toEqual(["PC 10010"]);
    expect(ids("fire")).toEqual([]);
    expect(ids("fire", { retired: true })).toEqual(["PC 4006"]);
    expect(ids("4006")).toEqual(["PC 4006"]);
  });
});

describe("sentences and citations", () => {
  it("say the default and range, or the judge's discretion", () => {
    const s = (o: Partial<Charge>) => sentenceText(charge({ section: "PC 1", title: "X", ...o }));
    expect(s({ jail: 10, min: 8, max: 13 })).toBe("10 months (range 8–13 months)");
    expect(s({ jail: 0, min: 0, max: 0 })).toBe("No jail");
    expect(s({ jail: 1 })).toBe("1 month");
    expect(s({ min: 600, max: 1000 })).toBe("Judge's discretion: 600–1,000 months");
    expect(s({ min: 1000, class: "Capital" })).toBe("Judge's discretion: 1,000 months or more, up to life");
    expect(s({})).toBe("See the description");
    expect(fineText(charge({ section: "PC 1", title: "X", fine: 1250 }))).toBe("$1,250");
    expect(fineText(charge({ section: "PC 1", title: "X", fine: 0 }))).toBe("");
    expect(chargeCitation(CODE[0])).toBe("PC 1001 Assault");
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
const names = (sel: string) => [...document.querySelectorAll(sel + " .charge-name")].map((n) => n.textContent);

function mount(hash: string): void {
  history.replaceState(null, "", hash);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(App)));
}

describe("the Penal Code in the Law Library (LP-17)", () => {
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

  it("opens on the code, says when it was updated, and searches with highlights", () => {
    mount("#library");
    expect(must("#library-tab-code").getAttribute("aria-selected")).toBe("true");
    expect(must("#code-source").textContent).toMatch(/last updated \d{1,2} [A-Z][a-z]{2} \d{4}/);
    // A page of results, then Show more.
    expect(document.querySelectorAll("#code-list .charge")).toHaveLength(40);
    click(must("#code-more"));
    expect(document.querySelectorAll("#code-list .charge")).toHaveLength(80);

    setValue("#code-q", "1001");
    expect(names("#code-list")[0]).toBe("PC 1001 · Assault");
    expect(must("#code-list mark").textContent).toBe("1001");
    setValue("#code-q", "murder");
    expect([...document.querySelectorAll("#code-list mark")].some((m) => /murder/i.test(m.textContent!))).toBe(true);

    setValue("#code-q", "");
    setValue("#code-class", "Infraction");
    expect(
      [...document.querySelectorAll("#code-list .charge-class")].every((t) => t.textContent === "Infraction"),
    ).toBe(true);
  });

  it("hides retired charges until asked, and copies a citation", async () => {
    const copy = vi.spyOn(clipboard, "copyText").mockResolvedValue(true);
    mount("#library");
    setValue("#code-q", "criminal mischief involving fire");
    expect(document.querySelector("#code-none")).not.toBeNull();
    act(() => must<HTMLInputElement>("#code-retired").click());
    expect(must(".charge.retired").textContent).toContain("Retired");
    setValue("#code-q", "1001");
    await act(async () => button(must("#code-list"), "Copy citation").click());
    expect(copy).toHaveBeenCalledWith("PC 1001 Assault");
  });

  it("is found from the sidebar search", () => {
    mount("#filings");
    for (const q of ["library", "penal", "precedents"]) {
      setValue("#form-search", q);
      expect(document.querySelector('#form-list a[href="#library/penal-code"]'), q).not.toBeNull();
    }
  });

  it("keeps the firm's precedents on their own tab", () => {
    mount("#library");
    click(must("#library-tab-precedents"));
    expect(must("#precedents-empty").textContent).toContain("No rulings");
    expect(document.querySelector("#code-q")).toBeNull();
  });

  it("inserts a penal code citation into the form field last clicked in", () => {
    writeDraft(defaultKV(), "extra-general-motion", { ...EMPTY_STATE, values: { Grounds: "Charged under ." } });
    mount("#extra-general-motion");
    const area = must<HTMLTextAreaElement>("#f-grounds");
    act(() => area.focus());
    area.setSelectionRange(14, 14);
    click(must("#open-library"));
    setValue("#library-dialog-code-q", "PC 1001");
    click(button(must("#library-dialog-code-list"), "Insert citation"));
    expect(must<HTMLTextAreaElement>("#f-grounds").value).toBe("Charged under PC 1001 Assault.");
  });
});
