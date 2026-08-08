import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { households } from "../db/schema";

/**
 * Product time base.
 *
 * Runtime default is the real calendar date in the application timezone.
 * `DEMO_AS_OF_DATE` is seed/demo configuration only and must never become the
 * current date for unrelated households (see V1_RT_BH_REPRO.md, RT-001).
 */

export const APP_TIME_ZONE = process.env.APP_TIME_ZONE ?? "Europe/Stockholm";

/** Deterministic clock override for tests only. */
function testClockDate(): string | null {
  const injected = process.env.FFOS_TEST_CLOCK_DATE;
  return injected && /^\d{4}-\d{2}-\d{2}$/.test(injected) ? injected : null;
}

/** Calendar date (YYYY-MM-DD) in the application timezone. */
export function currentAppDate(now: Date = new Date()): string {
  const injected = testClockDate();
  if (injected) return injected;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Deterministic asOf used when generating demo data. Never a runtime default. */
export function demoSeedAsOf(): string {
  return process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
}

/** Resolve product asOf without household context: explicit request → app clock. */
export function resolveAsOf(asOf?: string | null): string {
  return asOf ?? currentAppDate();
}

const demoAsOfCache = new Map<string, { value: string | null; at: number }>();
const DEMO_AS_OF_TTL_MS = 30_000;

/**
 * Resolve asOf for a household: explicit request → household demo asOf → app clock.
 *
 * Only households explicitly marked as demo (via seed) carry a frozen date.
 */
export async function resolveHouseholdAsOf(
  householdId: string,
  asOf?: string | null,
): Promise<string> {
  if (asOf) return asOf;
  const cached = demoAsOfCache.get(householdId);
  if (cached && Date.now() - cached.at < DEMO_AS_OF_TTL_MS) {
    return cached.value ?? currentAppDate();
  }
  let demoAsOf: string | null = null;
  try {
    const [row] = await getDb()
      .select({ demoAsOf: households.demoAsOf })
      .from(households)
      .where(eq(households.id, householdId))
      .limit(1);
    demoAsOf = row?.demoAsOf ?? null;
  } catch {
    demoAsOf = null;
  }
  demoAsOfCache.set(householdId, { value: demoAsOf, at: Date.now() });
  return demoAsOf ?? currentAppDate();
}

/** Test/seed helper: drop memoized household demo dates. */
export function clearHouseholdAsOfCache() {
  demoAsOfCache.clear();
}
