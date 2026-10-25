// The import rules in eslint.config.mjs (LP-121): a program is reached only through its index,
// relative imports never climb out of a program, and src/lib and src/ui never depend on the
// shell or a program. Linted as text at real paths, since the rules go by file location.
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint();

async function blocked(file: string, code: string): Promise<boolean> {
  const [result] = await eslint.lintText(code + "\nexport {};\n", { filePath: file });
  return result.messages.some((m) => m.ruleId === "no-restricted-imports");
}

// The first lint loads the whole ESLint config, which takes seconds while the rest of the suite runs.
describe("import rules (LP-121)", { timeout: 30_000 }, () => {
  it("lets the shell and other programs use a program's index, never its internals", async () => {
    expect(await blocked("src/shell/x.ts", 'import "@/programs/cases";')).toBe(false);
    expect(await blocked("src/shell/x.ts", 'import "@/programs/cases/CaseFileView";')).toBe(true);
    expect(await blocked("src/programs/filings/x.ts", 'import "@/programs/library";')).toBe(false);
    expect(await blocked("src/programs/filings/x.ts", 'import "@/programs/library/LawLibraryView";')).toBe(true);
  });

  it("keeps a program's relative imports inside it, from a subfolder too", async () => {
    expect(await blocked("src/programs/filings/x.ts", 'import "./FormView";')).toBe(false);
    expect(await blocked("src/programs/filings/x.ts", 'import "../library/LawLibraryView";')).toBe(true);
    expect(await blocked("src/programs/filings/fields/x.ts", 'import "../FormView";')).toBe(false);
    expect(await blocked("src/programs/filings/fields/x.ts", 'import "../../library/Marked";')).toBe(true);
    expect(await blocked("src/programs/filings/x.ts", 'import "@/ui/Dialog";')).toBe(false);
  });

  it("keeps src/lib and src/ui free of the shell and the programs", async () => {
    expect(await blocked("src/lib/x.ts", 'import "@/shell/useRoute";')).toBe(true);
    expect(await blocked("src/ui/x.ts", 'import "@/programs/cases";')).toBe(true);
    expect(await blocked("src/ui/x.ts", 'import "@/lib/cases";')).toBe(false);
  });
});
