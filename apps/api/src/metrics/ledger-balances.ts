import { and, eq } from "drizzle-orm";
import {
  findBalanceMismatches,
  reconstructBalances,
} from "@ffos/financial-engine";
import { getDb } from "../db/client";
import { accounts, ledgerPostings } from "../db/schema-economic";

/**
 * Reconstruct balances from opening (accounts table currently holds cache)
 * is wrong for openings — seed must pass openings separately OR we store
 * openings elsewhere. For runtime after seed sync, openings are encoded as:
 * currentBalance - sum(posting deltas) ... chicken and egg.
 *
 * Convention after Workstream A seed:
 * - `accounts.currentBalanceMinor` is ledger-derived ending balance
 * - Reconstruction uses stored opening snapshot via optional openings map
 *
 * For reconcile-after-seed we reconstruct from explicit openings + postings.
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
