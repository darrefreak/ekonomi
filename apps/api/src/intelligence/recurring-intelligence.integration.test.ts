import assert from "node:assert/strict";
import test from "node:test";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "../db/client";
import { households, householdMembers, users } from "../db/schema";
import {
  accounts,
  financialEvents,
  ledgerPostings,
  sourceTransactions,
} from "../db/schema-economic";
import { expectedTransactions, recurringItems } from "../db/schema-planning";
import { requireTestDatabase } from "../testing/require-test-database";
import { HouseholdAccessService } from "../households/household-access.service";
import { RecurringIntelligenceService } from "./recurring-intelligence.service";
import { TransactionClusteringService } from "./transaction-clustering.service";

/**
 * Recurring streams, subscriptions, price intelligence and expected
 * transactions against a real database.
 *
 * The scenarios here are the acceptance bar: a monthly subscription becomes a
 * persisted high-confidence stream with a projected window; a 28-day charge is
 * EVERY_4_WEEKS and never MONTHLY; groceries never become recurring however
 * often they occur; a price rise is history on the same stream rather than a
 * new one; an expectation is fulfilled by a real import and a missing salary
 * is flagged only after its window — then resolved when the money arrives.
 * And through all of it, not one ledger posting or financial event is written.
 */

requireTestDatabase();

const suffix = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const access = new HouseholdAccessService();
const clustering = new TransactionClusteringService(access);
const recurring = new RecurringIntelligenceService(access);

/** The frozen household clock every scenario is written against. */
const AS_OF = "2026-08-11";

async function fixture() {
  const db = getDb();
  const [household] = await db
    .insert(households)
    .values({ name: `Recurring ${suffix()}`, baseCurrency: "SEK", demoAsOf: AS_OF })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      email: `recurring-${suffix()}@example.test`,
      passwordHash: "x".repeat(60),
      displayName: "Återkommande",
    })
    .returning();
  await db.insert(householdMembers).values({
    householdId: household.id,
    userId: user.id,
    role: "OWNER",
  });
  const [account] = await db
    .insert(accounts)
    .values({
      householdId: household.id,
      name: "Lönekonto",
      accountType: "CHECKING",
      currency: "SEK",
    })
    .returning();
  return { db, household, user, account };
}

async function insertOccurrences(
  db: ReturnType<typeof getDb>,
  householdId: string,
  accountId: string,
  text: string,
  occurrences: Array<{ date: string; amountMinor: bigint }>,
) {
  for (const occurrence of occurrences) {
    await db.insert(sourceTransactions).values({
      householdId,
      accountId,
      bookingDate: occurrence.date,
      amountMinor: occurrence.amountMinor,
      currency: "SEK",
      description: text,
      rawDescription: text,
    });
  }
}

