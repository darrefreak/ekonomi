import globals from "globals";
import base from "./base.js";

/**
 * Next.js App Router profile.
 * Uses the shared TS baseline plus browser globals.
 * (Avoids FlatCompat + next/core-web-vitals crash with TS 5.8 / ESLint 9.)
 */
export default [
  ...base,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // Prefer TS-aware unused checks; keep crash-prone edge cases soft.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
];
