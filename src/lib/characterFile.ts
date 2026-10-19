// The Characters dialog's Export / Import file (FR9, INV §e.1).
//
// The file is the characters export document (src/lib/services/characters.ts,
// LP-3): the character store's export with each character's docket and J.A.P.
// portfolio inside it, the same shape as the sync document. This module adds
// only what's about the file: its name, size limit and messages.

import { exportCharacters, importCharacters, type CharacterStores } from "./services/characters";

export const EXPORT_FILENAME = "lawapp-characters.json";
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const FILE_TOO_LARGE = "File is too large (max 5 MB).";

/** The three stores the file covers. */
export type Stores = CharacterStores;

/** The export file's text: `{app, version, characters}` with `dockets`/`jap` per character. */
export function exportText(stores?: Stores): string {
  return JSON.stringify(exportCharacters(stores), null, 2);
}

/** Throws FILE_TOO_LARGE before the file is read. */
export function checkFileSize(bytes: number): void {
  if (bytes > MAX_IMPORT_BYTES) throw new Error(FILE_TOO_LARGE);
}

/** Import characters (overwriting by id) and restore their dockets and J.A.P. Returns the count. */
export function importText(text: string, stores?: Stores): number {
  return importCharacters(text, stores);
}

/** "Imported 1 character." / "Imported <n> characters." */
export function importedMessage(n: number): string {
  return "Imported " + n + " character" + (n === 1 ? "" : "s") + ".";
}
