// @vitest-environment jsdom
// The Rolodex page (LP-30): add, find, edit and delete a contact.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { contactStore } from "@/lib/contacts";
import RolodexView from "@/programs/clients/RolodexView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const $ = (sel: string) => container.querySelector<HTMLElement>(sel);
function must<T extends HTMLElement = HTMLElement>(sel: string): T {
  const el = container.querySelector<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
}

function setValue(sel: string, value: string): void {
  const el = must<HTMLInputElement>(sel);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

const click = (el: HTMLElement) => act(() => el.click());
const cards = () => [...container.querySelectorAll(".contact-card strong")].map((s) => s.textContent);
const button = (card: number, text: string) =>
  [...container.querySelectorAll<HTMLButtonElement>(".contact-card")[card].querySelectorAll("button")].find(
    (b) => b.textContent === text,
  )!;

beforeEach(() => {
  localStorage.clear();
  contactStore().replaceAll([]);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(createElement(RolodexView)));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("the Rolodex page (LP-30)", () => {
  it("adds a contact, finds it, edits it and deletes it", () => {
    expect($("#rolodex-empty")).not.toBeNull();
    click(must("#contact-new"));
    click(must("#contact-save"));
    expect(must("#contact-error").textContent).toMatch(/name/);

    setValue("#contact-name", "Judy Bench");
    setValue("#contact-type", "judge");
    setValue("#contact-phone", "555-0100");
    click(must("#contact-save"));
    expect($("#contact-form")).toBeNull();
    expect(cards()).toEqual(["Judy Bench"]);
    expect(contactStore().list()[0]).toMatchObject({ name: "Judy Bench", type: "judge", phone: "555-0100" });

    click(must("#contact-new"));
    setValue("#contact-name", "Bob Badge");
    setValue("#contact-type", "officer");
    click(must("#contact-save"));
    expect(must("#rolodex-count").textContent).toBe("2 contacts");

    setValue("#rolodex-q", "judy");
    expect(cards()).toEqual(["Judy Bench"]);
    expect(must(".contact-card mark").textContent).toBe("Judy");
    setValue("#rolodex-q", "");
    setValue("#rolodex-type", "officer");
    expect(cards()).toEqual(["Bob Badge"]);
    setValue("#rolodex-type", "");

    click(button(1, "Edit"));
    expect(must<HTMLInputElement>("#contact-name").value).toBe("Judy Bench");
    setValue("#contact-name", "Judy Bench-Smith");
    click(must("#contact-save"));
    expect(cards()).toEqual(["Bob Badge", "Judy Bench-Smith"]);

    vi.spyOn(window, "confirm").mockReturnValue(true);
    click(button(0, "Delete"));
    expect(cards()).toEqual(["Judy Bench-Smith"]);
  });
});
