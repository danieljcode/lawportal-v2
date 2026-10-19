// ESLint (LP-86): Next.js's recommended rules for React and TypeScript, with
// formatting left to Prettier (eslint-config-prettier turns off style rules).
// eslint-config-next 16 ships flat configs, so they're spread in directly (LP-97).
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

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
  prettier,
];

export default config;
