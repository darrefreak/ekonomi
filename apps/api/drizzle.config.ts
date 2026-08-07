import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: [
    "./src/db/schema.ts",
    "./src/db/schema-economic.ts",
    "./src/db/schema-planning.ts",
    "./src/db/schema-vehicles.ts",
    "./src/db/schema-decisions.ts",
    "./src/db/schema-vehicle-intel.ts",
    "./src/db/schema-intake.ts",
    "./src/db/schema-ai.ts",
  ],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://ffos:ffos@localhost:5432/ffos",
  },
});
