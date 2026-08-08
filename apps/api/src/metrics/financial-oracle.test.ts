import assert from "node:assert/strict";
import { test } from "node:test";
import { and, eq } from "drizzle-orm";
import { AuditService } from "../audit/audit.service";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import {
  accounts,
  financialEvents,
  ledgerEntries,
  ledgerPostings,
} from "../db/schema-economic";
import { DebtService } from "../debt/debt.service";
import type { HouseholdAccessService } from "../households/household-access.service";
import { EconomicEventsService } from "../ledger/economic-events.service";
import { LedgerTruthService } from "../ledger/ledger-truth.service";
import { stubMerchantsService } from "../merchants/merchants.service.stub";
import { requireTestDatabase } from "../testing/require-test-database";
import { HouseholdMetricsService } from "./household-metrics.service";

/**
 * Independent economic oracle over the real ledger.
 *
 * RT2-001 survived every consistency test in this repository because the tests
 * compared product surfaces with each other, and all of them read the same
 * aggregation. The oracle below is deliberately an outsider: it reads accounts
 * and postings out of Postgres and does the arithmetic here, restating the
 * canonical sign convention instead of importing it, so it cannot inherit the
 * bug it is meant to catch. `bucketBalancesForNetWorth`, `calculateNetWorth`,
 * `netWorthFromTypedBalances` and `getFinancialSnapshot` are never called to
 * produce an expectation.
 *
 * `packages/financial-engine/src/account-sign.test.ts` does the same at the pure
 * arithmetic level. This file covers the part that only a database can: real
 * postings, real opening balances, and the debt surface that a household reads.
 */

const AS_OF = "2026-08-01";

const CASH_TYPES = new Set(["CHECKING", "SAVINGS", "CASH"]);
const INVESTMENT_TYPES = new Set(["INVESTMENT", "PENSION", "CRYPTO"]);
const ASSET_TYPES = new Set(["ASSET"]);
const LIABILITY_TYPES = new Set(["MORTGAGE", "LOAN", "CREDIT_CARD"]);
const NOMINAL_TYPES = new Set(["EXPENSE", "INCOME"]);

type OraclePosition = {
  cashMinor: bigint;
  investmentsMinor: bigint;
  assetsMinor: bigint;
  /** Signed: positive is owed, negative is a credit in the household's favour. */
  liabilitiesMinor: bigint;
  /** What the household actually owes, i.e. credits do not count as negative debt. */
  owedMinor: bigint;
  netWorthMinor: bigint;
};

/**
 * Recompute the household's position from raw rows.
 *
 * Asset and nominal accounts: a debit raises the balance, a credit lowers it.
 * Liability accounts: a credit raises what is owed and a debit lowers it, and
 * the result stays signed. Net worth is then assets − liabilities with no
 * absolute value anywhere.
 */
