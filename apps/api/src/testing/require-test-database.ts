import { appendFileSync } from "node:fs";
import { describeDatabaseTarget } from "../db/database-target";

/**
 * Assert that a database-backed test can actually reach a TEST database.
 *
 * This replaces the `if (!process.env.DATABASE_URL) return;` guards that turned
 * "the integration suite never ran" into a green test command (RT2-005). A
 * missing or wrongly-pointed database is now a loud failure: a required test
 * that cannot run has not passed.
 *
 * It also refuses to run against a development or unrecognised database, so a
 * misconfigured shell cannot have the suite mutate the developer's own data.
 */
export function requireTestDatabase(): void {
  const target = describeDatabaseTarget(process.env.DATABASE_URL);
  if (target.kind !== "test") {
    throw new Error(
      `Database-backed tests require a test database, but DATABASE_URL points at ${target.describe()}. ` +
        "Run the suite with the test environment loaded (pnpm test) or point DATABASE_URL at a database whose name ends in _test.",
    );
  }
  countExecutedDatabaseTest();
}

/**
 * Assert that a Redis-backed test can reach the test Redis context.
 *
 * `REDIS_URL` must be set and must select a non-default logical database, so a
 * queue test cannot drain the jobs of a running development worker.
 */
export function requireTestRedis(): void {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      "Redis-backed tests require REDIS_URL. Run the suite with the test environment loaded (pnpm test).",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`REDIS_URL is not a valid URL: ${url}`);
  }
  const logicalDb = parsed.pathname.replace(/^\//, "");
  if (!logicalDb || logicalDb === "0") {
    throw new Error(
      `Redis-backed tests must use a dedicated logical database, but REDIS_URL selects "${logicalDb || "0"}", ` +
        "which is the one the development worker uses.",
    );
  }
}

/**
 * Execution ledger behind the proof in `scripts/run-tests.mjs`.
 *
 * The node test runner gives each file its own process, so an in-memory counter
 * cannot see the whole suite. Each entry to a database-backed test therefore
 * appends a line to a shared file, and the runner asserts afterwards that at
 * least a known number of them ran. A count is proof that the guarded bodies
 * executed; duration is not, because a suite can be fast for the wrong reason.
 */
function countExecutedDatabaseTest(): void {
  const log = process.env.FFOS_TEST_EXECUTION_LOG;
  if (!log) return;
  appendFileSync(log, `${process.pid}\n`);
}
