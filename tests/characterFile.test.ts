// Characters dialog Export / Import file (FR9, AC 12): the export carries each
// character's docket and J.A.P.; importing it restores all three.
import { describe, expect, it } from "vitest";
import {
  checkFileSize,
  exportText,
  FILE_TOO_LARGE,
  importedMessage,
  importText,
  MAX_IMPORT_BYTES,
  type Stores,
} from "@/lib/characterFile";
import { createCharacterStore } from "@/lib/characters";
import { createDocketStore } from "@/lib/dockets";
import { createPortfolioStore } from "@/lib/portfolio";
import { memoryKV } from "@/lib/storage";

function stores(): Stores {
  const kv = memoryKV();
  return { characters: createCharacterStore(kv), dockets: createDocketStore(kv), portfolio: createPortfolioStore(kv) };
}

describe("character file", () => {
  it("round-trips two characters with their dockets and J.A.P.", () => {
    const a = stores();
    const judge = a.characters.save({ name: "Jane Roe", title: "Court Commissioner II" });
    const lawyer = a.characters.save({ name: "John Doe", title: "Attorney at Law" });
    a.dockets.save(lawyer.id, { caseNumber: "26GJCC00147", plaintiff: "Ann", defendant: "Bob" });
    a.portfolio.save(judge.id, { level: "II", II: { "2.1": [{ num: "AW-00001", link: "https://example.com/w" }] } });

    const text = exportText(a);
    const doc = JSON.parse(text);
    expect(doc.app).toBe("jsa-form-generator");
    expect(doc.version).toBe(1);
    expect(doc.characters).toHaveLength(2);
    expect(doc.characters[1].dockets[0].caseNumber).toBe("26GJCC00147");
    expect(doc.characters[0].jap.II["2.1"][0].num).toBe("AW-00001");

    const b = stores();
    const n = importText(text, b);
    expect(n).toBe(2);
    expect(importedMessage(n)).toBe("Imported 2 characters.");
    expect(b.characters.list().map((c) => c.name)).toEqual(["Jane Roe", "John Doe"]);
    expect(b.dockets.list(lawyer.id).map((d) => d.caseNumber)).toEqual(["26GJCC00147"]);
    expect(b.portfolio.get(judge.id)?.level).toBe("II");
    expect(b.portfolio.get(judge.id)?.II["2.1"]).toEqual([{ num: "AW-00001", link: "https://example.com/w" }]);
  });

  it("restores dockets under the stored id when the file's id is unsafe", () => {
    const s = stores();
    const text = JSON.stringify({ characters: [{ id: "../x", name: "Odd", dockets: [{ caseNumber: "C-1" }] }] });
    expect(importText(text, s)).toBe(1);
    expect(importedMessage(1)).toBe("Imported 1 character.");
    const [c] = s.characters.list();
    expect(c.id).not.toBe("../x");
    expect(s.dockets.list(c.id).map((d) => d.caseNumber)).toEqual(["C-1"]);
  });

  it("rejects files over 5 MB and passes on the store's errors", () => {
    expect(() => checkFileSize(MAX_IMPORT_BYTES + 1)).toThrow(FILE_TOO_LARGE);
    expect(() => checkFileSize(MAX_IMPORT_BYTES)).not.toThrow();
    expect(() => importText("not json", stores())).toThrow("That file isn't valid JSON.");
    expect(() => importText("{}", stores())).toThrow("No characters found in that file.");
  });

  it("round-trips a character with server:'freestyle' through export/import", () => {
    const a = stores();
    a.characters.save({ name: "Sam Style", server: "freestyle" });
    const text = exportText(a);
    const doc = JSON.parse(text);
    expect(doc.characters[0].server).toBe("freestyle");

    const b = stores();
    importText(text, b);
    const [c] = b.characters.list();
    expect(c.name).toBe("Sam Style");
    expect(c.server).toBe("freestyle");
  });

  it("imports a character without a server field as undefined (→ gtaw at read time)", () => {
    const s = stores();
    const text = JSON.stringify({ characters: [{ id: "abc123", name: "Old Timer" }] });
    importText(text, s);
    const [c] = s.characters.list();
    expect(c.name).toBe("Old Timer");
    expect(c.server).toBeUndefined();
  });

  it("drops an invalid server value during clean()", () => {
    const s = stores();
    s.characters.save({ name: "Hacker", server: "invalid" as any });
    const [c] = s.characters.list();
    expect(c.name).toBe("Hacker");
    expect(c.server).toBeUndefined();
  });
});
