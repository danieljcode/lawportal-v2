// Markdown files import as their text (LP-94): Turbopack's raw rule in next.config.mjs, and the
// plugin in vitest.config.mts.
declare module "*.md" {
  const text: string;
  export default text;
}
