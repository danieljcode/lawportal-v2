// The Content-Security-Policy (LP-169): scripts only with the nonce, nothing
// framed, and sources only from the app itself except https images.
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "@/lib/csp";

const directive = (csp: string, name: string) =>
  csp
    .split("; ")
    .find((d) => d.startsWith(name + " "))
    ?.slice(name.length + 1);

describe("the Content-Security-Policy", () => {
  it("runs only scripts with this request's nonce, and the ones they load", () => {
    const csp = contentSecurityPolicy("abc123");
    expect(directive(csp, "script-src")).toBe("'self' 'nonce-abc123' 'strict-dynamic'");
  });

  it("allows eval only in development, for React's dev build", () => {
    expect(directive(contentSecurityPolicy("n"), "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(contentSecurityPolicy("n", true), "script-src")).toContain("'unsafe-eval'");
  });

  it("keeps framing, plugins and other origins out", () => {
    const csp = contentSecurityPolicy("n");
    expect(directive(csp, "frame-ancestors")).toBe("'none'");
    expect(directive(csp, "object-src")).toBe("'none'");
    expect(directive(csp, "default-src")).toBe("'self'");
    expect(directive(csp, "connect-src")).toBe("'self'");
    expect(directive(csp, "img-src")).toBe("'self' data: blob: https:");
  });
});
