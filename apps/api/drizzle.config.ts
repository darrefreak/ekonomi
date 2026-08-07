import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: [
    "./src/db/schema.ts",
    "./src/db/schema-economic.ts",
    "./src/db/schema-planning.ts",
    "./src/db/schema-vehicles.ts",
  ],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://ffos:ffos@localhost:5432/ffos",
  },
});
