// @vitest-environment jsdom
// Programs load lazily (LP-122): a program's code is fetched the first time it's opened, with
// Loading… meanwhile, and the programs the character can open are fetched when the browser is idle.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let unmount: () => void = () => {};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(sync, "init").mockResolvedValue(undefined);
});

afterEach(() => {
  unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** App, React and the registry from one fresh module graph; `fresh` skips tests/setup.ts's preload. */
async function mountApp(hash: string, fresh: boolean) {
  if (fresh) vi.resetModules();
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { default: App } = await import("@/shell/App");
  const { PROGRAMS } = await import("@/shell/registry");
  history.replaceState(null, "", hash || location.pathname);
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  act(() => root.render(createElement(App)));
  unmount = () => {
    act(() => root.unmount());
    container.remove();
  };
  return { act, PROGRAMS };
}

describe("lazy programs (LP-122)", () => {
  it("shows Loading… until a program's code has arrived, then the program", async () => {
    const { act, PROGRAMS } = await mountApp("#control", true);
    expect(document.querySelector("#control-title")).toBeNull();
    expect(document.querySelector(".booting")?.textContent).toBe("Loading…");
    await act(() => PROGRAMS.find((p) => p.id === "control")!.load());
    expect(document.querySelector("#control-title")?.textContent).toBe("Control Panel");
    expect(document.querySelector(".booting")).toBeNull();
  });

  it("fetches the programs this character can open once the browser is idle, not the J.A.P.", async () => {
    let idle: () => void = () => {};
    vi.stubGlobal("requestIdleCallback", (f: () => void) => ((idle = f), 1));
    const { PROGRAMS } = await mountApp("", false);
    const loads = PROGRAMS.map((p) => vi.spyOn(p, "load").mockResolvedValue(undefined));
    expect(loads.every((l) => l.mock.calls.length === 0)).toBe(true);
    idle();
    expect(PROGRAMS.filter((_, i) => loads[i].mock.calls.length).map((p) => p.id)).toEqual(
      PROGRAMS.filter((p) => p.id !== "jap").map((p) => p.id),
    );
  });
});
