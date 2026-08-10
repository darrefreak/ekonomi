import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import type { CurrencyCode } from "@ffos/domain";
import { getDb } from "./client";
import { households } from "./schema";
import { accounts, ledgerPostings } from "./schema-economic";
import { requireTestDatabase } from "../testing/require-test-database";
import { persistBalancedEvent, reviseEventEconomicMeaning } from "./seed/persist-event";
import {
  CurrencyQuarantineException,
  UnsupportedCurrencyException,
  UnsupportedHouseholdCurrencyException,
} from "../common/currency-policy";
import { PostingAccountNotInHouseholdError } from "./posting-currency-guard";

/**
 * The currency invariant tested where it is enforced, not where it is
 * convenient.
 *
 * Every one of these calls `persistBalancedEvent` directly with a hand-built
 * draft, bypassing controllers, schemas and services entirely — which is the
 * point. Eleven endpoints can build a ledger draft and the twelfth has not been
 * written yet; the guard has to hold for a caller nobody has thought of
 * (FPR-002).
 */

const suffix = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function fixture(baseCurrency: string, accountCurrency = baseCurrency) {
  const db = getDb();
  const [household] = await db
    .insert(households)
    .values({ name: `Currency guard ${suffix()}`, baseCurrency })
    .returning();
  const [cash] = await db
    .insert(accounts)
    .values({
      householdId: household.id,
      name: "Lönekonto",
      accountType: "CHECKING",
      currency: accountCurrency,
      openingBalanceMinor: 100000n,
      currentBalanceMinor: 100000n,
      isShared: true,
    })
    .returning();
  const [expense] = await db
    .insert(accounts)
    .values({
      householdId: household.id,
      name: "Utgiftsbok",
      accountType: "EXPENSE",
      currency: accountCurrency,
      openingBalanceMinor: 0n,
      currentBalanceMinor: 0n,
      isSystem: true,
    })
    .returning();
  return { household, cash, expense };
}

function draft(
  cashAccountId: string,
  expenseAccountId: string,
  currency: CurrencyCode,
  amountMinor = 10000n,
) {
  return {
    eventType: "EXPENSE" as const,
    expenseAmountMinor: amountMinor,
    debtReductionMinor: 0n,
    netWorthDeltaMinor: -amountMinor,
    postings: [
      { accountId: expenseAccountId, side: "debit" as const, amountMinor, currency },
      { accountId: cashAccountId, side: "credit" as const, amountMinor, currency },
    ],
  };
}

async function postingCount(householdId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: ledgerPostings.id })
    .from(ledgerPostings)
    .where(eq(ledgerPostings.householdId, householdId));
  return rows.length;
}

test("a matching posting persists, so the guard is not simply refusing everything", async () => {
  requireTestDatabase();
  const { household, cash, expense } = await fixture("SEK");

  const event = await persistBalancedEvent({
    householdId: household.id,
    draft: draft(cash.id, expense.id, "SEK"),
    occurredOn: "2026-08-05",
    description: "Mat",
  });

  assert.ok(event.id);
  assert.equal(await postingCount(household.id), 2);
});

test("a posting in a currency the account does not hold is refused at persistence", async () => {
  requireTestDatabase();
  const { household, cash, expense } = await fixture("SEK");

  await assert.rejects(
    persistBalancedEvent({
      householdId: household.id,
      draft: draft(cash.id, expense.id, "EUR"),
      occurredOn: "2026-08-05",
      description: "Mat i fel valuta",
    }),
    (error: unknown) => error instanceof UnsupportedCurrencyException,
  );

  assert.equal(
    await postingCount(household.id),
    0,
    "a refused command must leave no partial ledger behind",
  );
});

test("an account whose currency is not the household's takes no money at all", async () => {
  requireTestDatabase();
  // Exactly the shape of a row created before the guard existed: the household
  // counts in SEK, the account is in EUR.
  const { household, cash, expense } = await fixture("SEK");
  const db = getDb();
  await db
    .update(accounts)
    .set({ currency: "EUR" })
    .where(eq(accounts.id, cash.id));

  // In the household's own currency the quarantined account is what stops it;
  // in the account's currency the other leg mismatches first. Either way no
  // money reaches it.
  await assert.rejects(
    persistBalancedEvent({
      householdId: household.id,
      draft: draft(cash.id, expense.id, "SEK"),
      occurredOn: "2026-08-05",
      description: "Bokföring i hushållets valuta",
    }),
    (error: unknown) => error instanceof CurrencyQuarantineException,
  );

  await assert.rejects(
    persistBalancedEvent({
      householdId: household.id,
      draft: draft(cash.id, expense.id, "EUR"),
      occurredOn: "2026-08-05",
      description: "Bokföring i kontots valuta",
    }),
    (error: unknown) =>
      error instanceof CurrencyQuarantineException ||
      error instanceof UnsupportedCurrencyException,
  );

  assert.equal(await postingCount(household.id), 0);
});

