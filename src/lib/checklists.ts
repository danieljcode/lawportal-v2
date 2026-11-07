// Next-action checklists (LP-230): named lists of routine jobs for a kind of case
// ("Criminal defence", "Civil plaintiff"), added to a case as unassigned next
// actions with no due date. The firm edits them in Settings; until it does, the
// starter lists below are used. Storage and sync are in checklistStore.ts.

import { cleanAction, MAX_ACTIONS } from "./actions";
import { checklistStore, cleanChecklist, MAX_CHECKLISTS, type Checklist } from "./checklistStore";
import type { CaseAction } from "./types";

const STARTER_TIME = "2026-11-07T00:00:00.000Z";
const starter = (id: string, name: string, matter: string, items: string[]): Checklist => ({
  id,
  name,
  matter,
  items,
  updated: STARTER_TIME,
});

/** The lists used until the firm edits its own; fixed ids so every device has the same ones. */
export const STARTER_CHECKLISTS: readonly Checklist[] = [
  starter("chkcrimdef", "Criminal defence", "Criminal", [
    "Meet the client",
    "Run a conflict check",
    "File the notice of appearance",
    "Request discovery from the prosecution",
    "Review the arrest report and evidence",
    "Discuss plea options with the client",
    "Prepare for the arraignment",
  ]),
  starter("chkcrimpro", "Prosecution", "Criminal", [
    "Review the arrest report and evidence",
    "Decide the charges",
    "File the complaint",
    "Send discovery to the defence",
    "Contact the witnesses",
    "Prepare for the arraignment",
  ]),
  starter("chkcivplt", "Civil plaintiff", "Civil", [
    "Meet the client",
    "Run a conflict check",
    "Send a demand letter",
    "File the complaint",
    "Serve the defendant",
    "Request discovery",
  ]),
  starter("chkcivdef", "Civil defendant", "Civil", [
    "Meet the client",
    "Run a conflict check",
    "Add the deadline to answer",
    "File the answer",
    "Request discovery",
  ]),
  starter("chktraffic", "Traffic", "Traffic", [
    "Meet the client",
    "Review the citation",
    "File the notice of appearance",
    "Request the officer's report",
  ]),
  starter("chksmall", "Small claims", "Small claims", [
    "Meet the client",
    "Gather receipts and documents",
    "File the claim",
    "Serve the other party",
  ]),
];

/** The lists to offer: the firm's own, or the starter lists while it has none. */
export const checklistsOrStarter = (list: readonly Checklist[]): readonly Checklist[] =>
  list.length ? list : STARTER_CHECKLISTS;

/** The first list for a case's matter, else the first list. */
export const checklistFor = (lists: readonly Checklist[], matter: string): Checklist | undefined =>
  lists.find((l) => l.matter === matter) || lists[0];

/** A case's actions with a checklist's items added as new open actions; titles already on the case are skipped. */
export function withChecklist(
  actions: readonly CaseAction[],
  list: Pick<Checklist, "items">,
): { actions: CaseAction[]; added: number; skipped: number } {
  const have = new Set(actions.map((a) => a.title.trim().toLowerCase()));
  const fresh = list.items.filter((t) => !have.has(t.trim().toLowerCase()));
  const room = Math.max(0, MAX_ACTIONS - actions.length);
  const added = fresh.slice(0, room).map((title) => cleanAction({ title })!);
  return { actions: [...actions, ...added], added: added.length, skipped: list.items.length - added.length };
}

/** The lists in use, as the firm's own copy to change. */
const current = () => [...checklistsOrStarter(checklistStore().list())];

/** Add or change one list (the starter lists become the firm's own first). Throws when it has no name. */
export function saveChecklist(input: Partial<Checklist>): Checklist {
  const c = cleanChecklist({ ...input, updated: undefined });
  if (!c) throw new Error("Give the checklist a name, like Criminal defence.");
  const list = current();
  const i = list.findIndex((x) => x.id === c.id);
  if (i < 0 && list.length >= MAX_CHECKLISTS) throw new Error("Up to " + MAX_CHECKLISTS + " checklists.");
  if (i < 0) list.push(c);
  else list[i] = c;
  checklistStore().replaceAll(list);
  return c;
}

// shortcut: removing every list brings the starter lists back; add an "empty on purpose" flag if firms want none.
export function removeChecklist(id: string): void {
  checklistStore().replaceAll(current().filter((x) => x.id !== id));
}

/** Go back to the starter lists. */
export function resetChecklists(): void {
  checklistStore().replaceAll([]);
}
