// @vitest-environment jsdom
// A case's contacts from the Rolodex (LP-30): link one in a role, see it listed, unlink it.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { cleanCase } from "@/lib/cases";
import { contactStore } from "@/lib/contacts";
import CaseContacts from "@/programs/cases/CaseContacts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CASE = cleanCase({ id: "case0001", caseNumber: "90SCCR00147", plaintiff: "People", defendant: "Doe" });

let container: HTMLDivElement;
let root: Root;

const $ = (sel: string) => container.querySelector<HTMLElement>(sel);
function setValue(sel: string, value: string): void {
  const el = container.querySelector<HTMLSelectElement>(sel)!;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
const listed = () => [...container.querySelectorAll(".case-contact strong")].map((s) => s.textContent);

function mount(): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(createElement(CaseContacts, { c: CASE })));
}

beforeEach(() => {
  localStorage.clear();
  contactStore().replaceAll([]);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("a case's contacts (LP-30)", () => {
  it("points to the Rolodex when it's empty", () => {
    mount();
    expect($("#case-contacts-empty a")?.getAttribute("href")).toBe("#clients/rolodex");
  });

  it("links a contact in a role, lists it, and unlinks it", () => {
    const judy = contactStore().save({ name: "Judy Bench", type: "judge", phone: "555-0100" });
    contactStore().save({ name: "Bob Badge", type: "officer" });
    mount();
    act(() => $("#case-contact-link")!.click());
    expect($("#case-contact-error")?.textContent).toMatch(/Pick a contact/);

    setValue("#case-contact-pick", judy.id);
    setValue("#case-contact-role", "judge");
    act(() => $("#case-contact-link")!.click());
    expect(listed()).toEqual(["Judy Bench"]);
    expect($(".case-contact .muted")?.textContent).toBe("Judge · Judge · 555-0100");
    expect(contactStore().get(judy.id)?.cases).toEqual([{ id: "case0001", role: "judge" }]);
    // A linked contact isn't offered again.
    expect([...container.querySelectorAll("#case-contact-pick option")].map((o) => o.textContent)).toEqual([
      "Pick a contact…",
      "Bob Badge (Officer)",
    ]);

    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Unlink Judy Bench"]')!.click());
    expect(listed()).toEqual([]);
    expect(contactStore().get(judy.id)).not.toHaveProperty("cases");
  });
});