test("an archived mismatched account is quarantined too", async () => {
  requireTestDatabase();
  const { household, cash, expense } = await fixture("SEK");
  const db = getDb();
  await db
    .update(accounts)
    .set({ currency: "EUR", archivedAt: new Date() })
    .where(eq(accounts.id, cash.id));

  await assert.rejects(
    persistBalancedEvent({
      householdId: household.id,
      draft: draft(cash.id, expense.id, "SEK"),
      occurredOn: "2026-08-05",
      description: "Bokföring på arkiverat konto",
    }),
    (error: unknown) => error instanceof CurrencyQuarantineException,
  );
});

test("a household in a currency V1 cannot total accepts no ledger activity", async () => {
  requireTestDatabase();
  const { household, cash, expense } = await fixture("EUR");

  await assert.rejects(
    persistBalancedEvent({
      householdId: household.id,
      draft: draft(cash.id, expense.id, "EUR"),
      occurredOn: "2026-08-05",
      description: "Internt konsekvent men ostödd valuta",
    }),
    (error: unknown) => error instanceof UnsupportedHouseholdCurrencyException,
  );

  assert.equal(await postingCount(household.id), 0);
});

test("a cross-currency transfer cannot be booked, because one leg always mismatches", async () => {
  requireTestDatabase();
  const { household, cash } = await fixture("SEK");
  const db = getDb();
  const [foreign] = await db
    .insert(accounts)
    .values({
      householdId: household.id,
      name: "Eurokonto",
      accountType: "SAVINGS",
      currency: "EUR",
      openingBalanceMinor: 0n,
      currentBalanceMinor: 0n,
      isShared: true,
    })
    .returning();

  await assert.rejects(
    persistBalancedEvent({
      householdId: household.id,
      draft: {
        eventType: "TRANSFER" as const,
        expenseAmountMinor: 0n,
        debtReductionMinor: 0n,
        netWorthDeltaMinor: 0n,
        postings: [
          { accountId: foreign.id, side: "debit" as const, amountMinor: 5000n, currency: "SEK" },
          { accountId: cash.id, side: "credit" as const, amountMinor: 5000n, currency: "SEK" },
        ],
      },
      occurredOn: "2026-08-05",
      description: "SEK till EUR",
    }),
    (error: unknown) => error instanceof CurrencyQuarantineException,
  );

  assert.equal(await postingCount(household.id), 0);
});

test("a posting aimed at another household's account is refused", async () => {
  requireTestDatabase();
  const mine = await fixture("SEK");
  const theirs = await fixture("SEK");

  await assert.rejects(
    persistBalancedEvent({
      householdId: mine.household.id,
      draft: draft(theirs.cash.id, mine.expense.id, "SEK"),
      occurredOn: "2026-08-05",
      description: "Grannens konto",
    }),
    (error: unknown) => error instanceof PostingAccountNotInHouseholdError,
  );

  assert.equal(await postingCount(mine.household.id), 0);
  assert.equal(await postingCount(theirs.household.id), 0);
});

test("revising an event cannot smuggle in a currency the account does not hold", async () => {
  requireTestDatabase();
  const { household, cash, expense } = await fixture("SEK");
  const event = await persistBalancedEvent({
    householdId: household.id,
    draft: draft(cash.id, expense.id, "SEK"),
    occurredOn: "2026-08-05",
    description: "Mat",
  });

  await assert.rejects(
    reviseEventEconomicMeaning({
      householdId: household.id,
      financialEventId: event.id,
      draft: draft(cash.id, expense.id, "EUR", 20000n),
      occurredOn: "2026-08-06",
      description: "Reviderad i fel valuta",
    }),
    (error: unknown) => error instanceof UnsupportedCurrencyException,
  );

  // The revision runs in one transaction that clears the old postings first, so
  // a rejected revision must roll back to the original two.
  assert.equal(await postingCount(household.id), 2);
});

test("the stamped currency comes from the household rather than a hardcoded SEK", async () => {
  requireTestDatabase();
  const { household, cash, expense } = await fixture("SEK");
  const event = await persistBalancedEvent({
    householdId: household.id,
    draft: draft(cash.id, expense.id, "SEK"),
    occurredOn: "2026-08-05",
    description: "Mat",
  });

  const db = getDb();
  const [row] = await db
    .select({ currency: ledgerPostings.currency })
    .from(ledgerPostings)
    .where(eq(ledgerPostings.householdId, household.id))
    .limit(1);
  assert.equal(row?.currency, "SEK");
  assert.ok(event.id);
});
