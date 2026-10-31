// SafeHtml (LP-5): only the renderers make it, and the places HTML goes to
// (preview, Discord preview, clipboard, .docx) accept nothing else.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DiscordPanelProps } from "@/programs/filings/DiscordPanel";
import type { FormOutput } from "@/programs/filings/FormView";
import type { OutputPaneProps } from "@/programs/filings/OutputPane";
import { copyRich } from "@/lib/clipboard";
import { renderDiscordHtml } from "@/lib/discordPreview";
import { saveDocx } from "@/lib/docx/saveDocx";
import { EMPTY_HTML, type SafeHtml } from "@/lib/safeHtml";
import { compile, escapeHtml, render } from "@/lib/template";

/**
 * Compile-time checks, never run. Each @ts-expect-error must be an error: if a
 * sink is loosened back to `string`, the directive itself becomes an error and
 * `npm run build` (which type-checks the tests) fails.
 */
export function compileTimeChecks(plain: string, safe: SafeHtml): void {
  // @ts-expect-error a plain string can't be copied as HTML
  void copyRich(plain, plain);
  void copyRich(safe, plain);

  // @ts-expect-error a plain string can't be made into a .docx
  void saveDocx(plain, "Title", "id");
  void saveDocx(safe, "Title", "id");

  // @ts-expect-error the preview only shows rendered HTML
  const preview: OutputPaneProps["previewHtml"] = plain;
  // @ts-expect-error nor does the Discord preview
  const discord: DiscordPanelProps["finalHtml"] = plain;
  // @ts-expect-error a form's output is rendered HTML
  const output: FormOutput = { finalHtml: plain, previewHtml: safe };
  void [preview, discord, output];

  // A SafeHtml is still a string wherever a string is fine.
  const asText: string = safe;
  void asText;
}

describe("SafeHtml sources", () => {
  it("the renderers produce it, unchanged as strings", () => {
    const html: SafeHtml = render(compile("<p>{{Name|NAME}}</p>"), { Name: '<b>"x"</b>' });
    expect(html).toBe("<p>&lt;b&gt;&quot;x&quot;&lt;/b&gt;</p>");
    const text: SafeHtml = escapeHtml("<script>");
    expect(text).toBe("&lt;script&gt;");
    const discord: SafeHtml = renderDiscordHtml("**<i>**");
    expect(discord).not.toContain("<i>");
    expect(EMPTY_HTML).toBe("");
  });

  it("only the renderers mark HTML as safe", () => {
    // The renderers: escapeHtml and render() (template/, LP-7) and the Discord preview.
    const allowed = [
      "src/lib/safeHtml.ts",
      "src/lib/template/escape.ts",
      "src/lib/template/render.ts",
      "src/lib/discordPreview.ts",
    ];
    const root = path.resolve(process.cwd(), "src");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name)) files.push(full);
      }
    };
    walk(root);
    const offenders = files
      .map((f) => path.relative(process.cwd(), f).replace(/\\/g, "/"))
      .filter((f) => !allowed.includes(f))
      .filter((f) => /trustAsSafeHtml\(|as SafeHtml\b/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
