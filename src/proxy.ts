// Runs before every request (Next's proxy, formerly middleware): gives the page a
// fresh nonce and the Content-Security-Policy that trusts it (LP-169). Next reads
// the policy from the request to put the nonce on its own scripts; the layout
// reads x-nonce for the theme and title scripts.

import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy } from "@/lib/csp";

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Not the built files, which carry no scripts of their own to trust.
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
