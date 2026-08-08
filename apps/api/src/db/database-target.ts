/**
 * Identify what a `DATABASE_URL` actually points at, so destructive and
 * test-only operations can refuse to run against the wrong thing.
 *
 * Naming is the contract: a database is only recognised as disposable when its
 * name says so. Anything unrecognised is treated as potentially real data,
 * because the cost of being wrong is asymmetric — refusing a legitimate reset
 * costs a rename, running one against real data costs the data.
 */

export type DatabaseEnvironmentKind =
  | "test"
  | "development"
  | "protected"
  | "unknown";

export type DatabaseTarget = {
  host: string;
  port: string;
  database: string;
  kind: DatabaseEnvironmentKind;
  /** Safe to log: host, port and database name only, never credentials. */
  describe(): string;
};

export class DatabaseTargetError extends Error {
  readonly code = "DATABASE_TARGET_INVALID";
}

/** Names that must never be treated as disposable, wherever they appear. */
const PROTECTED_PATTERNS = [
  /prod/i,
  /production/i,
  /staging/i,
  /stage\b/i,
  /live/i,
  /pilot/i,
  /customer/i,
];

const TEST_DATABASE = /(^|_)test$/i;
const DEV_DATABASE = /(^|_)dev$/i;

function classify(database: string, host: string): DatabaseEnvironmentKind {
  // A protected marker anywhere wins, even if the name also ends in _test:
  // `prod_test` is not a database anyone should be able to drop by accident.
  for (const pattern of PROTECTED_PATTERNS) {
    if (pattern.test(database) || pattern.test(host)) return "protected";
  }
  if (TEST_DATABASE.test(database)) return "test";
  if (DEV_DATABASE.test(database)) return "development";
  return "unknown";
}

/**
 * Parse and classify a database URL. Throws rather than guessing when the URL
 * is missing or malformed — an unparseable target is an unknown target.
 */
export function describeDatabaseTarget(url: string | undefined): DatabaseTarget {
  if (!url || !url.trim()) {
    throw new DatabaseTargetError("DATABASE_URL is not set.");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DatabaseTargetError("DATABASE_URL is not a valid URL.");
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    throw new DatabaseTargetError(
      `DATABASE_URL must be a postgres URL, got protocol "${parsed.protocol}".`,
    );
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!database) {
    throw new DatabaseTargetError("DATABASE_URL has no database name.");
  }
  const host = parsed.hostname || "localhost";
  const port = parsed.port || "5432";
  const kind = classify(database, host);
  return {
    host,
    port,
    database,
    kind,
    describe: () => `${database} at ${host}:${port} (${kind})`,
  };
}
