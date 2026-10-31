// @vitest-environment jsdom
// Pick from Rolodex (LP-30): a party's name field fills the contact's name, and its
// address and phone where the form has fields beside it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { characterStore } from "@/lib/characters";
import { contactStore, type Contact } from "@/lib/contacts";
import { EMPTY_STATE, fillFromContact, isPartyName } from "@/lib/formState";
import * as sync from "@/lib/sync";
import { compile, fields } from "@/lib/template";
import type { Field } from "@/lib/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const JUDY: Contact = {
  id: "con00001",
  name: "Judy Reyes",
  type: "client",
  phone: "555-0101",
  address: "12 Grove St",
  created: "2026-10-29T10:00:00.000Z",
  updated: "2026-10-29T10:00:00.000Z",
};

describe("fillFromContact", () => {
  const entries = fields(compile("{{Spouse 1 name}} {{Spouse 1 address}} {{Spouse 2 name}} {{Spouse 2 address}}"));

  it("fills the name and the address beside it, and leaves the other party alone", () => {
    const s = fillFromContact(entries, EMPTY_STATE, [], "Spouse 1 name", JUDY);
    expect(s.values).toEqual({ "Spouse 1 name": "Judy Reyes", "Spouse 1 address": "12 Grove St" });
  });

  it("adds no field the form doesn't have, and keeps a typed address when the contact has none", () => {
    const start = { ...EMPTY_STATE, values: { "Spouse 1 address": "Typed" } };
    const s = fillFromContact(entries, start, [], "Spouse 1 name", { ...JUDY, address: undefined });
    expect(s.values).toEqual({ "Spouse 1 name": "Judy Reyes", "Spouse 1 address": "Typed" });
  });

  it("is offered on typed party names, not character fields or other text", () => {
    const f = (label: string, extra: Partial<Field> = {}) => ({ label, type: "text", ...extra }) as Field;
    expect(isPartyName(f("Defendant name"))).toBe(true);
    expect(isPartyName(f("Plaintiff name(s)"))).toBe(true);
    expect(isPartyName(f("Judge name", { character: "name" }))).toBe(false);
    expect(isPartyName(f("Firm"))).toBe(false);
    expect(isPartyName(f("Defendant name", { type: "textarea" }))).toBe(false);
  });
});

/* ---------- through the App ---------- */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function must<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
}

describe("Pick from Rolodex in a form (LP-30)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    characterStore().save({ id: "alice001", name: "Alice Lawyer" });
    characterStore().setActive("alice001");
    contactStore().replaceAll([]);
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    container?.remove();
    container = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function mount(hash: string): void {
    history.replaceState(null, "", hash);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(createElement(App)));
  }

  const PICKER = '[aria-label="Pick Client name from the Rolodex"]';

  it("fills the client's name and address", () => {
    contactStore().save(JUDY);
    mount("#extra-engagement-letter");
    const picker = must<HTMLSelectElement>(PICKER);
    expect([...picker.options].map((o) => o.textContent)).toEqual(["Pick from Rolodex…", "Judy Reyes (Client)"]);
    act(() => {
      picker.value = "con00001";
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(must<HTMLInputElement>("#f-client-name").value).toBe("Judy Reyes");
    expect(must<HTMLInputElement>("#f-client-address").value).toBe("12 Grove St");
    expect(must("#preview").textContent).toContain("12 Grove St");
  });

  it("offers no picker while the Rolodex is empty", () => {
    mount("#extra-engagement-letter");
    expect(document.querySelector(PICKER)).toBeNull();
  });
});