async function oraclePosition(
  householdId: string,
  asOf: string,
): Promise<OraclePosition> {
  const db = getDb();
  const accountRows = await db
    .select({
      id: accounts.id,
      accountType: accounts.accountType,
      openingBalanceMinor: accounts.openingBalanceMinor,
      isSystem: accounts.isSystem,
    })
    .from(accounts)
    .where(eq(accounts.householdId, householdId));

  const postingRows = await db
    .select({
      accountId: ledgerPostings.accountId,
      side: ledgerPostings.side,
      amountMinor: ledgerPostings.amountMinor,
      bookedOn: ledgerEntries.bookedOn,
    })
    .from(ledgerPostings)
    .innerJoin(ledgerEntries, eq(ledgerPostings.ledgerEntryId, ledgerEntries.id))
    .innerJoin(
      financialEvents,
      eq(ledgerEntries.financialEventId, financialEvents.id),
    )
    .where(
      and(
        eq(ledgerPostings.householdId, householdId),
        eq(financialEvents.status, "ACTIVE"),
      ),
    );

  const typeById = new Map<string, string>();
  const balances = new Map<string, bigint>();
  for (const row of accountRows) {
    if (row.isSystem) continue;
    typeById.set(row.id, row.accountType);
    balances.set(row.id, row.openingBalanceMinor ?? 0n);
  }

  for (const posting of postingRows) {
    const accountType = typeById.get(posting.accountId);
    if (!accountType) continue;
    if (posting.bookedOn > asOf) continue;
    const amount = BigInt(posting.amountMinor);
    let signed = posting.side === "debit" ? amount : -amount;
    if (LIABILITY_TYPES.has(accountType)) signed = -signed;
    balances.set(posting.accountId, (balances.get(posting.accountId) ?? 0n) + signed);
  }

  let cashMinor = 0n;
  let investmentsMinor = 0n;
  let assetsMinor = 0n;
  let liabilitiesMinor = 0n;
  let owedMinor = 0n;
  for (const [accountId, balance] of balances) {
    const accountType = typeById.get(accountId)!;
    if (NOMINAL_TYPES.has(accountType)) continue;
    if (CASH_TYPES.has(accountType)) cashMinor += balance;
    else if (INVESTMENT_TYPES.has(accountType)) investmentsMinor += balance;
    else if (ASSET_TYPES.has(accountType)) assetsMinor += balance;
    else if (LIABILITY_TYPES.has(accountType)) {
      liabilitiesMinor += balance;
      if (balance > 0n) owedMinor += balance;
    } else {
      throw new Error(`oracle cannot classify account type ${accountType}`);
    }
  }

  return {
    cashMinor,
    investmentsMinor,
    assetsMinor,
    liabilitiesMinor,
    owedMinor,
    netWorthMinor: cashMinor + investmentsMinor + assetsMinor - liabilitiesMinor,
  };
}

async function setup() {
  requireTestDatabase();
  const db = getDb();
  const [household] = await db
    .insert(households)
    .values({ name: `Oracle ${Date.now()}`, baseCurrency: "SEK" })
    .returning();

  const mk = async (values: typeof accounts.$inferInsert) => {
    const [row] = await db.insert(accounts).values(values).returning();
    return row;
  };

  const cash = await mk({
    householdId: household.id,
    name: "Oracle Lönekonto",
    accountType: "CHECKING",
    openingBalanceMinor: 250_000_00n,
    currentBalanceMinor: 250_000_00n,
    isShared: true,
  });
  const investment = await mk({
    householdId: household.id,
    name: "Oracle ISK",
    accountType: "INVESTMENT",
    openingBalanceMinor: 400_000_00n,
    currentBalanceMinor: 400_000_00n,
    isShared: true,
  });
  const home = await mk({
    householdId: household.id,
    name: "Oracle Bostad",
    accountType: "ASSET",
    openingBalanceMinor: 4_000_000_00n,
    currentBalanceMinor: 4_000_000_00n,
    isShared: true,
  });
  const mortgage = await mk({
    householdId: household.id,
    name: "Oracle Bolån",
    accountType: "MORTGAGE",
    openingBalanceMinor: 3_000_000_00n,
    currentBalanceMinor: 3_000_000_00n,
    interestRateBps: 300,
    isShared: true,
  });
  const vehicleLoan = await mk({
    householdId: household.id,
    name: "Oracle Billån",
    accountType: "LOAN",
    openingBalanceMinor: 150_000_00n,
    currentBalanceMinor: 150_000_00n,
    interestRateBps: 550,
    isShared: true,
  });
  const card = await mk({
    householdId: household.id,
    name: "Oracle Kreditkort",
    accountType: "CREDIT_CARD",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    isShared: true,
  });
  const expenseBook = await mk({
    householdId: household.id,
    name: "Oracle Utgiftsbok",
    accountType: "EXPENSE",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    isShared: true,
    isSystem: true,
  });

  const access = {
    requireMembership: async () => ({
      household,
      member: { id: "member", role: "OWNER" },
    }),
    requireCanWrite: async () => ({
      household,
      member: { id: "member", role: "OWNER" },
    }),
    accountVisibility: async () => "full" as const,
    projectAccountListItem: <T>(item: T) => item,
    projectTransactionItem: <T>(item: T) => item,
  } as unknown as HouseholdAccessService;

  const audit = new AuditService();
  const ledger = new LedgerTruthService(audit);
  const events = new EconomicEventsService(ledger, audit, stubMerchantsService());
  const metrics = new HouseholdMetricsService();
  const debt = new DebtService(access, metrics);

  return {
    household,
    cash,
    investment,
    home,
    mortgage,
    vehicleLoan,
    card,
    expenseBook,
    events,
    metrics,
    debt,
  };
}

