import type { Metadata, Viewport } from "next";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// A small navy tile with a pair of scales, drawn inline (no network request).
const ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>" +
      "<rect width='32' height='32' fill='#000080'/>" +
      "<rect x='1' y='1' width='30' height='30' fill='none' stroke='#c0c0c0' stroke-width='2'/>" +
      "<g fill='none' stroke='#ffff00' stroke-width='2' stroke-linecap='square'>" +
      "<path d='M16 7v17M10 25h12M8 10h16M8 10l-3 7h6zM24 10l-3 7h6z'/></g></svg>",
  );

export const metadata: Metadata = {
  title: "Court Filing Generator",
  description:
    "Fill in San Andreas court petitions, preview them as a forum post, and copy them straight into the forum editor. Runs locally.",
  icons: { icon: ICON },
};

export const viewport: Viewport = {
  themeColor: "#000080",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
