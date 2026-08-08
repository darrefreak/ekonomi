import { Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import {
  reconstructBalances,
  reconcileReportedVsLedger,
  type AccountReconcileResult,
} from "@ffos/financial-engine";
import { getDb } from "../db/client";
import {
  accountBalanceSnapshots,
  accounts,
  financialEvents,
  ledgerEntries,
  ledgerPostings,
} from "../db/schema-economic";
import { AuditService } from "../audit/audit.service";
import { logger } from "../common/logger";
import { resolveHouseholdAsOf } from "../common/as-of";

export type AuthoritativeBalance = {
  accountId: string;
  accountType: string;
  currency: string;
  openingBalanceMinor: bigint;
  ledgerCalculatedBalanceMinor: bigint;
  /** Derived cache — should equal ledger after refresh. */
  cachedBalanceMinor: bigint;
  reportedBalanceMinor: bigint | null;
  reconcile: AccountReconcileResult;
};

@Injectable()
export class LedgerTruthService {
  constructor(private readonly audit: AuditService) {}

  async loadOpenings(householdId: string) {
    const db = getDb();
    const rows = await db
      .select({
        accountId: accounts.id,
        accountType: accounts.accountType,
        openingMinor: accounts.openingBalanceMinor,
        currency: accounts.currency,
        currentBalanceMinor: accounts.currentBalanceMinor,
        reportedBalanceMinor: accounts.reportedBalanceMinor,
        isSystem: accounts.isSystem,
      })
      .from(accounts)
      .where(eq(accounts.householdId, householdId));
    return rows;
  }

  async loadPostings(householdId: string) {
    const db = getDb();
    // Only ACTIVE financial events participate in ledger reconstruction (P0-A8).
    return db
      .select({
        accountId: ledgerPostings.accountId,
        side: ledgerPostings.side,
        amountMinor: ledgerPostings.amountMinor,
      })
      .from(ledgerPostings)
      .innerJoin(
        ledgerEntries,
        eq(ledgerPostings.ledgerEntryId, ledgerEntries.id),
      )
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
  }

  /**
   * Authoritative ending balances = openings + all ledger postings.
   */
  async reconstructHousehold(householdId: string): Promise<Map<string, bigint>> {
    const rows = await this.loadOpenings(householdId);
    const postings = await this.loadPostings(householdId);
    return reconstructBalances({
      openings: rows.map((r) => ({
        accountId: r.accountId,
        accountType: r.accountType,
        openingMinor: r.openingMinor,
      })),
      postings: postings.map((p) => ({
        accountId: p.accountId,
        side: p.side as "debit" | "credit",
        amountMinor: p.amountMinor,
      })),
    });
  }

  async getAuthoritativeBalances(
    householdId: string,
    asOf: string,
  ): Promise<AuthoritativeBalance[]> {
    const rows = await this.loadOpenings(householdId);
    const ledger = await this.reconstructHousehold(householdId);
    return rows
      .filter((r) => !r.isSystem)
      .map((r) => {
        const ledgerCalculated = ledger.get(r.accountId) ?? r.openingMinor;
        const reconcile = reconcileReportedVsLedger({
          accountId: r.accountId,
          currency: r.currency,
          asOf,
          reportedBalanceMinor: r.reportedBalanceMinor,
          ledgerCalculatedBalanceMinor: ledgerCalculated,
        });
        return {
          accountId: r.accountId,
          accountType: r.accountType,
          currency: r.currency,
          openingBalanceMinor: r.openingMinor,
          ledgerCalculatedBalanceMinor: ledgerCalculated,
          cachedBalanceMinor: r.currentBalanceMinor,
          reportedBalanceMinor: r.reportedBalanceMinor,
          reconcile,
        };
      });
  }

  /**
   * Refresh derived cache from ledger and write snapshots.
   * Does NOT overwrite reportedBalanceMinor.
   * Idempotent for a given asOf day + source.
   */
  async refreshDerivedCaches(householdId: string, asOf: string) {
    const db = getDb();
    const asOfDate = new Date(`${asOf}T12:00:00.000Z`);
    const balances = await this.getAuthoritativeBalances(householdId, asOf);
    let updated = 0;
    let mismatches = 0;

    for (const row of balances) {
      await db
        .update(accounts)
        .set({
          currentBalanceMinor: row.ledgerCalculatedBalanceMinor,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(accounts.id, row.accountId),
            eq(accounts.householdId, householdId),
          ),
        );

      // Upsert on the snapshot identity rather than delete-then-insert: two
      // concurrent reconcile runs used to both delete and both insert, which is
      // how the duplicate snapshots of RT2-008 accumulated.
      const reconciledBalanceMinor =
        row.reconcile.status === "MATCHED"
          ? row.ledgerCalculatedBalanceMinor
          : null;
      await db
        .insert(accountBalanceSnapshots)
        .values({
          householdId,
          accountId: row.accountId,
          reportedBalanceMinor: row.reportedBalanceMinor,
          availableBalanceMinor: row.ledgerCalculatedBalanceMinor,
          ledgerCalculatedBalanceMinor: row.ledgerCalculatedBalanceMinor,
          reconciledBalanceMinor,
          asOf: asOfDate,
          source: "ledger_reconcile",
          confidence: "1",
          userVerified: false,
          isEstimated: false,
        })
        .onConflictDoUpdate({
          target: [
            accountBalanceSnapshots.accountId,
            accountBalanceSnapshots.asOf,
            accountBalanceSnapshots.source,
          ],
          set: {
            reportedBalanceMinor: row.reportedBalanceMinor,
            availableBalanceMinor: row.ledgerCalculatedBalanceMinor,
            ledgerCalculatedBalanceMinor: row.ledgerCalculatedBalanceMinor,
            reconciledBalanceMinor,
            isEstimated: false,
          },
        });

      updated += 1;
      if (row.reconcile.status === "MISMATCH") mismatches += 1;
    }

    // Invalidate reconstructed NW history so the next history read rebuilds from ledger.
    await db
      .delete(accountBalanceSnapshots)
      .where(
        and(
          eq(accountBalanceSnapshots.householdId, householdId),
          eq(accountBalanceSnapshots.source, "nw_history_reconstruct"),
        ),
      );

    logger.info("ledger_cache_refreshed", {
      householdId,
      asOf,
      updated,
      mismatches,
    });

    return { updated, mismatches, balances };
  }

  async reconcileHousehold(householdId: string, asOf?: string) {
    const day = await resolveHouseholdAsOf(householdId, asOf);
    const result = await this.refreshDerivedCaches(householdId, day);
    await this.audit.record({
      householdId,
      action: "ledger.reconcile",
      entity: "household",
      entityId: householdId,
      after: {
        asOf: day,
        updated: result.updated,
        mismatches: result.mismatches,
      },
      source: "job",
    });
    return {
      householdId,
      asOf: day,
      updated: result.updated,
      mismatches: result.mismatches,
      results: result.balances.map((b) => ({
        accountId: b.accountId,
        status: b.reconcile.status,
        reportedBalanceMinor:
          b.reconcile.reportedBalanceMinor?.toString() ?? null,
        ledgerCalculatedBalanceMinor:
          b.reconcile.ledgerCalculatedBalanceMinor?.toString() ?? null,
        differenceMinor: b.reconcile.differenceMinor?.toString() ?? null,
        currency: b.currency,
      })),
    };
  }
}
