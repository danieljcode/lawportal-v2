// @vitest-environment jsdom
// FormView lifecycle (plan §R R1): the draft is flushed, never dropped, when a
// form unmounts, and switching forms quickly (AC 30) neither loses an edit nor
// leaks it into the next form's draft.
//
// criminal-arraignment has no "Case number" field, so these tests type into its
// first top-level text field, "Defendant name" (id f-defendant-name).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import FormView, { type FormViewProps } from "@/components/FormView";
import { getForm } from "@/data";
import { draftKey } from "@/lib/formState";
import { SERVERS } from "@/lib/servers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ARRAIGNMENT = "criminal-arraignment";
const COMPLAINT = "civil-complaint";
const INPUT = "#f-defendant-name";

let container: HTMLDivElement;
let root: Root;

function props(id: string): FormViewProps & { key: string } {
  const form = getForm(id);
  if (!form) throw new Error("missing form " + id);
  return { key: id, form, activeCharacter: null, highlight: true, server: SERVERS.gtaw, onOutput: () => {} };
}

function mount(id: string): void {
  act(() => root.render(createElement(FormView, props(id))));
}

/** Type into a React-controlled input: native value setter + a bubbling input event. */
function type(selector: string, value: string): void {
  const input = container.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error("no input " + selector);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function draftValues(id: string): Record<string, unknown> | null {
  const raw = localStorage.getItem(draftKey(id));
  return raw ? (JSON.parse(raw).values as Record<string, unknown>) : null;
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("FormView draft writer (R1)", () => {
  it("writes the pending draft when the form unmounts 50 ms after an edit", () => {
    mount(ARRAIGNMENT);
    type(INPUT, "A");
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(draftValues(ARRAIGNMENT)?.["Defendant name"]).toBeUndefined();
    act(() => root.render(null));
    expect(draftValues(ARRAIGNMENT)?.["Defendant name"]).toBe("A");
  });

  it("writes the draft after the 300 ms debounce while mounted", () => {
    mount(ARRAIGNMENT);
    type(INPUT, "Jane Doe");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(draftValues(ARRAIGNMENT)?.["Defendant name"]).toBe("Jane Doe");
  });

  it("flushes on pagehide", () => {
    mount(ARRAIGNMENT);
    type(INPUT, "B");
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(draftValues(ARRAIGNMENT)?.["Defendant name"]).toBe("B");
  });
});

describe("AC 30: quick form switch", () => {
  it("keeps the edit on its own form and out of the next form's draft", () => {
    mount(ARRAIGNMENT);
    type(INPUT, "A");
    act(() => {
      vi.advanceTimersByTime(50);
    });

    mount(COMPLAINT); // a different key: the arraignment view unmounts and flushes
    act(() => {
      vi.advanceTimersByTime(50);
    });
    mount(ARRAIGNMENT);

    const input = container.querySelector<HTMLInputElement>(INPUT);
    expect(input?.value).toBe("A");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const complaint = draftValues(COMPLAINT);
    if (complaint) {
      expect(complaint["Defendant name"]).not.toBe("A");
      expect(complaint["Case number"]).not.toBe("A");
      expect(JSON.stringify(complaint)).not.toContain('"A"');
    }
    expect(draftValues(ARRAIGNMENT)?.["Defendant name"]).toBe("A");
  });
});
