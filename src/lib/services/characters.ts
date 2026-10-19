// Work on a character that touches more than one store (LP-3): deleting it
// with its docket and J.A.P., duplicating it, and the characters export and
// import. Each store (characters.ts, dockets.ts, portfolio.ts) only knows its
// own data; anything spanning them goes through here.

import { characterStore, type CharacterStore } from "../characters";
import { docketStore, type DocketStore } from "../dockets";
import { portfolioStore, type PortfolioStore } from "../portfolio";
import type { Character } from "../types";

export interface CharacterStores {
  characters: CharacterStore;
  dockets: DocketStore;
  portfolio: PortfolioStore;
}

/** The app's three stores (created on first use; client only). */
export function appStores(): CharacterStores {
  return { characters: characterStore(), dockets: docketStore(), portfolio: portfolioStore() };
}

/** Delete a character with its docket and J.A.P. (and clear it as the active character). */
export function deleteCharacter(id: string, stores: CharacterStores = appStores()): void {
  stores.characters.remove(id);
  stores.dockets.removeAll(id);
  stores.portfolio.remove(id);
}

/** Copy a character as "<name> (copy)"; its docket and J.A.P. stay with the original. Null for an unknown id. */
export function duplicateCharacter(id: string, stores: CharacterStores = appStores()): Character | null {
  return stores.characters.duplicate(id);
}

/** The characters export document: `{app, version, characters}`, each with its `dockets` and `jap`. */
export function exportCharacters(stores: CharacterStores = appStores()): Record<string, unknown> {
  const doc = stores.characters.exportJson();
  const characters = doc.characters.map((c) => {
    const out: Record<string, unknown> = { ...c };
    const dockets = stores.dockets.list(c.id);
    if (dockets.length) out.dockets = dockets;
    const jap = stores.portfolio.get(c.id);
    if (jap) out.jap = jap;
    return out;
  });
  return { ...doc, characters };
}

/**
 * Import characters (overwriting by id) and restore their dockets and J.A.P.
 * under the id each character was stored with, which can differ from the id
 * in the file when that id was unsafe. Returns how many were imported.
 */
export function importCharacters(text: string, stores: CharacterStores = appStores()): number {
  const result = stores.characters.importJson(text);
  for (const { source, character } of result.saved) {
    if (Array.isArray(source.dockets)) stores.dockets.replace(character.id, source.dockets);
    if (source.jap && typeof source.jap === "object") stores.portfolio.replace(character.id, source.jap);
  }
  return result.count;
}
