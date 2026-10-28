// Debounced draft writes (plan §R R1).
//
// FormView keeps one writer per mounted form (in a useRef). Edits call
// schedule(); unmount and `pagehide` call flush(), which writes the pending
// state right away. The writer stays usable after a flush, so StrictMode's
// unmount/remount in dev keeps working. The `write` callback captures its own
// form id, so a flush on unmount always lands on the form that was edited.

import type { FormState } from "./formState";

export interface DraftWriter {
  /** Remember `s` and write it after `delay` ms of quiet (a newer schedule restarts the wait). */
  schedule(s: FormState): void;
  /** Write the pending state now (once); does nothing when nothing is pending. */
  flush(): void;
  /** Drop the pending state without writing it. */
  cancel(): void;
}

export function createDraftWriter(write: (s: FormState) => void, delay = 300): DraftWriter {
  let pending: FormState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const flush = () => {
    clearTimer();
    if (!pending) return;
    const s = pending;
    pending = null;
    write(s);
  };

  return {
    schedule(s) {
      pending = s;
      clearTimer();
      timer = setTimeout(flush, delay);
    },
    flush,
    cancel() {
      clearTimer();
      pending = null;
    },
  };
}