/** N dates on the same day of consecutive months, ending at `lastMonth`. */
function monthlyDates(count: number, lastYear: number, lastMonth: number, day: number) {
  const dates: string[] = [];
  let year = lastYear;
  let month = lastMonth;
  for (let i = 0; i < count; i += 1) {
    dates.unshift(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return dates;
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

async function analyse(userId: string, householdId: string) {
  await clustering.analyse(userId, householdId);
  return recurring.runPipeline(householdId);
}

async function streamsOf(db: ReturnType<typeof getDb>, householdId: string) {
  return db
    .select()
    .from(recurringItems)
    .where(
      and(eq(recurringItems.householdId, householdId), isNotNull(recurringItems.signature)),
    );
}

void test("a monthly subscription becomes a high-confidence stream with a projected window (§43)", async () => {
  const { db, household, user, account } = await fixture();
  await insertOccurrences(
    db,
    household.id,
    account.id,
    "NETFLIX.COM",
    monthlyDates(15, 2026, 8, 4).map((date) => ({ date, amountMinor: -21_900n })),
  );

  const result = await analyse(user.id, household.id);
  assert.ok(result.recurringStreams >= 1);

  const [stream] = await streamsOf(db, household.id);
  assert.ok(stream, "the stream is persisted");
  assert.equal(stream.cadence, "MONTHLY");
  assert.equal(stream.recurringType, "SUBSCRIPTION");
  assert.equal(stream.isSubscription, true);
  assert.equal(stream.direction, "OUTFLOW");
  assert.equal(stream.occurrenceCount, 15);
  assert.equal(stream.amountMinor, 21_900n);
  assert.ok(Number(stream.confidence) >= 0.75, `confidence ${stream.confidence}`);
  assert.ok((stream.evidence as string[]).length > 0, "the stream carries its evidence");

  const expectations = await db
    .select()
    .from(expectedTransactions)
    .where(eq(expectedTransactions.householdId, household.id));
  assert.equal(expectations.length, 1, "one open expectation");
  const [expectation] = expectations;
  assert.equal(expectation.status, "PENDING");
  assert.ok(expectation.expectedFrom > "2026-08-11", "the next window is in the future");
  assert.ok(expectation.expectedFrom <= expectation.expectedTo, "a window, not a point");
  assert.equal(expectation.expectedAmountMinor, 21_900n);
});

void test("a 28-day charge is EVERY_4_WEEKS, never MONTHLY (§44)", async () => {
  const { db, household, user, account } = await fixture();
  let date = "2026-01-05";
  const occurrences: Array<{ date: string; amountMinor: bigint }> = [];
  for (let i = 0; i < 8; i += 1) {
    occurrences.push({ date, amountMinor: -21_900n });
    date = addDays(date, 28);
  }
  await insertOccurrences(db, household.id, account.id, "ZZTRANING KLUBB AB", occurrences);

  await analyse(user.id, household.id);
  const [stream] = await streamsOf(db, household.id);
  assert.ok(stream);
  assert.equal(stream.cadence, "EVERY_4_WEEKS", "13 yearly payments are not 12");
  assert.equal(stream.medianIntervalDays, 28);
});

void test("a twice-yearly bill is SEMIANNUAL, never ANNUAL (§45)", async () => {
  const { db, household, user, account } = await fixture();
  await insertOccurrences(db, household.id, account.id, "ZZVAGAVGIFT HALVAR AB", [
    { date: "2024-02-15", amountMinor: -320_000n },
    { date: "2024-08-15", amountMinor: -320_000n },
    { date: "2025-02-14", amountMinor: -320_000n },
    { date: "2025-08-15", amountMinor: -320_000n },
    { date: "2026-02-16", amountMinor: -320_000n },
  ]);

  await analyse(user.id, household.id);
  const [stream] = await streamsOf(db, household.id);
  assert.ok(stream);
  assert.equal(stream.cadence, "SEMIANNUAL");
});

void test("varying electricity is a recurring utility, not a subscription, with no price alert (§46)", async () => {
  const { db, household, user, account } = await fixture();
  // Winter-heavy seasonality, always around the 5th.
  const amounts = [-270_000n, -250_000n, -210_000n, -160_000n, -120_000n, -90_000n, -80_000n, -90_000n, -110_000n, -170_000n, -230_000n, -260_000n];
  await insertOccurrences(
    db,
    household.id,
    account.id,
    "VATTENFALL AB",
    monthlyDates(12, 2026, 8, 5).map((date, index) => ({
      date,
      amountMinor: amounts[index]!,
    })),
  );

  await analyse(user.id, household.id);
  const [stream] = await streamsOf(db, household.id);
  assert.ok(stream, "the utility is a real recurring stream");
  assert.equal(stream.cadence, "MONTHLY", "the schedule is monthly");
  assert.equal(stream.recurringType, "UTILITY_BILL");
  assert.equal(stream.isSubscription, false, "a utility is not a subscription");
  assert.equal(
    (stream.priceChanges as unknown[]).length,
    0,
    "seasonal variation is not a price increase",
  );
  assert.equal(stream.annualPriceImpactMinor, null);
});

void test("frequent irregular groceries never become a fixed recurring stream (§47)", async () => {
  const { db, household, user, account } = await fixture();
  await insertOccurrences(db, household.id, account.id, "ICA SUPERMARKET STAN", [
    { date: "2026-05-02", amountMinor: -45_000n },
    { date: "2026-05-05", amountMinor: -121_000n },
    { date: "2026-05-16", amountMinor: -33_000n },
    { date: "2026-06-01", amountMinor: -210_000n },
    { date: "2026-06-03", amountMinor: -15_000n },
    { date: "2026-06-20", amountMinor: -88_000n },
    { date: "2026-07-08", amountMinor: -64_000n },
    { date: "2026-07-11", amountMinor: -142_000n },
  ]);

  await analyse(user.id, household.id);
  const streams = await streamsOf(db, household.id);
  for (const stream of streams) {
    assert.equal(
      stream.cadence,
      "VARIABLE_RECURRING",
      "many occurrences with no schedule must not get a fixed cadence",
    );
    assert.equal(stream.isSubscription, false);
  }
  const expectations = await db
    .select()
    .from(expectedTransactions)
    .where(eq(expectedTransactions.householdId, household.id));
  assert.equal(expectations.length, 0, "nothing is projected from an irregular pattern");
});

void test("a price rise is history on the same stream, not a new subscription (§48)", async () => {
  const { db, household, user, account } = await fixture();
  const dates = monthlyDates(12, 2026, 8, 4);
  const amounts = [
    ...Array.from({ length: 6 }, () => -17_900n),
    ...Array.from({ length: 3 }, () => -19_900n),
    ...Array.from({ length: 3 }, () => -21_900n),
  ];
  await insertOccurrences(
    db,
    household.id,
    account.id,
    "SPOTIFY AB",
    dates.map((date, index) => ({ date, amountMinor: amounts[index]! })),
  );

  await analyse(user.id, household.id);
  const streams = await streamsOf(db, household.id);
  assert.equal(streams.length, 1, "one stream despite three price regimes");
  const [stream] = streams;
  assert.equal(stream.amountMinor, 21_900n, "the current price is in force");
  assert.equal(stream.originalAmountMinor, 17_900n);
  const changes = stream.priceChanges;
  assert.equal(changes.length, 2, "179→199 and 199→219");
  assert.equal(changes[0]!.fromMinor, "17900");
  assert.equal(changes[0]!.toMinor, "19900");
  assert.equal(changes[1]!.fromMinor, "19900");
  assert.equal(changes[1]!.toMinor, "21900");
  // (219 − 179) kr × 12 months = 480 kr/year, exactly.
  assert.equal(stream.annualPriceImpactMinor, 48_000n);
});

void test("an actual import inside the window fulfils the expectation without duplicating data (§49)", async () => {
  const { db, household, user, account } = await fixture();
  await insertOccurrences(
    db,
    household.id,
    account.id,
    "NETFLIX.COM",
    monthlyDates(12, 2026, 8, 4).map((date) => ({ date, amountMinor: -21_900n })),
  );
  await analyse(user.id, household.id);

  const [expectation] = await db
    .select()
    .from(expectedTransactions)
    .where(eq(expectedTransactions.householdId, household.id));
  assert.ok(expectation);
  assert.equal(expectation.status, "PENDING");
  assert.ok(
    expectation.expectedFrom.startsWith("2026-09"),
    "next charge expected in September",
  );

  // The real September charge arrives, inside the window and the amount range.
  await insertOccurrences(db, household.id, account.id, "NETFLIX.COM", [
    { date: expectation.expectedFrom, amountMinor: -21_900n },
  ]);
  const transactionCountBefore = await db
    .select()
    .from(sourceTransactions)
    .where(eq(sourceTransactions.householdId, household.id));

  await analyse(user.id, household.id);

  const fulfilled = await db
    .select()
    .from(expectedTransactions)
    .where(
      and(
        eq(expectedTransactions.householdId, household.id),
        eq(expectedTransactions.status, "FULFILLED"),
      ),
    );
  assert.equal(fulfilled.length, 1, "the expectation is fulfilled");
  assert.ok(fulfilled[0]!.matchedTransactionId, "and points at the real transaction");

  const transactionCountAfter = await db
    .select()
    .from(sourceTransactions)
    .where(eq(sourceTransactions.householdId, household.id));
  assert.equal(
    transactionCountAfter.length,
    transactionCountBefore.length,
    "matching created no financial data",
  );
});

void test("a confidently expected salary is flagged missing only after its window, and a late arrival resolves it (§50, §24)", async () => {
  const { db, household, user, account } = await fixture();
  // Salary on the 25th, every month — but July never arrived.
  await insertOccurrences(
    db,
    household.id,
    account.id,
    "LÖN ARBETSGIVAREN AB",
    monthlyDates(11, 2026, 6, 25).map((date) => ({ date, amountMinor: 6_800_000n })),
  );

  await analyse(user.id, household.id);
  const [stream] = await streamsOf(db, household.id);
  assert.ok(stream);
  assert.equal(stream.direction, "INFLOW");
  assert.equal(stream.recurringType, "SALARY");
  assert.equal(stream.isSubscription, false, "a salary is never a subscription");

  const missed = await db
    .select()
    .from(expectedTransactions)
    .where(
      and(
        eq(expectedTransactions.householdId, household.id),
        eq(expectedTransactions.status, "MISSED"),
      ),
    );
  assert.equal(missed.length, 1, "the July salary window has passed with grace");
  assert.ok(missed[0]!.expectedFrom.startsWith("2026-07"));

  const surface = await recurring.expectedUpcoming(user.id, household.id);
  assert.equal(surface.missing.length, 1);
  assert.match(surface.missing[0]!.message, /har inte identifierats ännu/);
  assert.match(surface.missing[0]!.message, /lön/i);

  // The salary arrives late.
  await insertOccurrences(db, household.id, account.id, "LÖN ARBETSGIVAREN AB", [
    { date: "2026-08-05", amountMinor: 6_800_000n },
  ]);
  await analyse(user.id, household.id);

  const stillMissing = await db
    .select()
    .from(expectedTransactions)
    .where(
      and(
        eq(expectedTransactions.householdId, household.id),
        eq(expectedTransactions.status, "MISSED"),
      ),
    );
  assert.equal(stillMissing.length, 0, "no stale warning after the money arrived");
});

void test("the household's 'not recurring' answer survives every rerun (§51)", async () => {
  const { db, household, user, account } = await fixture();
  await insertOccurrences(
    db,
    household.id,
    account.id,
    "ZZKLUBB MANADSVIS AB",
    monthlyDates(8, 2026, 8, 10).map((date) => ({ date, amountMinor: -30_000n })),
  );
  await analyse(user.id, household.id);

  const [stream] = await streamsOf(db, household.id);
  assert.ok(stream);
  await recurring.verify(user.id, {
    householdId: household.id,
    recurringId: stream.id,
    status: "DISMISSED",
  });

  await analyse(user.id, household.id);
  await analyse(user.id, household.id);

  const [after] = await streamsOf(db, household.id);
  assert.equal(after.status, "DISMISSED", "the detector does not overrule the household");
  assert.equal(after.userVerified, true);
  const expectations = await db
    .select()
    .from(expectedTransactions)
    .where(eq(expectedTransactions.householdId, household.id));
  assert.equal(
    expectations.filter((e) => e.status === "PENDING").length,
    0,
    "a dismissed stream projects nothing",
  );
});

void test("marking a detected subscription as 'not a subscription' sticks (§11)", async () => {
  const { db, household, user, account } = await fixture();
  await insertOccurrences(
    db,
    household.id,
    account.id,
    "NETFLIX.COM",
    monthlyDates(10, 2026, 8, 4).map((date) => ({ date, amountMinor: -21_900n })),
  );
  await analyse(user.id, household.id);
  const [stream] = await streamsOf(db, household.id);
  assert.equal(stream.isSubscription, true);

  await recurring.verify(user.id, {
    householdId: household.id,
    recurringId: stream.id,
    isSubscription: false,
  });
  await analyse(user.id, household.id);

  const [after] = await streamsOf(db, household.id);
  assert.equal(after.isSubscription, false, "the user's answer outranks the detector");
  assert.equal(after.userMarkedSubscription, false);
});

void test("running the pipeline three times duplicates nothing (§52)", async () => {
  const { db, household, user, account } = await fixture();
  await insertOccurrences(
    db,
    household.id,
    account.id,
    "NETFLIX.COM",
    monthlyDates(12, 2026, 8, 4).map((date) => ({ date, amountMinor: -21_900n })),
  );
  await insertOccurrences(
    db,
    household.id,
    account.id,
    "LÖN ARBETSGIVAREN AB",
    monthlyDates(12, 2026, 7, 25).map((date) => ({ date, amountMinor: 6_800_000n })),
  );

  const first = await analyse(user.id, household.id);
  const second = await analyse(user.id, household.id);
  const third = await analyse(user.id, household.id);

  assert.equal(second.recurringStreams, first.recurringStreams);
  assert.equal(third.recurringStreams, first.recurringStreams);
  assert.equal(third.subscriptions, first.subscriptions);

  const streams = await streamsOf(db, household.id);
  assert.equal(streams.length, first.recurringStreams, "stream rows equal reported count");
  const expectations = await db
    .select()
    .from(expectedTransactions)
    .where(eq(expectedTransactions.householdId, household.id));
  const byStream = new Map<string, number>();
  for (const expectation of expectations.filter((e) => e.status === "PENDING")) {
    byStream.set(
      expectation.recurringItemId,
      (byStream.get(expectation.recurringItemId) ?? 0) + 1,
    );
  }
  for (const [, count] of byStream) {
    assert.equal(count, 1, "at most one open expectation per stream");
  }
});

void test("recurring processing writes no postings, no events and no balance change (§53)", async () => {
  const { db, household, user, account } = await fixture();
  await insertOccurrences(
    db,
    household.id,
    account.id,
    "NETFLIX.COM",
    monthlyDates(12, 2026, 8, 4).map((date) => ({ date, amountMinor: -21_900n })),
  );

  const postingsBefore = await db
    .select()
    .from(ledgerPostings)
    .where(eq(ledgerPostings.householdId, household.id));
  const eventsBefore = await db
    .select()
    .from(financialEvents)
    .where(eq(financialEvents.householdId, household.id));
  const [accountBefore] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, account.id));

  await analyse(user.id, household.id);
  await analyse(user.id, household.id);

  const postingsAfter = await db
    .select()
    .from(ledgerPostings)
    .where(eq(ledgerPostings.householdId, household.id));
  const eventsAfter = await db
    .select()
    .from(financialEvents)
    .where(eq(financialEvents.householdId, household.id));
  const [accountAfter] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, account.id));

  assert.equal(postingsAfter.length, postingsBefore.length, "no ledger postings");
  assert.equal(eventsAfter.length, eventsBefore.length, "no financial events");
  assert.equal(
    accountAfter.currentBalanceMinor,
    accountBefore.currentBalanceMinor,
    "no balance change",
  );
});

void test("recurring data is invisible and unwritable across households (§54)", async () => {
  const first = await fixture();
  const second = await fixture();
  await insertOccurrences(
    first.db,
    first.household.id,
    first.account.id,
    "NETFLIX.COM",
    monthlyDates(10, 2026, 8, 4).map((date) => ({ date, amountMinor: -21_900n })),
  );
  await analyse(first.user.id, first.household.id);
  const [stream] = await streamsOf(first.db, first.household.id);

  // Reading another household's overview fails at membership.
  await assert.rejects(() => recurring.overview(second.user.id, first.household.id));
  await assert.rejects(() =>
    recurring.expectedUpcoming(second.user.id, first.household.id),
  );

  // Writing across households fails even with a valid stream id.
  await assert.rejects(() =>
    recurring.verify(second.user.id, {
      householdId: second.household.id,
      recurringId: stream.id,
      status: "DISMISSED",
    }),
  );

  const [untouched] = await streamsOf(first.db, first.household.id);
  assert.equal(untouched.status, stream.status);
  assert.equal(untouched.userVerified, false);

  // The second household sees none of it.
  const otherOverview = await recurring.overview(second.user.id, second.household.id);
  assert.equal(otherOverview.counts.streams, 0);
});