async function productNetWorth(
  metrics: HouseholdMetricsService,
  householdId: string,
): Promise<bigint> {
  const snap = await metrics.getFinancialSnapshot(householdId, "SEK", AS_OF);
  return snap.position.netWorth.amountMinor;
}

/** Product and oracle must agree at every step, not only at the end. */
async function assertAgrees(
  ctx: Awaited<ReturnType<typeof setup>>,
  label: string,
): Promise<bigint> {
  const oracle = await oraclePosition(ctx.household.id, AS_OF);
  const snap = await ctx.metrics.getFinancialSnapshot(
    ctx.household.id,
    "SEK",
    AS_OF,
  );
  assert.equal(
    snap.position.netWorth.amountMinor,
    oracle.netWorthMinor,
    `${label}: net worth disagrees with the independent oracle`,
  );
  assert.equal(
    snap.position.availableCash.amountMinor,
    oracle.cashMinor,
    `${label}: cash disagrees with the independent oracle`,
  );
  assert.equal(
    snap.position.investments.amountMinor,
    oracle.investmentsMinor,
    `${label}: investments disagree with the independent oracle`,
  );
  assert.equal(
    snap.position.assets.amountMinor,
    oracle.assetsMinor,
    `${label}: assets disagree with the independent oracle`,
  );
  assert.equal(
    snap.position.liabilities.amountMinor,
    oracle.liabilitiesMinor,
    `${label}: liabilities are not the signed economic position`,
  );
  return oracle.netWorthMinor;
}

test("oracle — opening positions across every account class", async () => {
  const ctx = await setup();
  const netWorth = await assertAgrees(ctx, "openings");
  // 250 000 + 400 000 + 4 000 000 − (3 000 000 + 150 000 + 0), by hand.
  assert.equal(netWorth, 1_500_000_00n);
});

