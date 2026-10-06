// R1: debounced draft writer with a synchronous, reusable flush.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDraftWriter } from "@/lib/draftWriter";
import type { FormState } from "@/lib/formState";

const st = (v: string): FormState => ({ values: { v }, autofilled: {}, derived: {} });

describe("createDraftWriter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes once with the latest state after the delay", () => {
    const write = vi.fn();
    const w = createDraftWriter(write);
    w.schedule(st("a"));
    vi.advanceTimersByTime(200);
    w.schedule(st("b"));
    vi.advanceTimersByTime(299);
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(st("b"));
    vi.advanceTimersByTime(1000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("flush at 50 ms writes immediately and the timer doesn't write again", () => {
    const write = vi.fn();
    const w = createDraftWriter(write);
    w.schedule(st("a"));
    vi.advanceTimersByTime(50);
    w.flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(st("a"));
    vi.advanceTimersByTime(1000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("flush with nothing pending writes nothing", () => {
    const write = vi.fn();
    const w = createDraftWriter(write);
    w.flush();
    w.schedule(st("a"));
    w.flush();
    w.flush();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("stays usable after a flush (StrictMode remount)", () => {
    const write = vi.fn();
    const w = createDraftWriter(write, 100);
    w.schedule(st("a"));
    w.flush();
    w.schedule(st("b"));
    vi.advanceTimersByTime(100);
    expect(write.mock.calls.map((c) => c[0])).toEqual([st("a"), st("b")]);
  });

  it("cancel drops the pending state", () => {
    const write = vi.fn();
    const w = createDraftWriter(write);
    w.schedule(st("a"));
    w.cancel();
    vi.advanceTimersByTime(1000);
    w.flush();
    expect(write).not.toHaveBeenCalled();
  });

  it("writes through the writer's own callback (form id captured at creation)", () => {
    const store = new Map<string, FormState>();
    const writerFor = (id: string) => createDraftWriter((s) => store.set("lawapp_draft_" + id, s));
    const a = writerFor("criminal-arraignment");
    a.schedule(st("A"));
    const b = writerFor("civil-complaint");
    a.flush(); // unmount of the arraignment view within the debounce window
    expect(store.get("lawapp_draft_criminal-arraignment")).toEqual(st("A"));
    expect(store.has("lawapp_draft_civil-complaint")).toBe(false);
    b.flush();
    expect(store.has("lawapp_draft_civil-complaint")).toBe(false);
  });
});
