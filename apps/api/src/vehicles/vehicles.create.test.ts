import assert from "node:assert/strict";
import { requireTestDatabase } from "../testing/require-test-database";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { AuditService } from "../audit/audit.service";
import { clearHouseholdAsOfCache } from "../common/as-of";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import { accounts, financialEvents } from "../db/schema-economic";
import { vehicleFinanceAgreements } from "../db/schema-vehicles";
import { EconomicEventsService } from "../ledger/economic-events.service";
import { LedgerTruthService } from "../ledger/ledger-truth.service";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";
import { stubMerchantsService } from "../merchants/merchants.service.stub";
import { VehiclesService } from "./vehicles.service";

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
      name: "Vehicle test bank",
      accountType: "CHECKING",
      openingBalanceMinor: 500_000_00n,
      currentBalanceMinor: 500_000_00n,
      isShared: true,
    })
    .returning();

  const access = {
    requireCanWrite: async () => ({ household }),
    requireMembership: async () => ({ household }),
  } as unknown as ConstructorParameters<typeof VehiclesService>[0];

  const audit = new AuditService();
  const ledger = new LedgerTruthService(audit);
  const events = new EconomicEventsService(ledger, audit, stubMerchantsService());
  const vehicles = new VehiclesService(access, events, audit);
  const metrics = new HouseholdMetricsService();
  return { db, household, cash, vehicles, metrics };
}

const base = {
  name: "Testbil",
  make: "Volvo",
  model: "V60",
  modelYear: 2021,
  fuelType: "DIESEL" as const,
  currency: "SEK",
  purchaseDate: "2023-05-10",
};

async function periodTotals(householdId: string) {
  const [row] = await getDb()
    .select({
      income: sql<string>`coalesce(sum(${financialEvents.incomeAmountMinor}), 0)`,
      spending: sql<string>`coalesce(sum(${financialEvents.expenseAmountMinor}), 0)`,
    })
    .from(financialEvents)
    .where(eq(financialEvents.householdId, householdId));
  return {
    incomeMinor: BigInt(row?.income ?? "0"),
    spendingMinor: BigInt(row?.spending ?? "0"),
  };
}

test("onboarding an owned financed vehicle uses opening positions, not current-period flows", async () => {
  const fx = await setup("VC onboard");

  const detail = await fx.vehicles.create(USER_ID, {
    ...base,
    householdId: fx.household.id,
    acquisitionMode: "EXISTING",
    purchaseType: "FINANCED",
    purchasePriceMinor: "34000000",
    currentValueMinor: "25000000",
    outstandingDebtMinor: "15000000",
    financeLender: "Testbanken",
    financeInterestRateBps: 495,
    currentOdometerKm: 58_000,
  });

  assert.equal(detail.ownershipType, "FINANCED");
  assert.equal(detail.valuation.mid?.amountMinor, "25000000");
  assert.equal(detail.finance?.remaining.amountMinor, "15000000");
  // 250 000 − 150 000 − 5 000 selling cost
  assert.equal(detail.metrics.netEquity.amountMinor, "9500000");

  const totals = await periodTotals(fx.household.id);
  assert.equal(totals.incomeMinor, 0n, "onboarding must not create income");
  assert.equal(totals.spendingMinor, 0n, "onboarding must not create spending");

  const rows = await fx.db
    .select()
    .from(accounts)
    .where(eq(accounts.householdId, fx.household.id));
  const asset = rows.find((a) => a.accountType === "ASSET");
  const loan = rows.find((a) => a.accountType === "LOAN");
  assert.equal(asset?.openingBalanceMinor, 250_000_00n);
  assert.equal(loan?.openingBalanceMinor, 150_000_00n);

  const cashAfter = rows.find((a) => a.id === fx.cash.id);
  assert.equal(cashAfter?.openingBalanceMinor, 500_000_00n, "cash untouched");
});

