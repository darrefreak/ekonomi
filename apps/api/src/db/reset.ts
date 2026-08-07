import { getPool } from "./client";

async function main() {
  const pool = getPool();
  console.log("Resetting public + drizzle schemas...");
  // Must drop drizzle journal too; otherwise migrate is a no-op on an empty public schema.
  await pool.query(
    "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;",
  );
  await pool.end();

  // Re-run migrate + seed as child processes to reuse compiled entrypoints
  const { spawnSync } = await import("node:child_process");
  const migrate = spawnSync("pnpm", ["exec", "tsx", "src/db/migrate.ts"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  if (migrate.status !== 0) process.exit(migrate.status ?? 1);

  const seed = spawnSync("pnpm", ["exec", "tsx", "src/db/seed.ts"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  if (seed.status !== 0) process.exit(seed.status ?? 1);

  console.log("Database reset complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
