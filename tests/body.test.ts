// readCapped: the streaming, capped request body reader (design §Sync server).
import { describe, expect, it } from "vitest";
import { readCapped } from "@/lib/server/body";

/** A stream of `chunks` chunks of `size` bytes that records how far it was read and whether it was cancelled. */
function trackedStream(chunks: number, size: number) {
  const info = { pulled: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (info.pulled >= chunks) {
          controller.close();
          return;
        }
        info.pulled++;
        controller.enqueue(new Uint8Array(size).fill(0x61));
      },
      cancel() {
        info.cancelled = true;
      },
    },
    { highWaterMark: 0 }, // pull only when read
  );
  return { stream, info };
}

function streamRequest(body: ReadableStream<Uint8Array>, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/data", {
    method: "PUT",
    headers,
    body,
    duplex: "half",
  } as RequestInit);
}

describe("readCapped", () => {
  it("returns the text when the body is under the cap", async () => {
    const req = new Request("http://localhost:3000/x", { method: "PUT", body: "héllo wörld" });
    expect(await readCapped(req, 1024)).toBe("héllo wörld");
  });

  it("returns an empty string when there is no body", async () => {
    expect(await readCapped(new Request("http://localhost:3000/x"), 10)).toBe("");
  });

  it("accepts a body of exactly the cap", async () => {
    const req = new Request("http://localhost:3000/x", { method: "PUT", body: "a".repeat(100) });
    expect(await readCapped(req, 100)).toBe("a".repeat(100));
  });

  it('returns "too-large" for a declared oversize Content-Length without reading the body', async () => {
    const { stream, info } = trackedStream(4, 16);
    // A request-like object, so the declared length is exactly what the reader sees.
    const req = { headers: new Headers({ "content-length": "5000" }), body: stream } as unknown as Request;
    expect(await readCapped(req, 1000)).toBe("too-large");
    expect(info.pulled).toBe(0);
  });

  it('returns "too-large" for an undeclared oversize stream and cancels it', async () => {
    const { stream, info } = trackedStream(100, 64 * 1024);
    expect(await readCapped(streamRequest(stream), 256 * 1024)).toBe("too-large");
    expect(info.cancelled).toBe(true);
    expect(info.pulled).toBeLessThan(100);
  });

  it("reads a chunked stream under the cap", async () => {
    const { stream } = trackedStream(3, 10);
    expect(await readCapped(streamRequest(stream), 100)).toBe("a".repeat(30));
  });
});
