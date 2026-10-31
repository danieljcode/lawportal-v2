// Print one sheet as a named document (LP-35): the page's title becomes `name`, which is
// what the browser's "Save as PDF" suggests as the file name, and `show` renders the
// sheet only while the print dialog is open, so the page prints just that.

import { flushSync } from "react-dom";

export function printAs(name: string, show: (on: boolean) => void): void {
  const title = document.title;
  flushSync(() => show(true));
  document.title = name;
  try {
    window.print();
  } finally {
    document.title = title;
    show(false);
  }
}
