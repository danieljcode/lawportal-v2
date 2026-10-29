// Per-form state, pure (design §Per-form state, plan §R R1–R3, R6).
//
// FormView keeps one FormState and replaces it through these functions. They
// mirror the in-place edits of the reference app (fieldInput, checkRow,
// condInput, blockInput, applyPrefills, fillFromCharacter, loadDocket,
// saveFormToDocket) but never mutate their input: only the objects along the
// edited path are copied.
//
// The code lives in formState/ (LP-7): state.ts (types, scope paths, walking),
// update.ts (the update API), rules.ts (prefills, character fill), dockets.ts
// (docket <-> form), layout.ts (sections, checklists) and drafts.ts. This file
// re-exports them, so imports from "@/lib/formState" keep working.

export { DEFENDANT_LABELS, EMPTY_STATE, FILED_LABELS, isItem, PLAINTIFF_LABELS, scopeAt } from "./formState/state";
export type { FormState, ScopePath } from "./formState/state";
export { addItem, hasDependents, materializeBlocks, moveItem, removeItem, setCond, setValue } from "./formState/update";
export {
  afterAddItem,
  applyPrefills,
  autoDate,
  fillFromCharacter,
  openState,
  swapCaseCode,
  todayDate,
} from "./formState/rules";
export { docketToForm, formToDocketPatch, hasField } from "./formState/dockets";
export { layout, sectionMeta, segments, singular } from "./formState/layout";
export { missingRequired } from "./formState/required";
export type { MissingField } from "./formState/required";
export type { ChecklistRow, LayoutItem, Segment } from "./formState/layout";
export { COLLAPSED_KEY, LAST_FORM_KEY, draftKey, readDraft, toFormState, writeDraft } from "./formState/drafts";
export { GROUP_MS, UNDO_LIMIT, change, redo, startUndo, undo } from "./formState/undo";
export type { Undoable } from "./formState/undo";
