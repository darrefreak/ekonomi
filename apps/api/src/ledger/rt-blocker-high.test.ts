import assert from "node:assert/strict";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { AuditService } from "../audit/audit.service";
import {
  clearHouseholdAsOfCache,
  currentAppDate,
  demoSeedAsOf,
  resolveAsOf,
  resolveHouseholdAsOf,
} from "../common/as-of";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import {
  accountBalanceSnapshots,
  accounts,
  financialCommandIdempotency,
  financialEvents,
  ledgerPostings,
} from "../db/schema-economic";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";
import { stubMerchantsService } from "../merchants/merchants.service.stub";
import { EconomicEventsService } from "./economic-events.service";
import { LedgerTruthService } from "./ledger-truth.service";

const AS_OF = "2026-08-01";

type Fixture = Awaited<ReturnType<typeof setup>>;

async function setup(label: string, demoAsOf?: string) {
  if (!process.env.DATABASE_URL) return null;
  const db = getDb();
  const [household] = await db
    .insert(households)
    .values({
      name: `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      baseCurrency: "SEK",
      demoAsOf: demoAsOf ?? null,
    })
    .returning();
  clearHouseholdAsOfCache();

  const mk = async (values: typeof accounts.$inferInsert) => {
    const [row] = await db.insert(accounts).values(values).returning();
    return row;
  };

  const cash = await mk({
    householdId: household.id,
    name: "RT Bank",
    accountType: "CHECKING",
    openingBalanceMinor: 500_000_00n,
    currentBalanceMinor: 500_000_00n,
    isShared: true,
  });
  const asset = await mk({
    householdId: household.id,
    name: "RT Asset",
    accountType: "ASSET",
    openingBalanceMinor: 200_000_00n,
    currentBalanceMinor: 200_000_00n,
    isShared: true,
  });
  const expense = await mk({
    householdId: household.id,
    name: "RT Expense",
    accountType: "EXPENSE",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    isShared: true,
    isSystem: true,
  });

  const audit = new AuditService();
  const ledger = new LedgerTruthService(audit);
  const events = new EconomicEventsService(ledger, audit, stubMerchantsService());
  const metrics = new HouseholdMetricsService();
  return { db, household, cash, asset, expense, events, metrics };
}

async function countEvents(householdId: string) {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(financialEvents)
    .where(eq(financialEvents.householdId, householdId));
  return Number(row?.n ?? 0);
}

async function countPostings(householdId: string) {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(ledgerPostings)
    .where(eq(ledgerPostings.householdId, householdId));
  return Number(row?.n ?? 0);
}

function expenseCommand(fx: NonNullable<Fixture>, amountMinor: bigint) {
  return {
    householdId: fx.household.id,
    cashAccountId: fx.cash.id,
    amountMinor,
    occurredOn: "2026-07-18",
    description: "Dubbeltryck",
  };
}

// ---------------------------------------------------------------------------
// RT-002 (BLOCKER) — Idempotency-Key must produce exactly one economic effect
// ---------------------------------------------------------------------------

test("B1 identical retry with the same Idempotency-Key creates one expense", async () => {
  const fx = await setup("RT B1");
  if (!fx) return;

  const first = await fx.events.createCashExpense({
    ...expenseCommand(fx, 1_000_00n),
    idempotencyKey: "b1-key",
  });
  const second = await fx.events.createCashExpense({
    ...expenseCommand(fx, 1_000_00n),
    idempotencyKey: "b1-key",
  });

  assert.equal(first.id, second.id, "retry must return the first event");
  assert.equal(await countEvents(fx.household.id), 1);
  assert.equal(await countPostings(fx.household.id), 2);

  const [record] = await fx.db
    .select()
    .from(financialCommandIdempotency)
    .where(eq(financialCommandIdempotency.householdId, fx.household.id));
  assert.equal(record.externalId, "b1-key");
  assert.equal(record.keySource, "idempotency_key");
});

test("B2 concurrent retries with the same key produce one economic effect", async () => {
  const fx = await setup("RT B2");
  if (!fx) return;

  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () =>
      fx.events.createCashExpense({
        ...expenseCommand(fx, 750_00n),
        idempotencyKey: "b2-key",
      }),
    ),
  );

  const ids = new Set(
    results.flatMap((r) => (r.status === "fulfilled" ? [r.value.id] : [])),
  );
  assert.ok(ids.size >= 1, "at least one submission must succeed");
  assert.equal(ids.size, 1, "all winners must resolve to the same event");
  assert.equal(await countEvents(fx.household.id), 1);
  assert.equal(await countPostings(fx.household.id), 2);
});

test("B3 same key with a different payload is rejected as a conflict", async () => {
  const fx = await setup("RT B3");
  if (!fx) return;

  await fx.events.createCashExpense({
    ...expenseCommand(fx, 1_000_00n),
    idempotencyKey: "b3-key",
  });

  await assert.rejects(
    () =>
      fx.events.createCashExpense({
        ...expenseCommand(fx, 2_000_00n),
        idempotencyKey: "b3-key",
      }),
    (err: unknown) => {
      const response = (err as { response?: { code?: string } }).response;
      assert.equal(response?.code, "IDEMPOTENCY_CONFLICT");
      return true;
    },
  );
  assert.equal(await countEvents(fx.household.id), 1);
});

test("B4 manual expense without externalId is still idempotent", async () => {
  const fx = await setup("RT B4");
  if (!fx) return;

  const command = { ...expenseCommand(fx, 1_500_00n), idempotencyKey: "b4-key" };
  assert.equal("externalId" in command, false);

  const a = await fx.events.createCashExpense(command);
  const b = await fx.events.createCashExpense(command);
  assert.equal(a.id, b.id);
  assert.equal(await countEvents(fx.household.id), 1);
});

test("B4b distinct keys still allow two genuinely different expenses", async () => {
  const fx = await setup("RT B4b");
  if (!fx) return;

  const a = await fx.events.createCashExpense({
    ...expenseCommand(fx, 55_00n),
    idempotencyKey: "b4b-1",
  });
  const b = await fx.events.createCashExpense({
    ...expenseCommand(fx, 55_00n),
    idempotencyKey: "b4b-2",
  });
  assert.notEqual(a.id, b.id);
  assert.equal(await countEvents(fx.household.id), 2);
});

test("idempotency keys are scoped to one household", async () => {
  const one = await setup("RT scope A");
  const two = await setup("RT scope B");
  if (!one || !two) return;

  await one.events.createCashExpense({
    ...expenseCommand(one, 300_00n),
    idempotencyKey: "shared-key",
  });
  await two.events.createCashExpense({
    ...expenseCommand(two, 300_00n),
    idempotencyKey: "shared-key",
  });

  assert.equal(await countEvents(one.household.id), 1);
  assert.equal(await countEvents(two.household.id), 1);
});

// ---------------------------------------------------------------------------
// RT-001 (HIGH) — demo asOf must not leak into real households
// ---------------------------------------------------------------------------

test("asOf: a real household resolves to the application clock", async () => {
  const fx = await setup("RT clock real");
  if (!fx) return;

  const resolved = await resolveHouseholdAsOf(fx.household.id);
  assert.equal(resolved, currentAppDate());
  assert.notEqual(
    resolved,
    demoSeedAsOf(),
    "a fresh household must not inherit the demo seed date",
  );
});

test("asOf: a demo household keeps its own frozen date", async () => {
  const demo = await setup("RT clock demo", AS_OF);
  if (!demo) return;
  assert.equal(await resolveHouseholdAsOf(demo.household.id), AS_OF);
});

test("asOf: two households in one process do not contaminate each other", async () => {
  const demo = await setup("RT clock demo2", AS_OF);
  const real = await setup("RT clock real2");
  if (!demo || !real) return;

  const demoAsOf = await resolveHouseholdAsOf(demo.household.id);
  const realAsOf = await resolveHouseholdAsOf(real.household.id);
  assert.equal(demoAsOf, AS_OF);
  assert.equal(realAsOf, currentAppDate());
  assert.notEqual(demoAsOf, realAsOf);
});

test("asOf: an explicit request asOf always wins", async () => {
  const demo = await setup("RT clock explicit", AS_OF);
  if (!demo) return;
  assert.equal(
    await resolveHouseholdAsOf(demo.household.id, "2025-03-31"),
    "2025-03-31",
  );
  assert.equal(resolveAsOf("2024-12-24"), "2024-12-24");
  assert.equal(resolveAsOf(), currentAppDate());
});

// ---------------------------------------------------------------------------
// RT-004 (HIGH) — net worth history must not double-count the asOf day
// ---------------------------------------------------------------------------

async function history(fx: NonNullable<Fixture>, asOf: string) {
  return fx.metrics.netWorthHistoryFromSnapshots(fx.household.id, "SEK", asOf);
}

test("NW1 the asOf day appears exactly once and matches the current position", async () => {
  const fx = await setup("RT NW1", AS_OF);
  if (!fx) return;

  // A second writer produces a competing snapshot set for the same day, which
  // is exactly what made the original series double.
  await history(fx, AS_OF);
  for (const account of [fx.cash, fx.asset]) {
    await fx.db.insert(accountBalanceSnapshots).values({
      householdId: fx.household.id,
      accountId: account.id,
      reportedBalanceMinor: account.openingBalanceMinor,
      availableBalanceMinor: account.openingBalanceMinor,
      ledgerCalculatedBalanceMinor: account.openingBalanceMinor,
      reconciledBalanceMinor: account.openingBalanceMinor,
      asOf: new Date(`${AS_OF}T12:00:00.000Z`),
      source: "ledger_reconstruct",
      confidence: "1",
      userVerified: false,
      isEstimated: false,
    });
  }

  const series = await history(fx, AS_OF);
  const dates = series.map((p) => p.asOf);
  assert.equal(new Set(dates).size, dates.length, "each bucket appears once");
  assert.equal(dates[dates.length - 1], AS_OF);

  const snapshot = await fx.metrics.getFinancialSnapshot(fx.household.id, "SEK", AS_OF);
  assert.equal(
    series[series.length - 1]!.netWorth.amountMinor,
    snapshot.position.netWorth.amountMinor.toString(),
    "final history bucket must equal the authoritative position",
  );
});

test("NW2 a mutation on the asOf day is counted exactly once", async () => {
  const fx = await setup("RT NW2", AS_OF);
  if (!fx) return;

  const before = await history(fx, AS_OF);
  const beforeFinal = BigInt(before[before.length - 1]!.netWorth.amountMinor);

  await fx.events.createCashExpense({
    householdId: fx.household.id,
    cashAccountId: fx.cash.id,
    amountMinor: 1_000_00n,
    occurredOn: AS_OF,
    description: "Same-day expense",
    idempotencyKey: "nw2-key",
  });

  const after = await history(fx, AS_OF);
  const afterFinal = BigInt(after[after.length - 1]!.netWorth.amountMinor);
  assert.equal(beforeFinal - afterFinal, 1_000_00n);
});

test("NW3 opening balances are not duplicated in the first bucket", async () => {
  const fx = await setup("RT NW3", AS_OF);
  if (!fx) return;

  const series = await history(fx, AS_OF);
  const opening = fx.cash.openingBalanceMinor + fx.asset.openingBalanceMinor;
  assert.equal(BigInt(series[0]!.netWorth.amountMinor), opening);
});

test("NW4 depreciation on the asOf day reduces net worth once", async () => {
  const fx = await setup("RT NW4", AS_OF);
  if (!fx) return;

  const before = await history(fx, AS_OF);
  const beforeFinal = BigInt(before[before.length - 1]!.netWorth.amountMinor);

  await fx.events.createAssetDepreciation({
    householdId: fx.household.id,
    assetAccountId: fx.asset.id,
    expenseAccountId: fx.expense.id,
    amountMinor: 5_000_00n,
    occurredOn: AS_OF,
    description: "Värdeminskning",
    idempotencyKey: "nw4-key",
  });

  const after = await history(fx, AS_OF);
  const afterFinal = BigInt(after[after.length - 1]!.netWorth.amountMinor);
  assert.equal(beforeFinal - afterFinal, 5_000_00n);
});

test("NW5 a snapshot written near midnight stays on its own calendar bucket", async () => {
  const fx = await setup("RT NW5", AS_OF);
  if (!fx) return;

  await history(fx, AS_OF);
  // 00:15 Europe/Stockholm on the asOf day is 22:15 UTC the day before; the
  // bucket key must follow the stored snapshot day, not drift a day back.
  await fx.db.insert(accountBalanceSnapshots).values({
    householdId: fx.household.id,
    accountId: fx.cash.id,
    reportedBalanceMinor: 1n,
    availableBalanceMinor: 1n,
    ledgerCalculatedBalanceMinor: 1n,
    reconciledBalanceMinor: 1n,
    asOf: new Date(`${AS_OF}T00:15:00.000+02:00`),
    source: "manual_opening",
    confidence: "1",
    userVerified: false,
    isEstimated: false,
  });

  const series = await history(fx, AS_OF);
  const dates = series.map((p) => p.asOf);
  assert.equal(new Set(dates).size, dates.length);
  assert.equal(dates[dates.length - 1], AS_OF);

  const snapshot = await fx.metrics.getFinancialSnapshot(fx.household.id, "SEK", AS_OF);
  assert.equal(
    series[series.length - 1]!.netWorth.amountMinor,
    snapshot.position.netWorth.amountMinor.toString(),
  );
});
