#!/usr/bin/env node
/**
 * The honest test command.
 *
 * `pnpm test` used to report green while the database-backed tests never ran:
 * Turborepo's strict env mode stripped `DATABASE_URL`, and every DB fixture
 * quietly returned instead of failing (RT2-005). A green result meant nothing.
 *
 * This runner makes the green mean something:
 *
 *   1. it loads `.env.test`, so the suite always knows where the TEST database
 *      and the TEST Redis logical database are;
 *   2. it refuses to start unless that database is a test database, reachable,
 *      and migrated;
 *   3. it runs the workspace suites with that environment explicitly passed
 *      through, rather than hoping the task runner forwards it;
 *   4. it counts how many database-backed tests actually executed and fails if
 *      the count is below a floor, so "the suite did not run" can never again
 *      look like "the suite passed".
 *
 * Usage:
 *   node scripts/run-tests.mjs            full required suite
 *   node scripts/run-tests.mjs --unit     pure unit suites only
 *   node scripts/run-tests.mjs --db       database-backed suites only
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Minimum number of database-backed tests that must execute. Set from the
 * current suite size with headroom; raise it as the suite grows. A silent drop
 * below this is the exact failure RT2-005 described.
 */
const MIN_DATABASE_BACKED_TESTS = 60;

const UNIT_PACKAGES = [
  "@ffos/domain",
  "@ffos/utils",
  "@ffos/schemas",
  "@ffos/financial-engine",
];
const DATABASE_PACKAGES = ["@ffos/api"];

function parseEnvFile(path) {
  if (!existsSync(path)) {
    fail(
      `${path} is missing. It defines the test database and Redis context; without it the suite would run against development data.`,
    );
  }
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.error) fail(`${command} could not be started: ${result.error.message}`);
  return result.status ?? 1;
}

// ---------------------------------------------------------------- environment
const testEnv = parseEnvFile(join(root, ".env.test"));
const databaseUrl = testEnv.DATABASE_URL;
if (!databaseUrl) fail(".env.test does not define DATABASE_URL.");

const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
if (!/_test$/.test(databaseName)) {
  fail(
    `The test suite must run against a database whose name ends in _test, but .env.test points at "${databaseName}".`,
  );
}

const executionLog = join(root, "node_modules/.cache/ffos-test-execution.log");
mkdirSync(dirname(executionLog), { recursive: true });
rmSync(executionLog, { force: true });
writeFileSync(executionLog, "");

const childEnv = {
  ...process.env,
  ...testEnv,
  NODE_ENV: "test",
  FFOS_TEST_EXECUTION_LOG: executionLog,
};

const mode = process.argv.includes("--unit")
  ? "unit"
  : process.argv.includes("--db")
    ? "db"
    : "all";

// ---------------------------------------------------------------------- build
// The API suite imports the built engine, so a stale dist would silently test
// yesterday's code.
console.log("\n▶ Building workspace packages");
if (run("pnpm", ["exec", "turbo", "run", "build"], { env: childEnv }) !== 0) {
  fail("The workspace failed to build, so no suite could be trusted.");
}

// ------------------------------------------------------------------- database
if (mode !== "unit") {
  console.log(`\n▶ Preparing test database "${databaseName}"`);

  // `--fresh` drops everything first. Useful when a previous run left rows
  // behind; the reset guard still applies, and it only ever reaches a _test
  // database because of the check above.
  if (process.argv.includes("--fresh")) {
    const reset = run("pnpm", ["--filter", "@ffos/api", "exec", "tsx", "src/db/reset.ts", "--yes"], {
      env: { ...childEnv, FFOS_ALLOW_DB_RESET: "true" },
    });
    if (reset !== 0) fail(`Could not reset the test database "${databaseName}".`);
  }

  const migrated = run("pnpm", ["--filter", "@ffos/api", "exec", "tsx", "src/db/migrate.ts"], {
    env: childEnv,
  });
  if (migrated !== 0) {
    fail(
      `Could not migrate the test database "${databaseName}". Start the stack with \`docker compose up -d postgres redis\` and try again. ` +
        "The database-backed tests are required, so this is a failure and not a skip.",
    );
  }

  // Reseed from scratch. The suites assert against the deterministic demo
  // household, so yesterday's leftovers — or a vehicle an earlier run created —
  // must not be able to change what a test reads.
  if (!process.argv.includes("--no-seed")) {
    console.log(`\n▶ Seeding "${databaseName}" with the deterministic demo data`);
    const seeded = run("pnpm", ["--filter", "@ffos/api", "exec", "tsx", "src/db/seed.ts"], {
      env: { ...childEnv, FFOS_ALLOW_DB_RESET: "true" },
    });
    if (seeded !== 0) {
      fail(`Could not seed the test database "${databaseName}".`);
    }
  }
}

// --------------------------------------------------------------------- suites
const packages =
  mode === "unit"
    ? UNIT_PACKAGES
    : mode === "db"
      ? DATABASE_PACKAGES
      : [...UNIT_PACKAGES, ...DATABASE_PACKAGES];

let failed = 0;
for (const pkg of packages) {
  console.log(`\n▶ ${pkg}`);
  if (run("pnpm", ["--filter", pkg, "run", "test"], { env: childEnv }) !== 0) {
    failed += 1;
  }
}

// ----------------------------------------------------------- execution proof
if (mode !== "unit") {
  const executed = readFileSync(executionLog, "utf8")
    .split("\n")
    .filter(Boolean).length;
  console.log(`\n▶ Database-backed tests executed: ${executed}`);
  if (executed < MIN_DATABASE_BACKED_TESTS) {
    fail(
      `Only ${executed} database-backed tests executed; at least ${MIN_DATABASE_BACKED_TESTS} are required. ` +
        "A green suite that did not exercise the database is exactly the failure this check exists to catch.",
    );
  }
}

if (failed > 0) {
  fail(`${failed} package suite(s) failed.`);
}
console.log("\n✔ All required suites ran and passed.\n");