test("cash purchase today moves cash into the asset without booking consumption", async () => {
  const fx = await setup("VC cash");

  const detail = await fx.vehicles.create(USER_ID, {
    ...base,
    name: "Kontantbil",
    householdId: fx.household.id,
    acquisitionMode: "NEW_PURCHASE",
    purchaseType: "CASH",
    purchaseDate: AS_OF,
    purchasePriceMinor: "9000000",
    currentValueMinor: "9000000",
    cashAccountId: fx.cash.id,
  });
  assert.equal(detail.ownershipType, "PRIVATE_OWNED");

  const totals = await periodTotals(fx.household.id);
  assert.equal(totals.spendingMinor, 0n, "a purchase is not consumption");
  assert.equal(totals.incomeMinor, 0n);

  const snapshot = await fx.metrics.getFinancialSnapshot(fx.household.id, "SEK", AS_OF);
  // Cash down 90 000, asset up 90 000 → net worth unchanged.
  assert.equal(snapshot.position.netWorth.amountMinor, 500_000_00n);
  assert.equal(snapshot.position.availableCash.amountMinor, 410_000_00n);
});

test("financed purchase today books debt, not income", async () => {
  const fx = await setup("VC financed");

  await fx.vehicles.create(USER_ID, {
    ...base,
    name: "Lånebil",
    householdId: fx.household.id,
    acquisitionMode: "NEW_PURCHASE",
    purchaseType: "FINANCED",
    purchaseDate: AS_OF,
    purchasePriceMinor: "30000000",
    currentValueMinor: "30000000",
    cashAccountId: fx.cash.id,
    downPaymentMinor: "5000000",
    outstandingDebtMinor: "25000000",
  });

  const totals = await periodTotals(fx.household.id);
  assert.equal(totals.incomeMinor, 0n, "loan proceeds are not income");
  assert.equal(totals.spendingMinor, 0n);

  const snapshot = await fx.metrics.getFinancialSnapshot(fx.household.id, "SEK", AS_OF);
  assert.equal(snapshot.position.availableCash.amountMinor, 450_000_00n);
  assert.equal(snapshot.position.netWorth.amountMinor, 500_000_00n);

  const [agreement] = await fx.db
    .select()
    .from(vehicleFinanceAgreements)
    .where(eq(vehicleFinanceAgreements.householdId, fx.household.id));
  assert.equal(agreement.remainingMinor, 250_000_00n);
});

test("private lease creates no asset or loan account", async () => {
  const fx = await setup("VC lease");

  const detail = await fx.vehicles.create(USER_ID, {
    ...base,
    name: "Leasingbil",
    householdId: fx.household.id,
    acquisitionMode: "NEW_PURCHASE",
    purchaseType: "PRIVATE_LEASE",
    purchasePriceMinor: "1",
    currentValueMinor: "0",
    leaseMonthlyCostMinor: "450000",
  });
  assert.equal(detail.ownershipType, "PRIVATE_LEASE");
  assert.equal(detail.linkedAssetAccountId, null);
  assert.equal(detail.linkedLoanAccountId, null);

  const rows = await fx.db
    .select()
    .from(accounts)
    .where(eq(accounts.householdId, fx.household.id));
  assert.equal(rows.filter((a) => a.accountType === "ASSET").length, 0);
  assert.equal(rows.filter((a) => a.accountType === "LOAN").length, 0);
});

test("vehicle edit updates valuation and odometer without touching the ledger", async () => {
  const fx = await setup("VC edit");

  const created = await fx.vehicles.create(USER_ID, {
    ...base,
    name: "Redigerbar",
    householdId: fx.household.id,
    acquisitionMode: "EXISTING",
    purchaseType: "CASH",
    purchasePriceMinor: "20000000",
    currentValueMinor: "15000000",
    currentOdometerKm: 40_000,
  });

  const updated = await fx.vehicles.update(USER_ID, created.id, {
    householdId: fx.household.id,
    name: "Redigerad",
    currentValueMinor: "14000000",
    currentOdometerKm: 44_000,
    annualKm: 12_000,
  });

  assert.equal(updated.name, "Redigerad");
  assert.equal(updated.valuation.mid?.amountMinor, "14000000");
  assert.equal(updated.usage.currentOdometerKm, 44_000);
  assert.equal(updated.usage.annualKm, 12_000);

  const totals = await periodTotals(fx.household.id);
  assert.equal(totals.spendingMinor, 0n);
  assert.equal(totals.incomeMinor, 0n);
});
