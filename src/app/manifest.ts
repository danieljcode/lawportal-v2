// The web app manifest (LP-51), so the app installs to a phone's home screen and opens in its own window.
import type { MetadataRoute } from "next";
import { BRANDING, appTitle } from "@/branding";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appTitle(),
    short_name: BRANDING.shortName,
    description: "Write court filings, and keep the firm's cases, clients and bills. Works offline once installed.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: BRANDING.colours.primary,
    theme_color: BRANDING.colours.primary,
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
    ],
  };
}
