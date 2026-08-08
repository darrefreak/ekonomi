import { getPool } from "./client";
import { assertDatabaseResetAllowed, DatabaseResetRefused } from "./reset-guard";

async function main() {
  const target = assertDatabaseResetAllowed(process.env, {
    assumeYes: process.argv.includes("--yes"),
  });

  console.log(`Resetting ${target.describe()}`);
  const pool = getPool();
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
  if (err instanceof DatabaseResetRefused) {
    // Operator-readable refusal, never a stack trace and never the URL.
    console.error(`\n✖ ${err.message}\n`);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
