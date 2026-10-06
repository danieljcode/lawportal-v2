// POST /api/docx: convert the final preview HTML to a .docx download (design §.docx route).
import { checkHost } from "@/lib/server/guard";
import { readCapped } from "@/lib/server/body";
import { htmlToDocx } from "@/lib/docx/htmlToDocx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 2_097_152;
const MAX_HTML = 1_500_000;
const MAX_TITLE = 200;
const ID_RE = /^[a-z0-9-]{1,80}$/;
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/** Lowercase, runs of anything but a-z0-9 become "-", trimmed; falls back to "document". */
function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "document"
  );
}

export async function POST(req: Request): Promise<Response> {
  const refused = checkHost(req);
  if (refused) return refused;
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return json({ error: "Expected application/json." }, 415);
  }
  const text = await readCapped(req, MAX_BODY);
  if (text === "too-large") return json({ error: "That document is too large to convert (max 2 MB)." }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid JSON." }, 400);
  const { html, title: rawTitle, id: rawId } = body as Record<string, unknown>;
  if (typeof html !== "string" || !html || html.length > MAX_HTML) return json({ error: "Missing html." }, 400);
  const title = typeof rawTitle === "string" && rawTitle.length <= MAX_TITLE ? rawTitle : "Document";
  const id = typeof rawId === "string" && ID_RE.test(rawId) ? rawId : "";
  const filename = (id || slug(title)) + ".docx";

  let buffer: Buffer;
  try {
    buffer = await htmlToDocx(html, title);
  } catch (err) {
    console.error("[docx]", err);
    return json({ error: "Couldn't build the document." }, 500);
  }
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": DOCX_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
      ...NO_STORE,
    },
  });
}
