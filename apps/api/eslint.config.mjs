import nodeConfig from "@ffos/eslint-config/node";

export default [
  ...nodeConfig,
  {
    ignores: ["dist/**", "drizzle/**", "node_modules/**"],
  },
];
