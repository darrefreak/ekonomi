import { and, eq } from "drizzle-orm";
import {
  findBalanceMismatches,
  reconstructBalances,
} from "@ffos/financial-engine";
import { getDb } from "../db/client";
import { accounts, ledgerPostings } from "../db/schema-economic";

/**
 * Legacy helpers — prefer `LedgerTruthService` for runtime reconciliation.
 *
 * Batch A2 convention:
 * - `accounts.openingBalanceMinor` is authoritative opening
 * - `accounts.currentBalanceMinor` is derived cache of ledger ending balance
 * - `accounts.reportedBalanceMinor` is provider evidence (may mismatch)
 * - Authoritative position = reconstruct(openings, postings)
 */
export async function loadLedgerPostings(householdId: string) {
  const db = getDb();
  return db
    .select({
      accountId: ledgerPostings.accountId,
      side: ledgerPostings.side,
      amountMinor: ledgerPostings.amountMinor,
    })
    .from(ledgerPostings)
    .where(eq(ledgerPostings.householdId, householdId));
}

export async function loadAccountMeta(householdId: string) {
  const db = getDb();
  return db
    .select({
      id: accounts.id,
      accountType: accounts.accountType,
      currentBalanceMinor: accounts.currentBalanceMinor,
      isSystem: accounts.isSystem,
    })
    .from(accounts)
    .where(eq(accounts.householdId, householdId));
}

export function reconstructHouseholdBalances(input: {
  openings: Array<{
    accountId: string;
    accountType: string;
    openingMinor: bigint;
  }>;
  postings: Array<{
    accountId: string;
    side: "debit" | "credit";
    amountMinor: bigint;
  }>;
}) {
  return reconstructBalances(input);
}

export async function reconcileCachedBalances(
  householdId: string,
  openings: Array<{
    accountId: string;
    accountType: string;
    openingMinor: bigint;
  }>,
) {
  const postings = await loadLedgerPostings(householdId);
  const ledger = reconstructBalances({
    openings,
    postings: postings.map((p) => ({
      accountId: p.accountId,
      side: p.side,
      amountMinor: p.amountMinor,
    })),
  });
  const cached = await loadAccountMeta(householdId);
  return findBalanceMismatches({
    cached: cached.map((a) => ({
      accountId: a.id,
      balanceMinor: a.currentBalanceMinor,
    })),
    ledger,
  });
}

export async function applyLedgerBalancesToAccounts(
  householdId: string,
  balances: Map<string, bigint>,
  asOf: Date,
) {
  const db = getDb();
  for (const [accountId, bal] of balances) {
    await db
      .update(accounts)
      .set({
        currentBalanceMinor: bal,
        lastSyncedAt: asOf,
        updatedAt: new Date(),
      })
      .where(and(eq(accounts.id, accountId), eq(accounts.householdId, householdId)));
  }
}