test("oracle — liability matrix: card purchase, repayment, overpayment", async () => {
  const ctx = await setup();
  const opening = await assertAgrees(ctx, "openings");

  await ctx.events.createCreditCardPurchase({
    householdId: ctx.household.id,
    creditCardAccountId: ctx.card.id,
    expenseAccountId: ctx.expenseBook.id,
    amountMinor: 1_000_00n,
    occurredOn: AS_OF,
  });
  const afterPurchase = await assertAgrees(ctx, "card purchase");
  assert.equal(
    afterPurchase - opening,
    -1_000_00n,
    "a card purchase is consumption, so it lowers net worth by its amount",
  );

  await ctx.events.createCreditCardPayment({
    householdId: ctx.household.id,
    cashAccountId: ctx.cash.id,
    creditCardAccountId: ctx.card.id,
    amountMinor: 1_000_00n,
    occurredOn: AS_OF,
  });
  const afterPayment = await assertAgrees(ctx, "card paid in full");
  assert.equal(
    afterPayment,
    afterPurchase,
    "paying a card moves cash and debt together, so net worth is unchanged",
  );

  // Overpayment: the card now holds a credit in the household's favour. This is
  // the RT2-001 case, where taking the magnitude cost twice the credit.
  await ctx.events.createCreditCardPayment({
    householdId: ctx.household.id,
    cashAccountId: ctx.cash.id,
    creditCardAccountId: ctx.card.id,
    amountMinor: 2_000_00n,
    occurredOn: AS_OF,
  });
  const afterOverpay = await assertAgrees(ctx, "card overpaid");
  assert.equal(
    afterOverpay,
    afterPayment,
    "overpaying a card is a transfer, not a loss: net worth must not move",
  );

  const oracle = await oraclePosition(ctx.household.id, AS_OF);
  assert.equal(
    oracle.liabilitiesMinor,
    3_000_000_00n + 150_000_00n - 2_000_00n,
    "the card's 2 000 kr credit nets against the mortgage and the car loan",
  );
  assert.equal(
    oracle.owedMinor,
    3_000_000_00n + 150_000_00n,
    "an overpaid card owes nothing, so it adds nothing to what is owed",
  );

  const debtView = await ctx.debt.list("user-1", ctx.household.id, AS_OF);
  const cardRow = debtView.items.find((i) => i.id === ctx.card.id);
  assert.ok(cardRow, "the card appears on the debt surface");
  assert.equal(
    cardRow.outstanding.amountMinor,
    "0",
    "display magnitude clamps at zero rather than showing negative debt",
  );
  assert.equal(
    cardRow.credit.amountMinor,
    "200000",
    "the credit is shown as its own positive magnitude",
  );
  assert.equal(
    debtView.totals.outstanding.amountMinor,
    String(oracle.liabilitiesMinor),
    "the debt total is the signed position net worth subtracts",
  );
  const rowsOwed = debtView.items.reduce(
    (acc, i) => acc + BigInt(i.outstanding.amountMinor),
    0n,
  );
  const rowsCredit = debtView.items.reduce(
    (acc, i) => acc + BigInt(i.credit.amountMinor),
    0n,
  );
  assert.equal(
    rowsOwed - rowsCredit,
    oracle.liabilitiesMinor,
    "owed minus credit reconciles the display rows with the economic total",
  );
  assert.equal(rowsOwed, oracle.owedMinor, "rows show exactly what is owed");
});

test("oracle — liability matrix: mortgage principal is neutral, interest is not", async () => {
  const ctx = await setup();
  const opening = await assertAgrees(ctx, "openings");

  // A mortgage payment always carries some interest (a principal-only payment is
  // rejected today — original finding RT-006, still open), so principal
  // neutrality is proven by varying the principal at constant interest: if
  // principal moved net worth, these two deltas could not be equal.
  await ctx.events.createMortgagePayment({
    householdId: ctx.household.id,
    cashAccountId: ctx.cash.id,
    mortgageAccountId: ctx.mortgage.id,
    interestExpenseAccountId: ctx.expenseBook.id,
    principalMinor: 10_000_00n,
    interestMinor: 100_00n,
    occurredOn: AS_OF,
  });
  const afterSmall = await assertAgrees(ctx, "mortgage payment, small principal");
  assert.equal(
    afterSmall - opening,
    -100_00n,
    "net worth falls by the interest only, not by the principal",
  );

  await ctx.events.createMortgagePayment({
    householdId: ctx.household.id,
    cashAccountId: ctx.cash.id,
    mortgageAccountId: ctx.mortgage.id,
    interestExpenseAccountId: ctx.expenseBook.id,
    principalMinor: 90_000_00n,
    interestMinor: 100_00n,
    occurredOn: AS_OF,
  });
  const afterLarge = await assertAgrees(ctx, "mortgage payment, large principal");
  assert.equal(
    afterLarge - afterSmall,
    -100_00n,
    "nine times the principal at the same interest costs exactly the same",
  );

  const oracle = await oraclePosition(ctx.household.id, AS_OF);
  const debtView = await ctx.debt.list("user-1", ctx.household.id, AS_OF);
  const mortgageRow = debtView.items.find((i) => i.id === ctx.mortgage.id);
  assert.equal(
    mortgageRow?.outstanding.amountMinor,
    String(2_900_000_00n),
    "the user sees the remaining debt as a positive magnitude",
  );
  assert.equal(
    oracle.netWorthMinor,
    1_500_000_00n - 200_00n,
    "hand-computed: only the two interest charges left the household",
  );
});

