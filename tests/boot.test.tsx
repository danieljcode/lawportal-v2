// @vitest-environment jsdom
// The DOS-style boot screen (LP-21): what it says as it runs, once per browser
// session, skipped by any key or click, off by the start page setting, still
// with reduced motion, and never longer than about 2 seconds.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/components/App";
import {
  BOOT_OFF_KEY,
  BOOT_TIMES,
  BOOTED_KEY,
  bootEnabled,
  bootLines,
  markBooted,
  memoryAt,
  MEMORY_K,
  setBootEnabled,
  shouldBoot,
  STILL_MS,
} from "@/lib/boot";
import { setShell } from "@/lib/shell";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("the boot screen's lines", () => {
  it("count the memory up in 64K steps, then check the drives and end at C:\\>", () => {
    expect(memoryAt(0)).toBe(0);
    expect(memoryAt(BOOT_TIMES.memoryEnd / 2) % 64).toBe(0);
    expect(memoryAt(BOOT_TIMES.memoryEnd + 500)).toBe(MEMORY_K);
    expect(bootLines(0)).toEqual([
      "Friedman & Associates Office System",
      "BIOS Version 1.02  (C) 1990 Friedman & Associates",
      "",
      "Memory Test: 0K",
    ]);
    const done = bootLines(BOOT_TIMES.done);
    expect(done).toContain("Memory Test: 4096K OK");
    expect(done).toContain("Detecting drive C: ... 40MB fixed disk");
    expect(done[done.length - 1]).toBe("C:\\>");
  });

  it("never takes more than about 2 seconds", () => {
    expect(BOOT_TIMES.done).toBeLessThanOrEqual(2000);
    expect(STILL_MS).toBeLessThanOrEqual(2000);
  });
});

describe("when the boot screen shows", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("once per browser session, unless it's turned off", () => {
    expect(bootEnabled()).toBe(true);
    expect(shouldBoot()).toBe(true);
    markBooted();
    expect(sessionStorage.getItem(BOOTED_KEY)).toBe("1");
    expect(shouldBoot()).toBe(false);
    sessionStorage.clear();
    setBootEnabled(false);
    expect(localStorage.getItem(BOOT_OFF_KEY)).toBe("off");
    expect(shouldBoot()).toBe(false);
    setBootEnabled(true);
    expect(localStorage.getItem(BOOT_OFF_KEY)).toBeNull();
  });
});

/* ---------- through the App ---------- */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(hash = "#"): void {
  history.replaceState(null, "", hash);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(App)));
}

function unmount(): void {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
}

const screen = () => document.querySelector("#boot-screen");
const motion = (reduce: boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce"), media: q }) as MediaQueryList);

describe("the boot screen in the App (LP-21)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    // The boot screen is part of the Classic layout (LP-125).
    setShell("classic");
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    motion(false);
  });

  afterEach(() => {
    unmount();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("runs over the app, ends by itself, and doesn't come back this session", () => {
    mount();
    expect(screen()!.textContent).toContain("Friedman & Associates Office System");
    expect(screen()!.getAttribute("aria-hidden")).toBe("true");
    // The app is already there underneath.
    expect(document.querySelector("#program-manager")).not.toBeNull();
    act(() => vi.advanceTimersByTime(BOOT_TIMES.prompt + 60));
    expect(screen()!.textContent).toContain("Memory Test: 4096K OK");
    expect(screen()!.textContent).toContain("C:\\>");
    act(() => vi.advanceTimersByTime(BOOT_TIMES.done));
    expect(screen()).toBeNull();
    unmount();
    mount();
    expect(screen()).toBeNull();
  });

  it("is skipped by any key or click", () => {
    mount();
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "x" })));
    expect(screen()).toBeNull();
    unmount();
    sessionStorage.clear();
    mount();
    act(() => window.dispatchEvent(new Event("pointerdown")));
    expect(screen()).toBeNull();
  });

  it("shows the finished screen, still, with reduced motion", () => {
    motion(true);
    mount();
    expect(screen()!.textContent).toContain("C:\\>");
    act(() => vi.advanceTimersByTime(STILL_MS));
    expect(screen()).toBeNull();
  });

  it("can be turned off in the Control Panel", () => {
    markBooted();
    mount("#control");
    const box = document.querySelector<HTMLInputElement>("#boot-setting")!;
    expect(box.checked).toBe(true);
    act(() => box.click());
    expect(localStorage.getItem(BOOT_OFF_KEY)).toBe("off");
    unmount();
    sessionStorage.clear();
    mount("#control");
    expect(screen()).toBeNull();
    expect(document.querySelector<HTMLInputElement>("#boot-setting")!.checked).toBe(false);
  });
});
