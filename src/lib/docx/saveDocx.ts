// "Download .docx" (LP-37): the file is built here in the browser, so it works offline and
// without the app's server. The builder (htmlToDocx.ts, with the docx library) loads only on
// the first download. Only rendered HTML can go in (LP-5).

import { download } from "../download";
import type { SafeHtml } from "../safeHtml";

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Build the .docx for `html` (titled `title`) and download it as `filename`.docx. */
export async function saveDocx(html: SafeHtml, title: string, filename: string): Promise<void> {
  const { htmlToDocx } = await import("./htmlToDocx");
  const blob = await htmlToDocx(html, title);
  download(new Blob([blob], { type: DOCX_TYPE }), filename + ".docx");
}
