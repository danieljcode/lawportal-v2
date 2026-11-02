import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { BRANDING, iconHref, titleScript } from "@/branding";
import { THEME_SCRIPT } from "@/lib/theme";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// The favicon comes from the firm's branding (LP-22): its logo when it has one, otherwise a
// tile with a pair of scales drawn inline (no network request).
//
// The title isn't in the metadata: Next would own the <title> element and put it back over
// the page's own title ("Case File · …", set by useRoute) when its router first syncs the URL.
// A script sets the starting title instead, and the app keeps it up to date from then on.

export const metadata: Metadata = {
  description:
    "Fill in San Andreas court petitions, preview them as a forum post, and copy them straight into the forum editor. Runs locally.",
  icons: { icon: iconHref() },
};

export const viewport: Viewport = {
  themeColor: BRANDING.colours.primary,
};

// The Content-Security-Policy (LP-169) runs only scripts with this request's nonce, from
// src/proxy.ts. Reading it renders the page per request instead of once at build.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: titleScript() }} />
      </head>
      <body>{children}</body>
      <Analytics />
    </html>
  );
}
