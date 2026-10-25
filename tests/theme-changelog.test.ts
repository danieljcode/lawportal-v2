// @vitest-environment jsdom
// The theme (AC 19, INV §e.6), the look (LP-110) and the changelog unread stamp (AC 18, INV §e.5).
import { beforeEach, describe, expect, it } from "vitest";
import { CHANGELOG, type ChangelogEntry } from "@/data/changelog";
import { friendlyDate, isUnread, markSeen, SEEN_KEY, stamp } from "@/lib/changelog";
import { memoryKV } from "@/lib/storage";
import { SHELL_KEY } from "@/lib/shell";
import { getTheme, setTheme, THEME_KEY, THEME_SCRIPT } from "@/lib/theme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-look");
});

describe("theme", () => {
  it("saves and applies each choice; auto leaves the system to decide", () => {
    expect(getTheme()).toBe("auto");
    setTheme("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    setTheme("dark");
    expect(getTheme()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    setTheme("auto");
    expect(localStorage.getItem(THEME_KEY)).toBe("auto");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("reads an unknown saved value as auto", () => {
    localStorage.setItem(THEME_KEY, "neon");
    expect(getTheme()).toBe("auto");
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

  it("THEME_SCRIPT sets the look from the saved layout, apart from light/dark (LP-110)", () => {
    new Function(THEME_SCRIPT)();
    expect(document.documentElement.dataset.look).toBe("modern");
    localStorage.setItem(SHELL_KEY, "classic");
    setTheme("dark");
    new Function(THEME_SCRIPT)();
    expect(document.documentElement.dataset.look).toBe("classic");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("changelog", () => {
  const added: ChangelogEntry[] = [{ date: "2026-12-01", items: [{ type: "fix", text: "A fix." }] }, ...CHANGELOG];

  it("stamps the newest entry and the entry count", () => {
    expect(stamp()).toBe("2026-10-25|Jump to any program or form|9|42");
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