test("oracle — liability matrix: vehicle loan repaid to zero", async () => {
  const ctx = await setup();
  const opening = await assertAgrees(ctx, "openings");

  await ctx.events.createMortgagePayment({
    householdId: ctx.household.id,
    cashAccountId: ctx.cash.id,
    mortgageAccountId: ctx.vehicleLoan.id,
    interestExpenseAccountId: ctx.expenseBook.id,
    principalMinor: 150_000_00n,
    interestMinor: 50_00n,
    occurredOn: AS_OF,
  });
  const afterPayoff = await assertAgrees(ctx, "vehicle loan repaid");
  assert.equal(
    afterPayoff - opening,
    -50_00n,
    "clearing the loan costs only its final interest",
  );

  const oracle = await oraclePosition(ctx.household.id, AS_OF);
  const debtView = await ctx.debt.list("user-1", ctx.household.id, AS_OF);
  const loanRow = debtView.items.find((i) => i.id === ctx.vehicleLoan.id);
  assert.equal(loanRow?.outstanding.amountMinor, "0", "a repaid loan owes nothing");
  assert.equal(loanRow?.credit.amountMinor, "0", "and holds no credit either");
  assert.equal(
    oracle.liabilitiesMinor,
    3_000_000_00n,
    "only the mortgage remains outstanding",
  );
  assert.equal(
    oracle.owedMinor,
    3_000_000_00n,
    "a fully repaid liability contributes nothing to what is owed",
  );
});

test("oracle — net worth moves one for one with each account class", async () => {
  const ctx = await setup();
  const opening = await assertAgrees(ctx, "openings");

  // An income of 10 000 kr into cash: assets up, net worth up by the same.
  await ctx.events.createCashIncome({
    householdId: ctx.household.id,
    cashAccountId: ctx.cash.id,
    amountMinor: 10_000_00n,
    occurredOn: AS_OF,
  });
  const afterIncome = await productNetWorth(ctx.metrics, ctx.household.id);
  assert.equal(afterIncome - opening, 10_000_00n);

  // A cash expense of 10 000 kr: net worth down by the same.
  await ctx.events.createCashExpense({
    householdId: ctx.household.id,
    cashAccountId: ctx.cash.id,
    expenseAccountId: ctx.expenseBook.id,
    amountMinor: 10_000_00n,
    occurredOn: AS_OF,
  });
  const afterExpense = await productNetWorth(ctx.metrics, ctx.household.id);
  assert.equal(afterExpense, opening);

  // An investment transfer moves cash into investments: net worth unchanged.
  await ctx.events.createInvestmentTransfer({
    householdId: ctx.household.id,
    cashAccountId: ctx.cash.id,
    investmentAccountId: ctx.investment.id,
    amountMinor: 50_000_00n,
    occurredOn: AS_OF,
  });
  const afterInvest = await assertAgrees(ctx, "investment transfer");
  assert.equal(afterInvest, opening);

  // Depreciating the asset by 10 000 kr lowers net worth by exactly that.
  await ctx.events.createAssetDepreciation({
    householdId: ctx.household.id,
    assetAccountId: ctx.home.id,
    expenseAccountId: ctx.expenseBook.id,
    amountMinor: 10_000_00n,
    occurredOn: AS_OF,
  });
  const afterDepreciation = await assertAgrees(ctx, "asset depreciation");
  assert.equal(afterDepreciation - afterInvest, -10_000_00n);
});
