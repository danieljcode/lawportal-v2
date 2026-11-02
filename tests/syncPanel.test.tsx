// @vitest-environment jsdom
// The sync panel asks for an invite word only when the server wants one (LP-178).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import SyncPanel from "@/shell/SyncPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CODE = "JSA-ABCD-EFGH-JKLM-NPQR-STUV";

describe("turning on sync", () => {
  let root: Root;
  let box: HTMLDivElement;
  let posts: unknown[];

  /** The account route refuses without "open sesame"; everything else succeeds. */
  function stubServer(): void {
    posts = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (url !== "/api/account") return { status: 200, json: async () => ({ rev: 1, updated: "u1" }) };
        const body = JSON.parse(String(init.body)) as { invite?: string };
        posts.push(body);
        return body.invite === "open sesame"
          ? { status: 201, json: async () => ({ code: CODE }) }
          : { status: 403, json: async () => ({ error: "That invite word isn't right." }) };
      }),
    );
  }

  const enable = () =>
    act(async () => {
      document.querySelector<HTMLFormElement>("#sync-off form")!.requestSubmit();
    });

  beforeEach(async () => {
    localStorage.clear();
    stubServer();
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    await act(async () => root.render(createElement(SyncPanel)));
  });

  afterEach(() => {
    act(() => root.unmount());
    box.remove();
    vi.unstubAllGlobals();
  });

  it("asks for the word after the server refuses, then sends it", async () => {
    expect(document.querySelector("#sync-invite")).toBeNull();
    await enable();
    const input = document.querySelector<HTMLInputElement>("#sync-invite")!;
    expect(input).not.toBeNull();
    expect(document.querySelector("#sync-panel")!.textContent).toContain("needs an invite word");

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "open sesame");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await enable();
    expect(posts).toEqual([{}, { invite: "open sesame" }]);
    expect(document.querySelector("#sync-code")!.textContent).toBe(CODE);
  });
});
