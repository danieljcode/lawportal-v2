// @vitest-environment jsdom
// The screensaver (LP-60): starts after the chosen idle time (5 minutes unless
// changed, or off), never over an open dialog, and the key or tap that ends it
// never reaches the app.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import IdleWatch, { CHECK_MS } from "@/shell/IdleWatch";
import {
  DEFAULT_WAIT,
  screensaverArt,
  screensaverWait,
  SCREENSAVER_KEY,
  setScreensaverArt,
  setScreensaverWait,
} from "@/lib/screensaver";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
const saver = () => document.querySelector("#screensaver");

/** Wait out `minutes` with no activity, and let the lazy screensaver load. */
async function idle(minutes: number) {
  await act(async () => {
    vi.advanceTimersByTime(minutes * 60_000 + CHECK_MS);
  });
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  // jsdom has no canvas: the picture just isn't drawn.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(createElement(IdleWatch)));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the screensaver's settings", () => {
  it("default to 5 minutes and the flying picture, and ignore unknown values", () => {
    expect(screensaverWait()).toBe(DEFAULT_WAIT);
    expect(screensaverArt()).toBe("flying");
    localStorage.setItem(SCREENSAVER_KEY, "7");
    expect(screensaverWait()).toBe(DEFAULT_WAIT);
    setScreensaverWait(0);
    setScreensaverArt("logo");
    expect(screensaverWait()).toBe(0);
    expect(screensaverArt()).toBe("logo");
  });
});

describe("the screensaver", () => {
  it("starts after 5 idle minutes, not before, and activity restarts the wait", async () => {
    await idle(4);
    expect(saver()).toBeNull();
    window.dispatchEvent(new Event("keydown"));
    await idle(4);
    expect(saver()).toBeNull();
    await idle(1);
    expect(saver()).not.toBeNull();
  });

  it("never starts when off, or over an open dialog", async () => {
    setScreensaverWait(0);
    await idle(60);
    expect(saver()).toBeNull();
    setScreensaverWait(1);
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.append(dialog);
    await idle(10);
    expect(saver()).toBeNull();
    dialog.remove();
    await idle(1);
    expect(saver()).not.toBeNull();
  });

  it("ends on a key, which never reaches the app", async () => {
    const typed = vi.fn();
    document.addEventListener("keydown", typed);
    await idle(5);
    const key = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
    act(() => {
      document.body.dispatchEvent(key);
    });
    expect(saver()).toBeNull();
    expect(typed).not.toHaveBeenCalled();
    expect(key.defaultPrevented).toBe(true);
  });

  it("ends on a tap, whose click never reaches the app", async () => {
    const button = document.createElement("button");
    const clicked = vi.fn();
    button.addEventListener("click", clicked);
    document.body.append(button);
    await idle(5);
    act(() => {
      button.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(saver()).toBeNull();
    expect(clicked).not.toHaveBeenCalled();
  });

  it("ends when the mouse moves, but not on the twitch of appearing under it", async () => {
    await idle(5);
    const move = (x: number) =>
      act(() => {
        window.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: 0 }));
      });
    move(100);
    move(102);
    expect(saver()).not.toBeNull();
    move(120);
    expect(saver()).toBeNull();
  });
});
