// The firm this copy is set up for (LP-22): one place for its name, logo,
// colours and wallpaper, so another firm could be set up when it's hosted.
// The app's own chrome reads it (window and tab titles, the toolbar, the boot
// screen, the favicon, Help → About). Court forms and the forum preview never
// do: anything posted to the forum must look official, not firm-branded.

export interface Branding {
  /** "Friedman & Associates". */
  firmName: string;
  /** "F&A". */
  shortName: string;
  /** What the system is called after the firm's name. */
  productName: string;
  /** A square image for the favicon and About box (a path under public/ or a data: URL); null until one exists. */
  logo: string | null;
  colours: {
    /** Title bars and the favicon tile. */
    primary: string;
    /** The favicon's scales. */
    accent: string;
  };
  /** The desktop wallpaper (LP-24); null until one exists. */
  wallpaper: string | null;
}

export const BRANDING: Branding = {
  firmName: "Friedman & Associates",
  shortName: "F&A",
  productName: "Court Filing System",
  logo: null,
  colours: { primary: "#000080", accent: "#ffff00" },
  wallpaper: null,
};

/** "Friedman & Associates: Court Filing System": the window title and the browser tab. */
export function appTitle(b: Branding = BRANDING): string {
  return b.firmName + ": " + b.productName;
}

/**
 * The script that sets the starting browser-tab title (see app/layout.tsx). The title is JSON
 * with `<` escaped, so a firm name can't close the script tag.
 */
export function titleScript(b: Branding = BRANDING): string {
  return "document.title=" + JSON.stringify(appTitle(b)).replace(/</g, "\\u003c") + ";";
}

/** The favicon: the firm's logo, or a tile with a pair of scales in the firm's colours. */
export function iconHref(b: Branding = BRANDING): string {
  if (b.logo) return b.logo;
  return (
    "data:image/svg+xml," +
    encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>" +
        `<rect width='32' height='32' fill='${b.colours.primary}'/>` +
        "<rect x='1' y='1' width='30' height='30' fill='none' stroke='#c0c0c0' stroke-width='2'/>" +
        `<g fill='none' stroke='${b.colours.accent}' stroke-width='2' stroke-linecap='square'>` +
        "<path d='M16 7v17M10 25h12M8 10h16M8 10l-3 7h6zM24 10l-3 7h6z'/></g></svg>",
    )
  );
}
