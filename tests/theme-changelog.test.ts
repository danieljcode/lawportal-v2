// @vitest-environment jsdom
// Theme toggle (AC 19, INV §e.6) and the changelog unread stamp (AC 18, INV §e.5).
import { beforeEach, describe, expect, it } from "vitest";
import { CHANGELOG, type ChangelogEntry } from "@/data/changelog";
import { friendlyDate, isUnread, markSeen, SEEN_KEY, stamp } from "@/lib/changelog";
import { memoryKV } from "@/lib/storage";
import { cycle, getTheme, ICONS, setTheme, THEME_KEY, THEME_SCRIPT, themeLabel } from "@/lib/theme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("theme", () => {
  it("cycles auto → light → dark → auto and persists each step", () => {
    expect(getTheme()).toBe("auto");
    expect(cycle()).toBe("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(cycle()).toBe("dark");
    expect(getTheme()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(cycle()).toBe("auto");
    expect(localStorage.getItem(THEME_KEY)).toBe("auto");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("reads an unknown saved value as auto", () => {
    localStorage.setItem(THEME_KEY, "neon");
    expect(getTheme()).toBe("auto");
  });

  it("labels the button with the reference wording", () => {
    expect(themeLabel("auto")).toBe("Theme: automatic (follows your system). Click to change.");
    expect(themeLabel("light")).toBe("Theme: light. Click to change.");
    expect(themeLabel("dark")).toBe("Theme: dark. Click to change.");
    expect([ICONS.auto, ICONS.light, ICONS.dark]).toEqual(["◐", "☀", "☾"]);
  });

  it("THEME_SCRIPT applies a saved light/dark choice and ignores anything else", () => {
    setTheme("dark");
    document.documentElement.removeAttribute("data-theme");
    new Function(THEME_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("dark");

    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem(THEME_KEY, "auto");
    new Function(THEME_SCRIPT)();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});

describe("changelog", () => {
  const added: ChangelogEntry[] = [{ date: "2026-12-01", items: [{ type: "fix", text: "A fix." }] }, ...CHANGELOG];

  it("stamps the newest entry and the entry count", () => {
    expect(stamp()).toBe("2026-10-20|Firm letters|2|24");
    expect(stamp([])).toBe("");
  });

  it("changes the stamp when an entry or an item is added", () => {
    expect(stamp(added)).not.toBe(stamp());
    const moreItems: ChangelogEntry[] = [
      { ...CHANGELOG[0], items: [...CHANGELOG[0].items, { type: "fix", text: "x" }] },
      CHANGELOG[1],
    ];
    expect(stamp(moreItems)).not.toBe(stamp());
  });

  it("is unread until seen, and unread again after a new entry", () => {
    const kv = memoryKV();
    expect(isUnread(kv)).toBe(true);
    markSeen(kv);
    expect(kv.get(SEEN_KEY)).toBe(stamp());
    expect(isUnread(kv)).toBe(false);
    expect(isUnread(kv, added)).toBe(true);
  });

  it("formats dates in UTC", () => {
    expect(friendlyDate("2026-10-05")).toMatch(/2026/);
    expect(friendlyDate("not a date")).toBe("not a date");
  });
});
