// ESLint (LP-86): Next.js's recommended rules for React and TypeScript, with
// formatting left to Prettier (eslint-config-prettier turns off style rules).
// eslint-config-next 15 ships the older config format, so it's loaded through
// FlatCompat, as the Next.js docs show for version 15.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import prettier from "eslint-config-prettier";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

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
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // `const { dropped, ...rest } = obj` is how a field is left out of a copy.
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },
  prettier,
];

export default config;
