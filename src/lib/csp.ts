// The Content-Security-Policy (LP-169), sent by src/proxy.ts with a fresh nonce
// on every request. Scripts run only when they carry the nonce (Next puts it on
// its own, the layout on the theme and title scripts) or are loaded by one that
// does ('strict-dynamic', for Next's chunks and Vercel Analytics). Everything
// else comes from the app itself, except images: forms link https pictures.
//
// To allow a new source, add it to the directive it needs below, and say why.

export function contentSecurityPolicy(nonce: string, dev = false): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // React's dev build evaluates code for its error overlay and fast refresh.
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    // React sets style attributes (widths, positions), which need 'unsafe-inline'.
    "style-src": ["'self'", "'unsafe-inline'"],
    // Forum images in forms are linked from any https host; data: for the CSS icons, blob: for downloads.
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    // Sync (/api) and Vercel Analytics (/_vercel/insights) are both on this origin.
    "connect-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}
