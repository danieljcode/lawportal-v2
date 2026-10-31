// @vitest-environment jsdom
// Download .docx in the browser (LP-37): a real Word file, named after the form, with no server.
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveDocx } from "@/lib/docx/saveDocx";
import { escapeHtml } from "@/lib/template";
import { readZipText } from "./zip";

afterEach(() => vi.restoreAllMocks());

describe("saveDocx", () => {
  it("builds the .docx here and downloads it under the form's name", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    let blob: Blob | null = null;
    URL.createObjectURL = vi.fn((b: Blob) => ((blob = b), "blob:docx"));
    URL.revokeObjectURL = vi.fn();
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });

    await saveDocx(escapeHtml("Ann <Lee>"), "General Motion", "extra-general-motion");

    expect(names).toEqual(["extra-general-motion.docx"]);
    expect(blob!.type).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const xml = readZipText(Buffer.from(await blob!.arrayBuffer()), "word/document.xml");
    expect(xml).toContain("Ann &lt;Lee&gt;");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
