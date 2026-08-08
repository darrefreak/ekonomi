import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import { accounts } from "../db/schema-economic";
import { vehicles } from "../db/schema-vehicles";

/**
 * Access to the deterministic demo seed from database-backed tests.
 *
 * Two rules, both learned the hard way:
 *
 *   Bind to the seed by name, never by "the first row". A suite that reads
 *   `select().from(vehicles).limit(1)` picks up whatever an unrelated test
 *   created moments earlier, which is how a shared test database turns into
 *   order-dependent flakes.
 *
 *   Fail loudly when the seed is absent. A missing fixture means the test did
 *   not run, and a test that did not run has not passed (RT2-005).
 */

export const DEMO_HOUSEHOLD_NAME = "Familjen Demo";

export async function requireDemoHousehold() {
  const [household] = await getDb()
    .select()
    .from(households)
    .where(eq(households.name, DEMO_HOUSEHOLD_NAME))
    .limit(1);
  if (!household) {
    throw new Error(
      `The demo household "${DEMO_HOUSEHOLD_NAME}" is missing from the test database. ` +
        "Run the suite with `pnpm test`, which seeds it before the database-backed suites.",
    );
  }
  return household;
}

/** The seeded demo vehicle — deterministic, and never one a test just created. */
export async function requireDemoVehicle() {
  const household = await requireDemoHousehold();
  const [vehicle] = await getDb()
    .select()
    .from(vehicles)
    .where(eq(vehicles.householdId, household.id))
    .orderBy(asc(vehicles.createdAt), asc(vehicles.id))
    .limit(1);
  if (!vehicle) {
    throw new Error(
      "The demo household has no vehicle. The vehicle-intelligence suites need the demo seed; run `pnpm test`.",
    );
  }
  return { household, vehicle };
}

/** The seeded demo account of a given type — again, never one a test created. */
export async function requireDemoAccount(
  accountType: (typeof accounts.$inferSelect)["accountType"],
) {
  const household = await requireDemoHousehold();
  const [account] = await getDb()
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.householdId, household.id),
        eq(accounts.accountType, accountType),
      ),
    )
    .orderBy(asc(accounts.createdAt), asc(accounts.id))
    .limit(1);
  if (!account) {
    throw new Error(
      `The demo household has no ${accountType} account. The demo seed must provide one; run \`pnpm test\`.`,
    );
  }
  return { household, account };
}

/**
 * Loud replacement for `if (!row) return;`.
 *
 * A missing fixture is a broken test environment, not a reason to report
 * success — the exact substitution that let a whole integration suite skip
 * itself and still turn the gate green (RT2-005).
 */
export function assertFixture<T>(
  value: T,
  what: string,
): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error(
      `Missing test fixture: ${what}. The database-backed suites require the demo seed; run \`pnpm test\`, which resets and seeds the test database.`,
    );
  }
}
