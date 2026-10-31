// @vitest-environment jsdom
// Help (LP-94): a topic for every program, links that all lead somewhere, the little Markdown
// the topics use, Contents, Search and Back, and each program's "Help on" menu item.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { characterStore } from "@/lib/characters";
import * as sync from "@/lib/sync";
import HelpProgram from "@/programs/help";
import Markdown from "@/programs/help/Markdown";
import { TOPICS, searchTopics } from "@/programs/help/topics";
import type { ProgramProps } from "@/shell/program";
import { PROGRAMS } from "@/shell/registry";
import { hashFor, parseHash } from "@/shell/useRoute";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const must = <T extends HTMLElement = HTMLElement>(sel: string) => {
  const el = container.querySelector<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
};

const shellAt = (hash: string) => ({ route: parseHash(hash), visible: true }) as unknown as ProgramProps["shell"];

function show(hash: string): void {
  act(() => root.render(createElement(HelpProgram, { shell: shellAt(hash) })));
}

function type(text: string): void {
  const input = must<HTMLInputElement>("#help-q");
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(sync, "init").mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Help's topics (LP-94)", () => {
  it("have one for every program, each titled by its first line", () => {
    for (const p of PROGRAMS) expect(TOPICS.find((t) => t.id === p.id)?.title, p.id).toBeTruthy();
    expect(TOPICS.find((t) => t.id === "control")?.title).toBe("Settings");
    expect(new Set(TOPICS.map((t) => t.id)).size).toBe(TOPICS.length);
  });

  it("link only to topics that exist", () => {
    const ids = new Set(TOPICS.map((t) => t.id));
    for (const t of TOPICS)
      for (const [, href] of t.text.matchAll(/\]\(([^)]+)\)/g)) {
        expect(href, t.id).toMatch(/^#help\//);
        expect(ids.has(href.slice("#help/".length)), t.id + " → " + href).toBe(true);
      }
  });

  it("search the words, not the Markdown or link addresses", () => {
    expect(searchTopics(["nitro"]).map((t) => t.id)).toEqual(["forum"]);
    expect(searchTopics(["restore"]).map((t) => t.id)).toEqual(["sync"]);
    expect(searchTopics(["#help/"])).toEqual([]);
    expect(searchTopics([])).toEqual([]);
  });
});

describe("Help's Markdown (LP-94)", () => {
  const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));

  it("renders headings, paragraphs, lists, bold, code and links", () => {
    expect(html("# Title\n\nOne\nline.\n\n## Part")).toBe("<h2>Title</h2><p>One line.</p><h3>Part</h3>");
    expect(html("- **a** `b`\n  more\n- [c](#help/x)")).toBe(
      '<ul><li><strong>a</strong> <code>b</code> more</li><li><a href="#help/x">c</a></li></ul>',
    );
    expect(html("# Title\r\n\r\n- a\r\n- b")).toBe("<h2>Title</h2><ul><li>a</li><li>b</li></ul>");
    expect(html("1. one\n2. two")).toBe("<ol><li>one</li><li>two</li></ol>");
    expect(html("[site](https://example.com)")).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noreferrer">site</a></p>',
    );
  });

  it("never makes markup or unsafe links", () => {
    expect(html("<img src=x onerror=alert(1)>")).toBe("<p>&lt;img src=x onerror=alert(1)&gt;</p>");
    expect(html("[bad](javascript:void)")).toBe("<p>bad</p>");
  });
});

describe("the Help program (LP-94)", () => {
  it("routes #help and #help/<topic>", () => {
    expect(parseHash("#help")).toEqual({ program: "help", topic: null });
    expect(parseHash("#help/cases")).toEqual({ program: "help", topic: "cases" });
    expect(parseHash("#help/<x>")).toEqual({ program: "help", topic: null });
    expect(hashFor({ program: "help", topic: "sync" })).toBe("#help/sync");
  });

  it("lists the contents, opens a topic and says when one doesn't exist", () => {
    show("#help");
    expect(must("#help-title").textContent).toBe("Contents");
    expect(container.querySelectorAll(".help-list a")).toHaveLength(TOPICS.length);
    expect(must("#help-link-cases").getAttribute("href")).toBe("#help/cases");

    show("#help/cases");
    expect(must(".help-topic h2").textContent).toBe("The Case File");

    show("#help/nothing");
    expect(must("#help-title").textContent).toBe("Contents");
    expect(container.textContent).toContain("There's no Help topic called “nothing”");
  });

  it("searches as you type, with the words marked", () => {
    show("#help");
    type("chain custody");
    expect([...container.querySelectorAll(".help-list a")].map((a) => a.id)).toEqual(["help-link-cases"]);
    expect(must("[role=status]").textContent).toBe("1 topic");
    type("zzz");
    expect(must("[role=status]").textContent).toBe("No topics found.");
    type("");
    expect(must("#help-title")).toBeTruthy();
  });

  it("goes Back through the topics read", () => {
    show("#help");
    expect(must<HTMLButtonElement>("#help-back").disabled).toBe(true);
    show("#help/filings");
    show("#help/forum");
    act(() => must("#help-back").click());
    expect(location.hash).toBe("#help/filings");
    show("#help/filings");
    act(() => must("#help-back").click());
    expect(location.hash).toBe("#help");
    show("#help");
    expect(must<HTMLButtonElement>("#help-back").disabled).toBe(true);
  });
});

describe("Help on this program (LP-94)", () => {
  it("is in every program's Help menu, opening its topic", () => {
    characterStore().save({ id: "alice001", name: "Alice Lawyer" });
    history.replaceState(null, "", "#cases");
    act(() => root.render(createElement(App)));
    const help = [...container.querySelectorAll<HTMLElement>(".menubar button, [data-top]")].find(
      (b) => b.textContent === "Help",
    );
    act(() => help?.click());
    expect(must("#menu-help-program").textContent).toBe("Help on Case File");
    expect(must("#menu-help-program").getAttribute("href")).toBe("#help/cases");
    expect(must("#menu-help-contents").getAttribute("href")).toBe("#help");
  });
});
