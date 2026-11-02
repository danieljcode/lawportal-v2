// @vitest-environment jsdom
// Client onboarding (LP-172): the conflict check on the intake and when it goes out
// of date, the review tick, the Rolodex choice, the next steps after a case opens,
// and an unfinished intake surviving a refresh.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { caseStore } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { contactsForCase, contactStore, type Contact } from "@/lib/contacts";
import {
  checkState,
  cleanIntakeDraft,
  emptyIntake,
  ROLODEX_NEW,
  rolodexDefault,
  rolodexMatches,
  type Intake,
} from "@/lib/intake";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function must<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
}

async function mount(hash = "#clients/intake"): Promise<void> {
  history.replaceState(null, "", hash);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(App));
    await vi.dynamicImportSettled();
  });
}

function unmount(): void {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
}

function setValue(sel: string, value: string): void {
  const el = must<HTMLInputElement>(sel);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

const click = (sel: string) => act(() => must(sel).click());
const submit = () =>
  act(() => {
    must("#intake-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
const fill = () => {
  setValue("#intake-clientName", "Cy Ng");
  setValue("#intake-summary", "Unpaid invoice.");
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T16:00:00Z"));
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(sync, "init").mockResolvedValue(undefined);
  characterStore().save({ id: "alice001", name: "Alice Lawyer", title: "Attorney at Law" });
  characterStore().setActive("alice001");
});

afterEach(() => {
  unmount();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the check's state", () => {
  const i = (over: Partial<Intake>): Intake => ({ ...emptyIntake(), clientName: "Cy Ng", ...over });
  const match = { caseId: "c1", caseNumber: "90", side: "plaintiff", status: "Open", searched: "", matched: "" };

  it("is unchecked, clear, for review or reviewed, and out of date when a name changes", () => {
    expect(checkState(i({}), null)).toBe("unchecked");
    const clear = { names: ["Cy Ng"], matches: [] };
    expect(checkState(i({}), clear)).toBe("clear");
    expect(checkState(i({ clientName: "CY  NG." }), clear)).toBe("clear");
    expect(checkState(i({ clientName: "Cy Long" }), clear)).toBe("stale");
    expect(checkState(i({ opposingParty: "Ann" }), clear)).toBe("stale");
    const found = { names: ["Cy Ng"], matches: [match] } as never;
    expect(checkState(i({}), found)).toBe("review");
    expect(checkState(i({}), { ...(found as object), reviewed: true } as never)).toBe("reviewed");
  });
});

describe("the Rolodex default", () => {
  const client = (id: string, name: string): Contact => ({ id, name, type: "client" }) as Contact;
  const list = [
    client("c1", "Cy Ng"),
    client("c2", "Ann Lee"),
    { ...client("w1", "Bo Day"), type: "witness" } as Contact,
  ];

  it("is the client with this name, a choice for a maybe, and a new contact otherwise", () => {
    expect(rolodexDefault("cy ng", list)).toBe("c1");
    expect(rolodexDefault("Ann", list)).toBe("");
    expect(rolodexDefault("Zed Quill", list)).toBe(ROLODEX_NEW);
    expect(rolodexDefault("Bo Day", list)).toBe(ROLODEX_NEW);
    expect(rolodexMatches("", list)).toEqual([]);
  });
});

describe("a saved draft", () => {
  it("takes known text fields, and nothing else", () => {
    const d = cleanIntakeDraft(
      { intake: { clientName: "Cy", side: "sideways", lead: 3, x: "y" }, rolodex: "new" },
      "al",
    );
    expect(d?.intake).toEqual({ ...emptyIntake("al"), clientName: "Cy" });
    expect(d?.check).toBeNull();
    expect(d?.rolodex).toBe("new");
    expect(cleanIntakeDraft("junk")).toBeNull();
    expect(cleanIntakeDraft({})).toBeNull();
  });
});

describe("onboarding a client (LP-172)", () => {
  it("shows the check on the intake, and marks it out of date when a name changes", async () => {
    await mount();
    expect(must("#intake-check-state").textContent).toBe("Not checked yet.");
    setValue("#intake-clientName", "Cy Ng");
    click("#intake-conflicts");
    expect(must("#intake-conflict-verdict").textContent).toBe("No conflicts found");
    setValue("#intake-opposingParty", "Ann Lee");
    expect(must("#intake-check-state").textContent).toContain("Out of date");
    expect(document.querySelector("#intake-conflict-verdict")).toBeNull();
    click("#intake-conflicts");
    expect(must("#intake-conflict-verdict").textContent).toBe("No conflicts found");
  });

  it("needs possible matches reviewed before opening, without refusing them", async () => {
    caseStore().save({ id: "case0001", caseNumber: "90SCCR00147", plaintiff: "Ann Lee", lead: "alice001" });
    await mount();
    fill();
    setValue("#intake-opposingParty", "Ann Lee");
    click("#intake-conflicts");
    submit();
    expect(must("#intake-error").textContent).toContain("Review the possible conflict");
    expect(caseStore().list()).toHaveLength(1);
    click("#intake-reviewed");
    submit();
    expect(caseStore().list()).toHaveLength(2);
    expect(must("#intake-opened")).toBeTruthy();
  });

  it("adds a new client to the Rolodex and links them to the case", async () => {
    await mount();
    fill();
    setValue("#intake-phone", "555-0100");
    submit();
    const c = caseStore().list()[0];
    const [link] = contactsForCase(contactStore().list(), c.id);
    expect(link.contact).toMatchObject({ name: "Cy Ng", type: "client", phone: "555-0100" });
    expect(link.role).toBe("client");
  });

  it("picks the client with this name rather than adding them again", async () => {
    const existing = contactStore().save({ name: "Cy Ng", type: "client" });
    await mount();
    fill();
    expect(must<HTMLSelectElement>("#intake-rolodex").value).toBe(existing.id);
    submit();
    expect(contactStore().list()).toHaveLength(1);
    expect(contactsForCase(contactStore().list(), caseStore().list()[0].id)[0].contact.id).toBe(existing.id);
  });

  it("asks when someone only might be the client, and can leave the Rolodex out", async () => {
    contactStore().save({ name: "Cy Ng", type: "client" });
    await mount();
    setValue("#intake-clientName", "Cy");
    setValue("#intake-summary", "Unpaid invoice.");
    expect(must("#intake-rolodex-hint").textContent).toContain("Cy Ng");
    submit();
    expect(must("#intake-error").textContent).toContain("Choose who the client is");
    expect(caseStore().list()).toEqual([]);
    setValue("#intake-rolodex", "none");
    submit();
    expect(caseStore().list()).toHaveLength(1);
    expect(contactStore().list()).toHaveLength(1);
    expect(document.querySelector("#intake-retainer")).toBeNull();
  });

  it("offers the letter, filled in, and the client's retainer, without claiming anything was sent", async () => {
    await mount();
    fill();
    setValue("#intake-address", "1 Main St");
    setValue("#intake-matter", "Civil");
    submit();
    const contact = contactStore().list()[0];
    expect(must("#intake-retainer").getAttribute("href")).toBe("#ledger/retainers/" + contact.id);
    expect(must("#intake").textContent).toContain("nothing has been sent or signed");
    await act(async () => {
      must("#intake-letter").click();
      await vi.dynamicImportSettled();
    });
    expect(location.hash).toBe("#filings/extra-engagement-letter");
    expect(must<HTMLInputElement>("#f-client-name").value).toBe("Cy Ng");
    expect(must<HTMLInputElement>("#f-client-address").value).toBe("1 Main St");
    expect(must<HTMLInputElement>("#f-matter").value).toBe("Civil");
    expect(must<HTMLInputElement>("#f-case-number").value).toBe("PENDING-1");
  });

  it("opens the client's retainer from its link", async () => {
    const contact = contactStore().save({ name: "Cy Ng", type: "client" });
    await mount("#ledger/retainers/" + contact.id);
    expect(location.hash).toBe("#ledger/retainers/" + contact.id);
    expect(must("#retainers").textContent).toContain("Cy Ng");
    expect(document.querySelector("#retainers [id^='retainer-deposit'], #retainers form")).toBeTruthy();
  });

  it("keeps an unfinished intake and its check across a refresh, until it's discarded", async () => {
    await mount();
    fill();
    click("#intake-conflicts");
    unmount();
    await mount();
    expect(must<HTMLInputElement>("#intake-clientName").value).toBe("Cy Ng");
    expect(must("#intake-conflict-verdict").textContent).toBe("No conflicts found");

    vi.stubGlobal("confirm", () => false);
    click("#intake-clear");
    expect(must<HTMLInputElement>("#intake-clientName").value).toBe("Cy Ng");
    vi.stubGlobal("confirm", () => true);
    click("#intake-clear");
    expect(must<HTMLInputElement>("#intake-clientName").value).toBe("");
    unmount();
    await mount();
    expect(must<HTMLInputElement>("#intake-clientName").value).toBe("");
  });

  it("clears the draft once the case opens, so a refresh can't open it again", async () => {
    await mount();
    fill();
    submit();
    unmount();
    await mount();
    expect(must<HTMLInputElement>("#intake-clientName").value).toBe("");
    expect(caseStore().list()).toHaveLength(1);
  });
});
