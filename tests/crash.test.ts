// @vitest-environment jsdom
// The crash screen's data (LP-88): error details that never carry a sync code or
// form text, and a backup that leaves the sync code out.
import { afterEach, describe, expect, it } from "vitest";
import { crashBackup, errorDetails, redact } from "@/lib/crash";
import { memoryKV } from "@/lib/storage";

const CODE = "JSA-ABCD-EFGH-JKLM-NPQR-STUV";

describe("redact", () => {
  it("blanks out sync codes and quoted text", () => {
    expect(redact(`Bad value "Ann Lee" for ${CODE}`)).toBe('Bad value "…" for [sync code]');
    expect(redact(`can't read 'name' of ${CODE.toLowerCase()}`)).toBe("can't read '…' of [sync code]");
  });

  it("leaves ordinary messages alone", () => {
    expect(redact("Cannot read properties of undefined")).toBe("Cannot read properties of undefined");
  });
});

describe("errorDetails", () => {
  const error = new TypeError(`Unexpected "Secret plaintiff text" near ${CODE}`);
  error.stack = [
    `TypeError: Unexpected "Secret plaintiff text" near ${CODE}`,
    "    at FormView (http://localhost:3000/_next/static/chunks/app.js:10:20)",
    "    at renderWithHooks (http://localhost:3000/_next/static/chunks/react.js:1:2)",
  ].join("\n");
  const text = errorDetails({
    error,
    componentStack: "\n    at FormView (app.js:1:1)\n    at ErrorBoundary (app.js:2:2)",
    where: "this form",
    userAgent: "TestBrowser/1.0",
    now: new Date("2026-10-19T12:00:00Z"),
  });

  it("says where and when it broke, the browser and the error", () => {
    expect(text).toContain("Where: this form");
    expect(text).toContain("When: 2026-10-19T12:00:00.000Z");
    expect(text).toContain("Browser: TestBrowser/1.0");
    expect(text).toContain('Error: TypeError: Unexpected "…" near [sync code]');
  });

  it("keeps code locations from both stacks, but not the message line", () => {
    expect(text).toContain("at FormView (http://localhost:3000/_next/static/chunks/app.js:10:20)");
    expect(text).toContain("at ErrorBoundary (app.js:2:2)");
    expect(text.match(/Unexpected/g)).toHaveLength(1);
  });

  it("never includes the sync code or the form text", () => {
    expect(text).not.toContain(CODE);
    expect(text).not.toContain("Secret plaintiff text");
  });

  it("copes with something thrown that isn't an Error", () => {
    expect(errorDetails({ error: `oops ${CODE}`, where: "the app" })).toContain("Error: string: oops [sync code]");
  });

  it("cuts a very long message short", () => {
    const long = errorDetails({ error: new Error("x".repeat(1000)), where: "the app" });
    expect(long).toContain("x".repeat(300) + "…");
    expect(long).not.toContain("x".repeat(301));
  });
});

describe("crashBackup", () => {
  afterEach(() => localStorage.clear());

  it("is the full backup (LP-1), without the sync code", () => {
    const kv = memoryKV();
    kv.set("lawapp_chars", "[]");
    kv.set("lawapp_sync_code", CODE);
    const { text, filename } = crashBackup(kv, new Date("2026-10-19T12:00:00Z"));
    expect(filename).toBe("lawapp-backup-2026-10-19.json");
    const doc = JSON.parse(text);
    expect(doc.kind).toBe("backup");
    expect(doc.data).toEqual({ lawapp_chars: "[]" });
    expect(text).not.toContain(CODE);
  });

  it("falls back to reading localStorage when storage can't be listed", () => {
    localStorage.setItem("lawapp_chars", '[{"id":"abcd1234","name":"Ann"}]');
    localStorage.setItem("lawapp_sync_code", CODE);
    localStorage.setItem("other_app", "x");
    const unlisted = { get: () => null, set: () => {}, remove: () => {} };
    const doc = JSON.parse(crashBackup(unlisted).text);
    expect(doc.kind).toBe("backup");
    expect(doc.data).toEqual({ lawapp_chars: '[{"id":"abcd1234","name":"Ann"}]' });
  });
});
