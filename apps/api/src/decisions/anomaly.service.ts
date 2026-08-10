import { Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import {
  ANOMALY_CALCULATION_VERSION,
  detectDuplicateCandidate,
  detectLargeTransaction,
  detectMissingExpectedIncome,
  type AnomalyFinding,
} from "@ffos/financial-engine";
import { getDb } from "../db/client";
import { anomalyFindings } from "../db/schema-decisions";
import { financialEvents } from "../db/schema-economic";
import { recurringItems } from "../db/schema-planning";
import { HouseholdAccessService } from "../households/household-access.service";
import { resolveHouseholdAsOf } from "../common/as-of";

function addDaysIso(dateStr: string, days: number): string {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function anomalyHref(
  entityKind: string | null,
  entityId: string | null,
): string | null {
  if (!entityId || !entityKind) return null;
  if (entityKind === "transaction" || entityKind === "financial_event") {
    return `/transactions/${entityId}`;
  }
  if (
    entityKind === "recurring" ||
    entityKind === "recurring_item" ||
    entityKind === "income"
  ) {
    return "/subscriptions";
  }
  return null;
}

/**
 * Deterministic anomaly detection (large txns, duplicates, missing income).
 * getDb()-based — safe to construct outside of Nest DI for job workers.
 */
@Injectable()
export class AnomalyService {
  constructor(
    @Optional()
    @Inject(HouseholdAccessService)
    private readonly access?: HouseholdAccessService,
  ) {}

  async run(householdId: string, asOf: string): Promise<AnomalyFinding[]> {
    const detected = await this.detectAll(householdId, asOf);
    await this.persist(householdId, asOf, detected);
    return detected;
  }

  async detectAll(householdId: string, asOf: string): Promise<AnomalyFinding[]> {
    const db = getDb();
    const from = addDaysIso(asOf, -180);
    const events = await db
      .select({
        id: financialEvents.id,
        occurredOn: financialEvents.occurredOn,
        expenseAmountMinor: financialEvents.expenseAmountMinor,
        description: financialEvents.description,
        merchantId: financialEvents.merchantId,
      })
      .from(financialEvents)
      .where(
        and(
          eq(financialEvents.householdId, householdId),
          eq(financialEvents.status, "ACTIVE"),
        ),
      )
      .orderBy(desc(financialEvents.occurredOn));

    const spendEvents = events.filter(
      (e) => e.occurredOn <= asOf && e.occurredOn >= from && e.expenseAmountMinor > 0n,
    );
    const recentSpendAbsMinor = spendEvents.map((e) => e.expenseAmountMinor);

    const largeTxnFindings = spendEvents
      .map((e) =>
        detectLargeTransaction({
          asOf,
          transactionId: e.id,
          amountMinor: e.expenseAmountMinor,
          description: e.description ?? "Transaktion",
          recentSpendAbsMinor,
        }),
      )
      .filter((f): f is AnomalyFinding => f != null);

    const duplicateFindings: AnomalyFinding[] = [];
    const byMerchantAmount = new Map<string, typeof spendEvents>();
    for (const e of spendEvents) {
      if (!e.merchantId) continue;
      const key = `${e.merchantId}:${e.expenseAmountMinor}`;
      const bucket = byMerchantAmount.get(key) ?? [];
      bucket.push(e);
      byMerchantAmount.set(key, bucket);
    }
    for (const bucket of byMerchantAmount.values()) {
      if (bucket.length < 2) continue;
      const sorted = [...bucket].sort((a, b) => (a.occurredOn < b.occurredOn ? -1 : 1));
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]!;
        const curr = sorted[i]!;
        const daysApart = Math.round(
          (new Date(`${curr.occurredOn}T00:00:00.000Z`).getTime() -
            new Date(`${prev.occurredOn}T00:00:00.000Z`).getTime()) /
            86_400_000,
        );
        const finding = detectDuplicateCandidate({
          asOf,
          transactionId: curr.id,
          otherTransactionId: prev.id,
          amountMinor: curr.expenseAmountMinor,
          merchantOrDesc: curr.description ?? "",
          daysApart,
        });
        if (finding) duplicateFindings.push(finding);
      }
    }

    const incomeItems = await db
      .select()
      .from(recurringItems)
      .where(
        and(
          eq(recurringItems.householdId, householdId),
          eq(recurringItems.kind, "income"),
          ne(recurringItems.status, "DISMISSED"),
          ne(recurringItems.status, "PAUSED"),
        ),
      );
    const missingIncomeFindings = incomeItems
      .map((item) =>
        item.nextExpectedOn
          ? detectMissingExpectedIncome({
              asOf,
              recurringItemId: item.id,
              name: item.name,
              nextExpectedOn: item.nextExpectedOn,
            })
          : null,
      )
      .filter((f): f is AnomalyFinding => f != null);

    return [...largeTxnFindings, ...duplicateFindings, ...missingIncomeFindings];
  }

  private async persist(
    householdId: string,
    asOf: string,
    detected: AnomalyFinding[],
  ) {
    const db = getDb();
    const now = new Date();
    const existingRows = await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.householdId, householdId));
    const byIdentity = new Map(existingRows.map((r) => [r.identityKey, r]));
    const detectedKeys = new Set<string>();

    for (const finding of detected) {
      detectedKeys.add(finding.id);
      const base = {
        householdId,
        ruleKey: finding.ruleKey,
        title: finding.title,
        detail: finding.detail,
        severity: finding.severity,
        entityId: finding.entityId,
        entityKind: finding.entityKind,
        amountMinor: finding.amountMinor,
        asOf,
        facts: finding.facts,
        identityKey: finding.id,
      };
      const existing = byIdentity.get(finding.id);
      if (existing) {
        await db
          .update(anomalyFindings)
          .set(base)
          .where(eq(anomalyFindings.id, existing.id));
      } else {
        await db.insert(anomalyFindings).values(base);
      }
    }

    // Drop findings that are no longer detected (including dismissed ones so
    // the same signal can resurface later if it reappears).
    for (const row of existingRows) {
      if (!detectedKeys.has(row.identityKey)) {
        await db.delete(anomalyFindings).where(eq(anomalyFindings.id, row.id));
      }
    }

    return { calculationVersion: ANOMALY_CALCULATION_VERSION, count: detected.length, at: now };
  }

  async listForUser(userId: string, householdId: string) {
    if (this.access) {
      await this.access.requireMembership(userId, householdId);
    }
    return this.list(householdId);
  }

  async list(householdId: string) {
    const db = getDb();
    const asOf = await resolveHouseholdAsOf(householdId);
    const rows = await db
      .select()
      .from(anomalyFindings)
      .where(
        and(
          eq(anomalyFindings.householdId, householdId),
          isNull(anomalyFindings.dismissedAt),
        ),
      )
      .orderBy(desc(anomalyFindings.createdAt));

    return {
      asOf,
      items: rows.map((r) => ({
        id: r.id,
        ruleKey: r.ruleKey,
        title: r.title,
        detail: r.detail,
        severity: r.severity,
        entityId: r.entityId,
        entityKind: r.entityKind,
        amountMinor: r.amountMinor != null ? r.amountMinor.toString() : null,
        asOf: r.asOf,
        facts: r.facts ?? [],
        identityKey: r.identityKey,
        href: anomalyHref(r.entityKind, r.entityId),
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async dismiss(userId: string, householdId: string, anomalyId: string) {
    if (this.access) {
      await this.access.requireCanWrite(userId, householdId);
    }
    const db = getDb();
    const [row] = await db
      .select()
      .from(anomalyFindings)
      .where(
        and(
          eq(anomalyFindings.id, anomalyId),
          eq(anomalyFindings.householdId, householdId),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException("Anomaly not found");

    await db
      .update(anomalyFindings)
      .set({ dismissedAt: new Date() })
      .where(eq(anomalyFindings.id, anomalyId));

    return this.list(householdId);
  }
}
