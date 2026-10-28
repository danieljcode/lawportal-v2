// Work spanning the character, docket and J.A.P. stores (LP-3).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCharacterStore } from "@/lib/characters";
import { createDocketStore } from "@/lib/dockets";
import { createPortfolioStore } from "@/lib/portfolio";
import {
  deleteCharacter,
  duplicateCharacter,
  exportCharacters,
  importCharacters,
  type CharacterStores,
} from "@/lib/services/characters";
import { memoryKV, type KV } from "@/lib/storage";

function stores(): CharacterStores & { kv: KV } {
  const kv = memoryKV();
  return {
    kv,
    characters: createCharacterStore(kv),
    dockets: createDocketStore(kv),
    portfolio: createPortfolioStore(kv),
  };
}

describe("deleteCharacter", () => {
  it("removes the character, its docket and its J.A.P., and clears it as active", () => {
    const s = stores();
    const a = s.characters.save({ name: "Ann Lee" });
    const b = s.characters.save({ name: "Bo Day" });
    s.dockets.save(a.id, { caseNumber: "90SCCR00001" });
    s.portfolio.save(a.id, { level: "I" });
    s.dockets.save(b.id, { caseNumber: "90SCCC00002" });
    s.characters.setActive(a.id);

    deleteCharacter(a.id, s);
    expect(s.characters.get(a.id)).toBeNull();
    expect(s.characters.activeId()).toBeNull();
    expect(s.dockets.list(a.id)).toEqual([]);
    expect(s.portfolio.get(a.id)).toBeNull();
    expect(s.kv.keys!().filter((k) => k.includes(a.id))).toEqual([]);
    // Other characters keep theirs.
    expect(s.dockets.list(b.id).map((d) => d.caseNumber)).toEqual(["90SCCC00002"]);
  });

  it("does nothing for an id that isn't there", () => {
    const s = stores();
    const a = s.characters.save({ name: "Ann Lee" });
    expect(() => deleteCharacter("missing1", s)).not.toThrow();
    expect(s.characters.list().map((c) => c.id)).toEqual([a.id]);
  });
});

describe("duplicateCharacter", () => {
  it("copies the character only; the docket and J.A.P. stay with the original", () => {
    const s = stores();
    const a = s.characters.save({ name: "Ann Lee" });
    s.dockets.save(a.id, { caseNumber: "90SCCR00001" });
    const copy = duplicateCharacter(a.id, s)!;
    expect(copy.name).toBe("Ann Lee (copy)");
    expect(s.dockets.list(copy.id)).toEqual([]);
    expect(s.dockets.list(a.id)).toHaveLength(1);
    expect(duplicateCharacter("missing1", s)).toBeNull();
  });
});

describe("exportCharacters and importCharacters", () => {
  it("round-trip characters with their dockets and J.A.P.", () => {
    const from = stores();
    const a = from.characters.save({ name: "Ann Lee", title: "Judge" });
    from.dockets.save(a.id, { caseNumber: "90SCCR00001", plaintiff: "People" });
    from.portfolio.save(a.id, { level: "II" });
    const text = JSON.stringify(exportCharacters(from));

    const to = stores();
    expect(importCharacters(text, to)).toBe(1);
    expect(to.characters.get(a.id)).toMatchObject({ name: "Ann Lee", title: "Judge" });
    expect(to.dockets.list(a.id)).toMatchObject([{ caseNumber: "90SCCR00001", plaintiff: "People" }]);
    expect(to.portfolio.get(a.id)?.level).toBe("II");
  });

  it("restores dockets under the new id when the file's id was unsafe", () => {
    const to = stores();
    const text = JSON.stringify({
      characters: [{ id: "BAD ID!", name: "Ann", dockets: [{ caseNumber: "90SCCR00009" }] }],
    });
    expect(importCharacters(text, to)).toBe(1);
    const [c] = to.characters.list();
    expect(c.id).not.toBe("BAD ID!");
    expect(to.dockets.list(c.id).map((d) => d.caseNumber)).toEqual(["90SCCR00009"]);
  });
});

describe("store independence", () => {
  it("the character store no longer imports the docket or J.A.P. store", () => {
    const source = readFileSync(path.resolve(process.cwd(), "src/lib/characters.ts"), "utf8");
    expect(source).not.toMatch(/from "\.\/(dockets|portfolio)"/);
  });
});
