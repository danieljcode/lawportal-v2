// Streaming request body reader with a byte cap (shared by PUT /api/data and POST /api/docx).
//
// Route handlers have no built-in body limit, and req.text() would buffer a
// chunked body completely, so the routes read through this instead.

export async function readCapped(req: Request, max: number): Promise<string | "too-large"> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(len) && len > max) return "too-large";
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return "too-large";
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}
