import globals from "globals";
import base from "./base.js";

/** NestJS / Node API lint profile. */
export default [
  ...base,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Nest DI and decorators often look "unused" to no-unused-vars; handled via argsIgnorePattern.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
