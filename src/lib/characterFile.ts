// The Characters dialog's Export / Import file (FR9, INV §e.1).
//
// The file is the character store's export document with each character's
// docket and J.A.P. portfolio inside it (the same shape as the sync document).
// Import restores dockets and portfolios under the id the character was stored
// with, which may differ from the id in the file when that id was unsafe.

import { characterStore, type CharacterStore } from "./characters";
import { docketStore, type DocketStore } from "./dockets";
import { portfolioStore, type PortfolioStore } from "./portfolio";

export const EXPORT_FILENAME = "lawapp-characters.json";
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const FILE_TOO_LARGE = "File is too large (max 5 MB).";

export interface Stores {
  characters: CharacterStore;
  dockets: DocketStore;
  portfolio: PortfolioStore;
}

function appStores(): Stores {
  return { characters: characterStore(), dockets: docketStore(), portfolio: portfolioStore() };
}

/** The export file's text: `{app, version, characters}` with `dockets`/`jap` per character. */
export function exportText(stores: Stores = appStores()): string {
  const doc = stores.characters.exportJson();
  const characters = doc.characters.map((c) => {
    const out: Record<string, unknown> = { ...c };
    const dockets = stores.dockets.list(c.id);
    if (dockets.length) out.dockets = dockets;
    const jap = stores.portfolio.get(c.id);
    if (jap) out.jap = jap;
    return out;
  });
  return JSON.stringify({ ...doc, characters }, null, 2);
}

/** Throws FILE_TOO_LARGE before the file is read. */
export function checkFileSize(bytes: number): void {
  if (bytes > MAX_IMPORT_BYTES) throw new Error(FILE_TOO_LARGE);
}

/** Import characters (overwriting by id) and restore their dockets and J.A.P. Returns the count. */
export function importText(text: string, stores: Stores = appStores()): number {
  const result = stores.characters.importJson(text);
  for (const { source, character } of result.saved) {
    if (Array.isArray(source.dockets)) stores.dockets.replace(character.id, source.dockets);
    if (source.jap && typeof source.jap === "object") stores.portfolio.replace(character.id, source.jap);
  }
  return result.count;
}

/** "Imported 1 character." / "Imported <n> characters." */
export function importedMessage(n: number): string {
  return "Imported " + n + " character" + (n === 1 ? "" : "s") + ".";
}
