// @vitest-environment jsdom
// The dark Discord preview renderer (and that it is inert), and the Discord tab settings.
import { describe, expect, it } from "vitest";
import { toDiscord } from "@/lib/discord";
import { renderDiscordHtml } from "@/lib/discordPreview";
import { DEFAULT_DISCORD, DISCORD_KEY, readDiscordSettings, writeDiscordSettings } from "@/lib/discordSettings";
import { memoryKV, type KV } from "@/lib/storage";
import { compile, render } from "@/lib/template";
import { MD_TEXT } from "./fixtures";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const dom = (md: string) => parse(`<div id="m">${renderDiscordHtml(md)}</div>`).getElementById("m")!;
const q = (md: string, sel: string) => dom(md).querySelector(sel);

function assertInert(html: string): void {
  const doc = parse(html);
  expect(doc.querySelector("script, img, iframe, object, embed, style")).toBeNull();
  for (const el of Array.from(doc.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      expect(attr.name.toLowerCase().startsWith("on"), `${el.tagName} has ${attr.name}`).toBe(false);
      expect(attr.value).not.toMatch(/javascript:/i);
    }
  }
  for (const a of Array.from(doc.querySelectorAll("[href]"))) expect(a.getAttribute("href")).toMatch(/^https?:\/\//i);
}

describe("renderDiscordHtml: blocks", () => {
  it("renders headings, subtext and plain lines", () => {
    expect(q("# A", ".dc-h1")?.textContent).toBe("A");
    expect(q("## A", ".dc-h2")?.textContent).toBe("A");
    expect(q("### A", ".dc-h3")?.textContent).toBe("A");
    expect(q("-# small", ".dc-sub")?.textContent).toBe("small");
    expect(q("plain", ".dc-line")?.textContent).toBe("plain");
    expect(q("a\n\nb", ".dc-blank")).not.toBeNull();
  });

  it("groups quote lines into one block quote", () => {
    const el = dom("> a\n> # b\nc");
    expect(el.querySelectorAll("blockquote.dc-quote")).toHaveLength(1);
    expect(el.querySelector("blockquote .dc-h1")?.textContent).toBe("b");
    expect(el.querySelector(":scope > .dc-line")?.textContent).toBe("c");
  });

  it("renders list items with depth and numbers", () => {
    const el = dom("- a\n  - b\n1. c");
    const items = el.querySelectorAll(".dc-li");
    expect(items).toHaveLength(3);
    expect(items[0].classList.contains("dc-depth-0")).toBe(true);
    expect(items[1].classList.contains("dc-depth-1")).toBe(true);
    expect(items[2].textContent).toBe("1. c");
  });

  it("renders code blocks in monospace without parsing markdown inside", () => {
    const el = dom("```txt\n**a** <b>\n  x\n```\nafter");
    const pre = el.querySelector("pre.dc-codeblock code");
    expect(pre?.textContent).toBe("**a** <b>\n  x");
    expect(el.querySelector("strong")).toBeNull();
    expect(el.querySelector(".dc-line")?.textContent).toBe("after");
  });
});

describe("renderDiscordHtml: inline", () => {
  it("renders bold, italic, underline, strike, spoiler and inline code", () => {
    expect(q("**a**", "strong")?.textContent).toBe("a");
    expect(q("*a*", "em")?.textContent).toBe("a");
    expect(q("__a__", "u")?.textContent).toBe("a");
    expect(q("~~a~~", "s")?.textContent).toBe("a");
    const sp = q("||a||", "span.dc-spoiler");
    expect(sp?.textContent).toBe("a");
    expect(sp?.getAttribute("tabindex")).toBe("0");
    expect(q("`a*b*`", "code.dc-code")?.textContent).toBe("a*b*");
  });

  it("nests markers", () => {
    expect(renderDiscordHtml("***x***")).toBe('<div class="dc-line"><strong><em>x</em></strong></div>');
    expect(q("__**x**__", "u > strong")?.textContent).toBe("x");
    expect(q("||**x**||", ".dc-spoiler > strong")?.textContent).toBe("x");
  });

  it("renders links (http/https only) and bare URLs", () => {
    const a = q("[t](https://e.com/x)", "a");
    expect(a?.getAttribute("href")).toBe("https://e.com/x");
    expect(a?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a?.textContent).toBe("t");
    expect(q("see https://e.com/a.png now", "a")?.getAttribute("href")).toBe("https://e.com/a.png");
    expect(q("[t](javascript:alert(1))", "a")).toBeNull();
  });

  it("shows escapes literally and leaves unmatched markers as text", () => {
    expect(dom("\\*a\\* \\_ \\<@1> \\# x").textContent).toBe("*a* _ <@1> # x");
    expect(dom("a * b ** c").textContent).toBe("a * b ** c");
    expect(dom("a **b").querySelector("strong")).toBeNull();
  });

  it("shows converted user text exactly as typed", () => {
    const out = toDiscord(render(compile("<p>{{Name|N}}</p>"), { Name: MD_TEXT }), { parser: parse });
    const el = dom(out);
    expect((el.textContent || "").replace(/\u200b/g, "")).toBe(MD_TEXT);
    expect(el.querySelector("strong, em, u, s, .dc-spoiler, code")).toBeNull();
  });
});

describe("renderDiscordHtml: XSS", () => {
  const PAYLOAD = `<img src=x onerror=alert(1)>"'&`;

  it("never produces markup from its input", () => {
    for (const md of [
      "<img src=x onerror=alert(1)>",
      "[x](javascript:alert(1))",
      '"><script>alert(1)</script>',
      "[<img src=x onerror=alert(1)>](https://e.com)",
      '[x](https://e.com/"onmouseover="alert(1))',
      'https://e.com/"><script>alert(1)</script>',
      "```\n</code></pre><script>alert(1)</script>\n```",
      "**<script>** ||<iframe>||",
    ]) {
      assertInert(renderDiscordHtml(md));
    }
  });

  it("keeps a template field payload inert from converter to preview", () => {
    const tree = compile("<p>{{Text|T}}</p><p>{{Url:url|U}}</p>{{Spoiler:spoiler|S}}<ul>{{List:list|<li>L</li>}}</ul>");
    const html = render(tree, { Text: PAYLOAD, Url: "javascript:alert(1)", Spoiler: PAYLOAD, List: PAYLOAD });
    for (const tables of ["code", "lines"] as const) {
      const out = renderDiscordHtml(toDiscord(html, { parser: parse, tables }));
      assertInert(out);
      expect(parse(out).body.textContent).toContain("<img src=x onerror=alert(1)>");
    }
  });
});

describe("Discord settings", () => {
  it("defaults with nothing saved, under the lawapp_discord key", () => {
    expect(DISCORD_KEY).toBe("lawapp_discord");
    expect(readDiscordSettings(memoryKV())).toEqual({ limit: 2000, tables: "code", markers: true });
    expect(DEFAULT_DISCORD).toEqual({ limit: 2000, tables: "code", markers: true });
  });

  it("round-trips", () => {
    const kv = memoryKV();
    expect(writeDiscordSettings({ limit: 4000, tables: "lines", markers: false }, kv)).toBe(true);
    expect(JSON.parse(kv.get(DISCORD_KEY)!)).toEqual({ limit: 4000, tables: "lines", markers: false });
    expect(readDiscordSettings(kv)).toEqual({ limit: 4000, tables: "lines", markers: false });
  });

  it("falls back per field for invalid values", () => {
    const kv = memoryKV({ [DISCORD_KEY]: JSON.stringify({ limit: 3000, tables: "x", markers: "yes" }) });
    expect(readDiscordSettings(kv)).toEqual(DEFAULT_DISCORD);
    const partial = memoryKV({ [DISCORD_KEY]: JSON.stringify({ limit: 4000, tables: 1 }) });
    expect(readDiscordSettings(partial)).toEqual({ limit: 4000, tables: "code", markers: true });
    expect(readDiscordSettings(memoryKV({ [DISCORD_KEY]: "[1,2]" }))).toEqual(DEFAULT_DISCORD);
    expect(readDiscordSettings(memoryKV({ [DISCORD_KEY]: "null" }))).toEqual(DEFAULT_DISCORD);
  });

  it("reads corrupt JSON as defaults and removes it", () => {
    const kv = memoryKV({ [DISCORD_KEY]: "{not json" });
    expect(readDiscordSettings(kv)).toEqual(DEFAULT_DISCORD);
    expect(kv.get(DISCORD_KEY)).toBeNull();
  });

  it("reports a refused write", () => {
    const kv: KV = {
      get: () => null,
      set: () => {
        throw new Error("quota");
      },
      remove: () => {},
    };
    expect(writeDiscordSettings(DEFAULT_DISCORD, kv)).toBe(false);
  });
});
