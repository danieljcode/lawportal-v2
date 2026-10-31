// useSyncExternalStore hooks over the client stores (design D6).
//
// Each hook returns a version snapshot; components re-read the store when it
// changes. The subscribe/snapshot functions are module-level so React never
// re-subscribes on render, and the stores are created lazily on first use.

import { useSyncExternalStore } from "react";
import { caseStore } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { conflictLog } from "@/lib/conflicts";
import { contactStore } from "@/lib/contacts";
import { timeStore } from "@/lib/ledger";
import { precedentStore } from "@/lib/precedents";
import { filingStore } from "@/lib/filings";
import { docketStore } from "@/lib/dockets";
import { letterheadStore } from "@/lib/letterhead";
import { portfolioStore } from "@/lib/portfolio";
import { saveFailedVersion, setAsideVersion, subscribeSaveFailed, subscribeSetAside } from "@/lib/storage";
import * as sync from "@/lib/sync";

function subscribeCharacters(fn: () => void): () => void {
  const s = characterStore();
  const offData = s.subscribe(fn);
  const offActive = s.subscribeActive(fn);
  return () => {
    offData();
    offActive();
  };
}
function characterSnapshot(): string {
  const s = characterStore();
  return s.version() + ":" + s.activeVersion();
}

/** Changes on character data mutations and on active-character changes. */
export function useCharacterVersion(): string {
  return useSyncExternalStore(subscribeCharacters, characterSnapshot, characterSnapshot);
}

/** The version hook for a store made on first use; its functions are made once, so React never re-subscribes. */
function versionHook(store: () => { subscribe(fn: () => void): () => void; version(): number }): () => number {
  const subscribe = (fn: () => void) => store().subscribe(fn);
  const snapshot = () => store().version();
  return function useVersion() {
    return useSyncExternalStore(subscribe, snapshot, snapshot);
  };
}

/** The docket view of the case store: bumps with it. */
export const useDocketVersion = versionHook(docketStore);
/** Bumps on every change to the firm's cases (LP-101). */
export const useCaseVersion = versionHook(caseStore);
/** Bumps on every change to the filing history (LP-15). */
export const useFilingVersion = versionHook(filingStore);
/** Bumps on every change to the conflict check log (LP-10). */
export const useConflictLogVersion = versionHook(conflictLog);
export const usePortfolioVersion = versionHook(portfolioStore);
/** Bumps on every change to the Law Library's precedents (LP-16). */
export const usePrecedentVersion = versionHook(precedentStore);
/** Bumps when the letterhead is edited in Settings (LP-23). */
export const useLetterheadVersion = versionHook(letterheadStore);
/** Bumps on every change to the Rolodex (LP-30). */
export const useContactVersion = versionHook(contactStore);
/** Bumps on every change to the Ledger's time entries (LP-32). */
export const useTimeVersion = versionHook(timeStore);

/** Counts values set aside as unreadable since the page loaded (0: none). */
export function useSetAsideVersion(): number {
  return useSyncExternalStore(subscribeSetAside, setAsideVersion, setAsideVersion);
}

/** Counts saves that failed after the change was shown (IndexedDB, LP-36; 0: none). */
export function useSaveFailedVersion(): number {
  return useSyncExternalStore(subscribeSaveFailed, saveFailedVersion, saveFailedVersion);
}

const subscribeSync = (fn: () => void) => sync.onChange(() => fn());

/** The sync client's state (a new object on every change). */
export function useSyncState(): sync.SyncState {
  return useSyncExternalStore(subscribeSync, sync.getState, sync.getState);
}
