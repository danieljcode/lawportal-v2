// The browser's side of "Download .docx": the body POSTed to /api/docx, which
// builds the file on the server (htmlToDocx.ts). Only rendered HTML can be
// sent (LP-5).

import type { SafeHtml } from "../safeHtml";

export function docxRequestBody(html: SafeHtml, title: string, id: string): string {
  return JSON.stringify({ html, title, id });
}
