// Keyboard focus (LP-29): tabbing through the home screen and each program's start page, in the Modern
// and Classic layouts, light and dark, every focused element shows it: an outline, or a ring, background
// or colour of its own (the menus' highlight). And each has a name in words for a screen reader, not
// only an icon (an input's label counts). Desktop only; the phone layout has the same controls.
import { expect, test } from "@playwright/test";
import { LAYOUTS, THEMES, VIEWS, openView } from "./views";

/** How many Tab presses per screen: enough for the frame and the top of each program. */
const STOPS = 40;

for (const layout of LAYOUTS) {
  for (const theme of THEMES) {
    for (const [view, url] of VIEWS) {
      test(`focus shows, ${view}, ${layout}, ${theme}`, async ({ page }, info) => {
        test.skip(info.project.name !== "desktop", "same controls at both sizes");
        await openView(page, url, layout, theme);
        const hidden: string[] = [];
        const unnamed: string[] = [];
        const seen = new Set<string>();
        let first = "";
        for (let i = 0; i < STOPS; i++) {
          await page.keyboard.press("Tab");
          const r = await page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null;
            if (!el || el === document.body) return null;
            const look = () => {
              const s = getComputedStyle(el);
              return [
                s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0,
                s.boxShadow,
                s.backgroundColor,
                s.color,
              ];
            };
            const on = look();
            el.blur();
            const off = look();
            el.focus();
            const name =
              el.tagName.toLowerCase() +
              (el.id ? "#" + el.id : "") +
              " " +
              (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30);
            const by = el.getAttribute("aria-labelledby");
            const label =
              el.getAttribute("aria-label") ||
              (by
                ? by
                    .split(" ")
                    .map((id) => document.getElementById(id)?.textContent ?? "")
                    .join(" ")
                : "") ||
              ("labels" in el
                ? [...((el as HTMLInputElement).labels ?? [])].map((l) => l.textContent).join(" ")
                : "") ||
              el.getAttribute("placeholder") ||
              el.getAttribute("title") ||
              el.textContent ||
              "";
            return {
              name,
              shown: on[0] === true || on.slice(1).some((v, j) => v !== off[j + 1]),
              named: /\p{L}/u.test(label),
            };
          });
          if (!r) continue;
          if (r.name === first) break; // back round to the start
          if (!first) first = r.name;
          seen.add(r.name);
          if (!r.shown) hidden.push(r.name);
          if (!r.named) unnamed.push(r.name);
        }
        // At least the frame's menus (the J.A.P. shows only a notice to anyone but a Court Commissioner).
        expect(seen.size, [...seen].join(" | ")).toBeGreaterThan(2);
        expect(hidden).toEqual([]);
        expect(unnamed).toEqual([]);
      });
    }
  }
}
