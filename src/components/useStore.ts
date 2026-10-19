// useSyncExternalStore hooks over the client stores (design D6).
//
// Each hook returns a version snapshot; components re-read the store when it
// changes. The subscribe/snapshot functions are module-level so React never
// re-subscribes on render, and the stores are created lazily on first use.

import { useSyncExternalStore } from "react";
import { caseStore } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { conflictLog } from "@/lib/conflicts";
import { filingStore } from "@/lib/filings";
import { docketStore } from "@/lib/dockets";
import { portfolioStore } from "@/lib/portfolio";
import { setAsideVersion, subscribeSetAside } from "@/lib/storage";
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

const subscribeDockets = (fn: () => void) => docketStore().subscribe(fn);
const docketSnapshot = () => docketStore().version();

export function useDocketVersion(): number {
  return useSyncExternalStore(subscribeDockets, docketSnapshot, docketSnapshot);
}

const subscribeCases = (fn: () => void) => caseStore().subscribe(fn);
const caseSnapshot = () => caseStore().version();

/** Bumps on every change to the firm's cases (LP-101). */
export function useCaseVersion(): number {
  return useSyncExternalStore(subscribeCases, caseSnapshot, caseSnapshot);
}

const subscribeFilings = (fn: () => void) => filingStore().subscribe(fn);
const filingSnapshot = () => filingStore().version();

/** Bumps on every change to the filing history (LP-15). */
export function useFilingVersion(): number {
  return useSyncExternalStore(subscribeFilings, filingSnapshot, filingSnapshot);
}

const subscribeConflicts = (fn: () => void) => conflictLog().subscribe(fn);
const conflictSnapshot = () => conflictLog().version();

/** Bumps on every change to the conflict check log (LP-10). */
export function useConflictLogVersion(): number {
  return useSyncExternalStore(subscribeConflicts, conflictSnapshot, conflictSnapshot);
}

const subscribePortfolio = (fn: () => void) => portfolioStore().subscribe(fn);
const portfolioSnapshot = () => portfolioStore().version();

export function usePortfolioVersion(): number {
  return useSyncExternalStore(subscribePortfolio, portfolioSnapshot, portfolioSnapshot);
}

/** Counts values set aside as unreadable since the page loaded (0: none). */
export function useSetAsideVersion(): number {
  return useSyncExternalStore(subscribeSetAside, setAsideVersion, setAsideVersion);
}

const subscribeSync = (fn: () => void) => sync.onChange(() => fn());

/** The sync client's state (a new object on every change). */
export function useSyncState(): sync.SyncState {
  return useSyncExternalStore(subscribeSync, sync.getState, sync.getState);
}
