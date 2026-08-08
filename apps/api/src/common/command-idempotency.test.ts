import assert from "node:assert/strict";
import { test } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { requireTestDatabase } from "../testing/require-test-database";
import { AuditService } from "../audit/audit.service";
import { clearHouseholdAsOfCache } from "../common/as-of";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import {
  accountBalanceSnapshots,
  accounts,
  financialEvents,
} from "../db/schema-economic";
import { vehicles as vehiclesTable } from "../db/schema-vehicles";
import { AccountsService } from "../accounts/accounts.service";
import { EconomicEventsService } from "../ledger/economic-events.service";
import { LedgerTruthService } from "../ledger/ledger-truth.service";
import { stubMerchantsService } from "../merchants/merchants.service.stub";
import { VehiclesService } from "../vehicles/vehicles.service";

/**
 * The RT2-002 / RT2-003 matrix, exercised against a real database.
 *
 * These commands touch several tables each, so the interesting behaviour is
 * only observable through the database, never through a mock.
 */

const AS_OF = "2026-08-01";
const USER_ID = "00000000-0000-4000-8000-000000000001";

async function setup(label: string) {
  requireTestDatabase();
  const db = getDb();
  const [household] = await db
    .insert(households)
    .values({
      name: `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      baseCurrency: "SEK",
      demoAsOf: AS_OF,
    })
    .returning();
  clearHouseholdAsOfCache();

  const [cash] = await db
    .insert(accounts)
    .values({
      householdId: household.id,
      name: "Idem bank",
      accountType: "CHECKING",
      openingBalanceMinor: 1_000_000_00n,
      currentBalanceMinor: 1_000_000_00n,
      isShared: true,
    })
    .returning();

  const access = {
    requireCanWrite: async () => ({ household }),
    requireMembership: async () => ({ household }),
  } as never;

  const audit = new AuditService();
  const ledger = new LedgerTruthService(audit);
  const events = new EconomicEventsService(ledger, audit, stubMerchantsService());
  return {
    db,
    household,
    cash,
    events,
    accountsService: new AccountsService(access, audit, ledger),
    vehiclesService: new VehiclesService(access, events, audit),
  };
}

function accountInput(householdId: string, name: string) {
  return {
    householdId,
    name,
    accountType: "SAVINGS" as const,
    currency: "SEK" as const,
    isShared: true,
    openingBalanceMinor: "25000000",
  };
}

function vehicleInput(householdId: string, name: string) {
  return {
    householdId,
    name,
    make: "Volvo",
    model: "V60",
    modelYear: 2021,
    fuelType: "DIESEL" as const,
    currency: "SEK",
    acquisitionMode: "EXISTING" as const,
    purchaseType: "FINANCED" as const,
    purchaseDate: "2023-05-10",
    purchasePriceMinor: "28000000",
    currentValueMinor: "18000000",
    outstandingDebtMinor: "9000000",
    financeLender: "Testbank",
    currentOdometerKm: 82_000,
  };
}

async function countAccounts(householdId: string, name: string) {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(accounts)
    .where(and(eq(accounts.householdId, householdId), eq(accounts.name, name)));
  return row!.n;
}

test("same key + same request creates one account and one opening effect", async () => {
  const fx = await setup("Idem account retry");
  const input = accountInput(fx.household.id, "Buffert");
  const key = `acc-${Math.random().toString(36).slice(2)}`;

  const first = await fx.accountsService.create(USER_ID, input, {
    idempotencyKey: key,
  });
  const second = await fx.accountsService.create(USER_ID, input, {
    idempotencyKey: key,
  });

  assert.equal(first.id, second.id, "retry returns the original account");
  assert.equal(await countAccounts(fx.household.id, "Buffert"), 1);

  const snapshots = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(accountBalanceSnapshots)
    .where(eq(accountBalanceSnapshots.accountId, first.id));
  assert.equal(snapshots[0]!.n, 1, "one opening balance snapshot, not two");
});

test("same key + changed request is a conflict", async () => {
  const fx = await setup("Idem account conflict");
  const input = accountInput(fx.household.id, "Buffert");
  const key = `acc-${Math.random().toString(36).slice(2)}`;

  await fx.accountsService.create(USER_ID, input, { idempotencyKey: key });
  await assert.rejects(
    fx.accountsService.create(
      USER_ID,
      { ...input, openingBalanceMinor: "99999900" },
      { idempotencyKey: key },
    ),
    (err: { response?: { code?: string } }) =>
      err.response?.code === "IDEMPOTENCY_CONFLICT",
  );
  assert.equal(await countAccounts(fx.household.id, "Buffert"), 1);
});

test("different key + identical payload creates a second real account", async () => {
  const fx = await setup("Idem account distinct");
  const input = accountInput(fx.household.id, "Buffert");

  const first = await fx.accountsService.create(USER_ID, input, {
    idempotencyKey: `acc-a-${Math.random()}`,
  });
  const second = await fx.accountsService.create(USER_ID, input, {
    idempotencyKey: `acc-b-${Math.random()}`,
  });

  // Nothing in the domain forbids two savings accounts with the same name at
  // the same bank, so this is two intents and must produce two accounts.
  assert.notEqual(first.id, second.id);
  assert.equal(await countAccounts(fx.household.id, "Buffert"), 2);
});

test("concurrent same-key account creates collapse to one", async () => {
  const fx = await setup("Idem account concurrent");
  const input = accountInput(fx.household.id, "Samtidig");
  const key = `acc-conc-${Math.random().toString(36).slice(2)}`;

  const settled = await Promise.allSettled(
    Array.from({ length: 8 }, () =>
      fx.accountsService.create(USER_ID, input, { idempotencyKey: key }),
    ),
  );
  const ids = new Set(
    settled.flatMap((r) => (r.status === "fulfilled" ? [r.value.id] : [])),
  );

  assert.equal(await countAccounts(fx.household.id, "Samtidig"), 1);
  assert.equal(ids.size, 1, "every winner sees the same account");
});

test("vehicle retry does not duplicate any part of the aggregate", async () => {
  const fx = await setup("Idem vehicle retry");
  const input = vehicleInput(fx.household.id, "Retry Volvo");
  const key = `veh-${Math.random().toString(36).slice(2)}`;

  const first = await fx.vehiclesService.create(USER_ID, input, {
    idempotencyKey: key,
  });
  const second = await fx.vehiclesService.create(USER_ID, input, {
    idempotencyKey: key,
  });
  assert.equal(first.id, second.id);

  const [vehicleRows] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(vehiclesTable)
    .where(eq(vehiclesTable.householdId, fx.household.id));
  assert.equal(vehicleRows!.n, 1, "one vehicle");
  assert.equal(await countAccounts(fx.household.id, "Retry Volvo (fordon)"), 1);
  assert.equal(await countAccounts(fx.household.id, "Retry Volvo (billån)"), 1);
});

test("same key for two different command types does not collide", async () => {
  const fx = await setup("Idem cross type");
  const key = `shared-${Math.random().toString(36).slice(2)}`;

  const account = await fx.accountsService.create(
    USER_ID,
    accountInput(fx.household.id, "Delad"),
    { idempotencyKey: key },
  );
  const vehicle = await fx.vehiclesService.create(
    USER_ID,
    vehicleInput(fx.household.id, "Delad bil"),
    { idempotencyKey: key },
  );

  assert.ok(account.id);
  assert.ok(vehicle.id);
});

test("a failed command leaves no reservation behind", async () => {
  const fx = await setup("Idem rollback");
  const key = `rollback-${Math.random().toString(36).slice(2)}`;
  const broken = {
    ...vehicleInput(fx.household.id, "Trasig"),
    acquisitionMode: "NEW_PURCHASE" as const,
    cashAccountId: "00000000-0000-4000-8000-0000000000ff",
  };

  await assert.rejects(
    fx.vehiclesService.create(USER_ID, broken, { idempotencyKey: key }),
  );

  // The key must be reusable: nothing was created, so this is not a retry.
  const ok = await fx.vehiclesService.create(
    USER_ID,
    vehicleInput(fx.household.id, "Trasig"),
    { idempotencyKey: key },
  );
  assert.ok(ok.id);
  assert.equal(await countAccounts(fx.household.id, "Trasig (fordon)"), 1);
});

test("two same-shape ledger commands with different keys are both recorded", async () => {
  const fx = await setup("Idem ledger distinct");
  const savings = await fx.accountsService.create(USER_ID, {
    householdId: fx.household.id,
    name: "Sparkonto",
    accountType: "SAVINGS",
    currency: "SEK",
    isShared: true,
    openingBalanceMinor: "0",
  });

  const transfer = {
    householdId: fx.household.id,
    fromAccountId: fx.cash.id,
    toAccountId: savings.id,
    amountMinor: 10_000_00n,
    occurredOn: AS_OF,
    description: "Till sparkonto",
  };
  await fx.events.createInternalTransfer({
    ...transfer,
    idempotencyKey: `t1-${Math.random()}`,
  });
  await fx.events.createInternalTransfer({
    ...transfer,
    idempotencyKey: `t2-${Math.random()}`,
  });

  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(financialEvents)
    .where(
      and(
        eq(financialEvents.householdId, fx.household.id),
        eq(financialEvents.description, "Till sparkonto"),
      ),
    );
  assert.equal(row!.n, 2, "two intents, two events");
});

test("an HTTP retry without any externalId is still safe", async () => {
  const fx = await setup("Idem ledger retry");
  const savings = await fx.accountsService.create(USER_ID, {
    householdId: fx.household.id,
    name: "Sparkonto",
    accountType: "SAVINGS",
    currency: "SEK",
    isShared: true,
    openingBalanceMinor: "0",
  });

  const key = `retry-${Math.random().toString(36).slice(2)}`;
  const transfer = {
    householdId: fx.household.id,
    fromAccountId: fx.cash.id,
    toAccountId: savings.id,
    amountMinor: 2_500_00n,
    occurredOn: AS_OF,
    description: "Retryskydd",
    idempotencyKey: key,
  };
  const a = await fx.events.createInternalTransfer(transfer);
  const b = await fx.events.createInternalTransfer(transfer);
  assert.equal(a!.id, b!.id, "the retry resolves to the first event");
});

test("an explicit provider externalId still dedupes across command keys", async () => {
  const fx = await setup("Idem provider dedup");
  const savings = await fx.accountsService.create(USER_ID, {
    householdId: fx.household.id,
    name: "Sparkonto",
    accountType: "SAVINGS",
    currency: "SEK",
    isShared: true,
    openingBalanceMinor: "0",
  });

  const externalId = `bank-${Math.random().toString(36).slice(2)}`;
  const transfer = {
    householdId: fx.household.id,
    fromAccountId: fx.cash.id,
    toAccountId: savings.id,
    amountMinor: 700_00n,
    occurredOn: AS_OF,
    description: "Provider",
    externalId,
  };
  await fx.events.createInternalTransfer({
    ...transfer,
    idempotencyKey: `p1-${Math.random()}`,
  });
  await fx.events.createInternalTransfer({
    ...transfer,
    idempotencyKey: `p2-${Math.random()}`,
  });

  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(financialEvents)
    .where(
      and(
        eq(financialEvents.householdId, fx.household.id),
        eq(financialEvents.description, "Provider"),
      ),
    );
  assert.equal(row!.n, 1, "same source record, one event");
});
