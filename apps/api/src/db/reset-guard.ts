import {
  describeDatabaseTarget,
  DatabaseTargetError,
  type DatabaseTarget,
} from "./database-target";

/**
 * Defence in depth for destructive database operations.
 *
 * `pnpm db:reset` drops the schema of whatever `DATABASE_URL` points at. Before
 * this guard it did so with no checks at all: pointed at a database named
 * `ffos_production` with `NODE_ENV=production` it destroyed the data and exited
 * zero (RT2-006).
 *
 * Four independent conditions must all hold, so no single mistake — a stale
 * shell variable, a copied command, a wrong `.env` — is enough:
 *
 *   1. `NODE_ENV` is not `production`.
 *   2. The target parses and names itself disposable: `*_dev` or `*_test`.
 *      Anything unrecognised, and anything containing a protected marker such
 *      as prod, staging, live, pilot or customer, is refused.
 *   3. `FFOS_ALLOW_DB_RESET=true` is set, which no ambient environment does.
 *   4. A development database additionally needs the operator to name it, via
 *      `FFOS_DB_RESET_CONFIRM=<database>` or `--yes`. A test database does not,
 *      so CI stays non-interactive.
 *
 * Diagnostics print host, port, database and classification, and never the
 * connection string, so credentials cannot reach a log.
 */

export class DatabaseResetRefused extends Error {
  readonly code = "DATABASE_RESET_REFUSED";
  constructor(reason: string) {
    super(reason);
    this.name = "DatabaseResetRefused";
  }
}

export type ResetGuardEnv = {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  FFOS_ALLOW_DB_RESET?: string;
  FFOS_DB_RESET_CONFIRM?: string;
};

export type ResetGuardOptions = {
  /** `--yes` on the command line, equivalent to naming the database. */
  assumeYes?: boolean;
};

function isTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

/**
 * Decide whether a destructive reset may proceed. Throws `DatabaseResetRefused`
 * with an operator-readable reason otherwise; returns the target on success.
 */
export function assertDatabaseResetAllowed(
  env: ResetGuardEnv,
  options: ResetGuardOptions = {},
): DatabaseTarget {
  if ((env.NODE_ENV ?? "").trim().toLowerCase() === "production") {
    throw new DatabaseResetRefused(
      "NODE_ENV is production. Destructive resets are never permitted in a production environment.",
    );
  }

  // A malformed or absent URL is an unknown target, and unknown targets are
  // refused. Restated as a refusal rather than rethrown, so the operator gets
  // the same one-line reason as every other rejection instead of a stack trace.
  let target: DatabaseTarget;
  try {
    target = describeDatabaseTarget(env.DATABASE_URL);
  } catch (err) {
    if (err instanceof DatabaseTargetError) {
      throw new DatabaseResetRefused(
        `Refusing to reset an unidentifiable target: ${err.message}`,
      );
    }
    throw err;
  }

  if (target.kind === "protected") {
    throw new DatabaseResetRefused(
      `Refusing to reset ${target.describe()}: the name matches a protected pattern (production, staging, live, pilot or customer).`,
    );
  }
  if (target.kind === "unknown") {
    throw new DatabaseResetRefused(
      `Refusing to reset ${target.describe()}: only databases whose name ends in _dev or _test are treated as disposable. ` +
        "Rename the database, or point DATABASE_URL at the intended one.",
    );
  }

  if (!isTrue(env.FFOS_ALLOW_DB_RESET)) {
    throw new DatabaseResetRefused(
      `Refusing to reset ${target.describe()}: set FFOS_ALLOW_DB_RESET=true to permit a destructive reset.`,
    );
  }

  if (target.kind === "development") {
    const named = env.FFOS_DB_RESET_CONFIRM?.trim() === target.database;
    if (!named && !options.assumeYes) {
      throw new DatabaseResetRefused(
        `Refusing to reset the development database ${target.describe()} without confirmation. ` +
          `Re-run with FFOS_DB_RESET_CONFIRM=${target.database}, or pass --yes.`,
      );
    }
  }

  return target;
}
