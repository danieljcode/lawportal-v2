// ESLint (LP-86): Next.js's recommended rules for React and TypeScript, with
// formatting left to Prettier (eslint-config-prettier turns off style rules).
// eslint-config-next 16 ships flat configs, so they're spread in directly (LP-97).
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

// Where code may import from (LP-121, docs/architecture.md "Code layout"). A program is only
// reached through its index (`@/programs/<id>`); inside a program, relative imports never climb
// out of it; and src/lib and src/ui never depend on the shell or a program. A later block's
// options replace an earlier one's, so each block lists every pattern it needs.
const DEEP = { group: ["@/programs/*/*"], message: "Import a program through its index, `@/programs/<id>` (LP-121)." };
const OUT = (up) => ({
  group: [up + "*"],
  message: "Don't climb out of a program: use `@/…` for shared code, `@/programs/<id>` for another program (LP-121).",
});
const UP = {
  group: ["@/shell", "@/shell/*", "@/programs", "@/programs/*"],
  message: "src/lib and src/ui are shared: they can't depend on the shell or a program (LP-121).",
};
const restrict = (...patterns) => ({ "no-restricted-imports": ["error", { patterns }] });

const config = [
  {
    ignores: [
      ".next/",
      "node_modules/",
      "data/",
      ".agents/",
      "next-env.d.ts",
      "tests/__snapshots__/",
      "test-results/",
      "playwright-report/",
    ],
  },
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // `const { dropped, ...rest } = obj` is how a field is left out of a copy.
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },
  { files: ["src/**/*.{ts,tsx}"], rules: restrict(DEEP) },
  { files: ["src/programs/*/*.{ts,tsx}"], rules: restrict(DEEP, OUT("../")) },
  { files: ["src/programs/*/*/*.{ts,tsx}"], rules: restrict(DEEP, OUT("../../")) },
  { files: ["src/lib/**/*.{ts,tsx}", "src/ui/**/*.{ts,tsx}"], rules: restrict(UP) },
  prettier,
];

export default config;
