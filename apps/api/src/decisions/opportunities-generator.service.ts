import { Injectable } from "@nestjs/common";
import { and, eq, gte } from "drizzle-orm";
import type { CurrencyCode } from "@ffos/domain";
import {
  calculateLifestyleCreep,
  detectBudgetOverrunOpportunity,
  detectCashSurplusOpportunity,
  detectContractRenewalOpportunity,
  detectMortgageRateOpportunity,
  detectSpendingTrendOpportunity,
  detectSubscriptionPriceIncrease,
  detectVehicleCostOpportunity,
  detectVehicleReplacementOpportunity,
  keepVsReplace,
  outstandingLiabilityMinor,
  rankOpportunities,
  vehicleEconomicCost,
  vehicleNetEquity,
  type DetectedOpportunity,
} from "@ffos/financial-engine";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import { accounts } from "../db/schema-economic";
import { opportunities } from "../db/schema-decisions";
import { householdSettings } from "../db/schema-ops";
import { contracts, sinkingFunds, subscriptions } from "../db/schema-planning";
import {
  vehicleCostEvents,
  vehicleFinanceAgreements,
  vehicles,
} from "../db/schema-vehicles";
import { vehicleCandidates } from "../db/schema-vehicle-intel";
import { HouseholdMetricsService, lastNMonths } from "../metrics/household-metrics.service";
import { PlanningMetricsService } from "../planning/planning-metrics.service";

const VEHICLE_SWITCHING_COST_MINOR = 15_000_00n;

/** Amount at which price-trend-derived subscription series is flagged. */
function cadenceMonthlyMinor(
  amountMinor: bigint,
  cadence: string,
): bigint {
  switch (cadence) {
    case "YEARLY":
      return amountMinor / 12n;
    case "QUARTERLY":
      return amountMinor / 3n;
    case "WEEKLY":
      return (amountMinor * 52n) / 12n;
    default:
      return amountMinor;
  }
}

function addDaysIso(dateStr: string, days: number): string {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Deterministic opportunity detection + persistence.
 *
 * Deliberately getDb()-based (no HouseholdAccessService dependency) so it can
 * run both inside a request (DecisionsService) and from a BullMQ job worker
 * without a userId / Nest request context.
 */
@Injectable()
export class OpportunitiesGeneratorService {
  private readonly metrics = new HouseholdMetricsService();
  private readonly planning = new PlanningMetricsService();

  /** Detect + persist. Returns the ranked detected opportunities (not DB rows). */
  async generate(
    householdId: string,
    currency: CurrencyCode,
    asOf: string,
  ): Promise<DetectedOpportunity[]> {
    const detected = await this.detectAll(householdId, currency, asOf);
    await this.persist(householdId, currency, asOf, detected);
    return detected;
  }

  async detectAll(
    householdId: string,
    currency: CurrencyCode,
    asOf: string,
  ): Promise<DetectedOpportunity[]> {
    const [mortgage, subs, cashSurplus, budgetOverrun, spendingTrend, contractOpps, vehicleOpps] =
      await Promise.all([
        this.detectMortgage(householdId, asOf),
        this.detectSubscriptionPriceIncreases(householdId, asOf),
        this.detectCashSurplus(householdId, currency, asOf),
        this.detectBudgetOverrun(householdId, currency, asOf),
        this.detectSpendingTrend(householdId, asOf),
        this.detectContractRenewals(householdId, asOf),
        this.detectVehicleOpportunities(householdId, asOf),
      ]);

    return rankOpportunities([
      mortgage,
      ...subs,
      cashSurplus,
      budgetOverrun,
      spendingTrend,
      ...contractOpps,
      ...vehicleOpps,
    ]);
  }

  private async detectMortgage(householdId: string, asOf: string) {
    const db = getDb();
    const mortgageAccounts = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.householdId, householdId),
          eq(accounts.accountType, "MORTGAGE"),
        ),
      );
    const withRate = mortgageAccounts.find(
      (a) => a.interestRateBps != null && a.interestRateBps > 0,
    );
    if (!withRate) return null;

    const aligned = await this.metrics.getLedgerAlignedAccountRows(householdId);
    const ledgerBal =
      aligned.find((a) => a.id === withRate.id)?.currentBalanceMinor ??
      withRate.currentBalanceMinor;
    const principalMinor = outstandingLiabilityMinor(ledgerBal);

    return detectMortgageRateOpportunity({
      asOf,
      principalMinor,
      currentAnnualRateBps: withRate.interestRateBps!,
      mortgageAccountId: withRate.id,
    });
  }

  /**
   * Subscription price series from `priceTrendPercent` (percent increase to the
   * *current* charged amount): previous = current / (1 + p/100).
   */
  private async detectSubscriptionPriceIncreases(householdId: string, asOf: string) {
    const db = getDb();
    const rows = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.householdId, householdId),
          eq(subscriptions.status, "ACTIVE"),
        ),
      );

    const out: (DetectedOpportunity | null)[] = [];
    for (const s of rows) {
      const p = s.priceTrendPercent != null ? Number(s.priceTrendPercent) : 0;
      if (!p || p <= 0) continue;
      const current = cadenceMonthlyMinor(s.amountMinor, s.cadence);
      const previous = BigInt(Math.round(Number(current) / (1 + p / 100)));
      out.push(
        detectSubscriptionPriceIncrease({
          asOf,
          subscriptionId: s.id,
          name: s.name,
          monthlyAmountSeries: [previous, current],
        }),
      );
    }
    return out;
  }

  private async detectCashSurplus(
    householdId: string,
    currency: CurrencyCode,
    asOf: string,
  ) {
    const db = getDb();
    const [settingsRow] = await db
      .select()
      .from(householdSettings)
      .where(eq(householdSettings.householdId, householdId))
      .limit(1);
    if (!settingsRow) return null;

    const snap = await this.metrics.getFinancialSnapshot(householdId, currency, asOf);
    const horizon = addDaysIso(asOf, 30);
    const upcoming30dOutflowMinor = snap.upcoming
      .filter(
        (u) => (u.kind === "bill" || u.kind === "other") && u.date >= asOf && u.date <= horizon,
      )
      .reduce((sum, u) => sum + BigInt(u.amount.amountMinor), 0n);

    const fundRows = await db
      .select({ currentReservedMinor: sinkingFunds.currentReservedMinor })
      .from(sinkingFunds)
      .where(eq(sinkingFunds.householdId, householdId));
    const reservedSinkingFundMinor = fundRows.reduce(
      (sum, f) => sum + f.currentReservedMinor,
      0n,
    );

    return detectCashSurplusOpportunity({
      asOf,
      availableCashMinor: snap.position.availableCash.amountMinor,
      minimumCashBalanceMinor: settingsRow.minimumCashBalanceMinor,
      emergencyFundTargetMinor: settingsRow.emergencyFundTargetMinor,
      safetyMarginMinor: settingsRow.safetyMarginMinor,
      reservedSinkingFundMinor,
      upcoming30dOutflowMinor,
    });
  }

  private async detectBudgetOverrun(
    householdId: string,
    currency: CurrencyCode,
    asOf: string,
  ) {
    const budget = await this.planning.getBudget(householdId, currency, asOf);
    if (!budget) return null;
    const start = new Date(`${budget.period.startDate.slice(0, 10)}T00:00:00.000Z`);
    const end = new Date(`${budget.period.endDate.slice(0, 10)}T00:00:00.000Z`);
    const now = new Date(`${asOf.slice(0, 10)}T00:00:00.000Z`);
    const totalDays = Math.max(1, (end.getTime() - start.getTime()) / 86_400_000);
    const elapsedDays = Math.min(
      totalDays,
      Math.max(0, (now.getTime() - start.getTime()) / 86_400_000),
    );
    const periodProgress = elapsedDays / totalDays;

    const plannedMinor = BigInt(budget.totals.planned.amountMinor);
    const actualMinor = BigInt(budget.totals.actual.amountMinor);
    // Deterministic linear projection: extrapolate current pace to period end.
    const forecastRemainingSpendMinor =
      periodProgress > 0
        ? BigInt(Math.round((Number(actualMinor) / periodProgress) * (1 - periodProgress)))
        : 0n;

    return detectBudgetOverrunOpportunity({
      asOf,
      plannedMinor,
      actualMinor,
      periodProgress,
      forecastRemainingSpendMinor,
    });
  }

  private async detectSpendingTrend(householdId: string, asOf: string) {
    const months = lastNMonths(asOf, 15);
    const monthlyPoints = await this.metrics.monthlyTotals(householdId, months);
    const recentMonths = months.slice(-3);
    const baselineMonths = months.slice(0, Math.max(0, months.length - 3)).slice(-12);
    const categorySpends = await this.metrics.categorySpendComparison(
      householdId,
      recentMonths,
      baselineMonths,
    );
    const creep = calculateLifestyleCreep({
      asOf,
      monthlyPoints: monthlyPoints.map((p) => ({
        month: p.month,
        spendingMinor: p.spendingMinor,
      })),
      categorySpends,
    });
    return detectSpendingTrendOpportunity(creep, asOf);
  }

  private async detectContractRenewals(householdId: string, asOf: string) {
    const db = getDb();
    const rows = await db
      .select()
      .from(contracts)
      .where(eq(contracts.householdId, householdId));
    return detectContractRenewalOpportunity({
      asOf,
      contracts: rows.map((c) => ({
        id: c.id,
        name: c.name,
        provider: c.provider,
        renewalDate: c.renewalDate,
        endDate: c.endDate,
        cancellationDeadline: c.cancellationDeadline,
        monthlyCostMinor: c.monthlyCostMinor,
        annualCostMinor: c.annualCostMinor,
        status: c.status,
      })),
    });
  }

  private async detectVehicleOpportunities(householdId: string, asOf: string) {
    const db = getDb();
    const vehicleRows = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.householdId, householdId));
    if (!vehicleRows.length) return [];

    const candidateRows = await db
      .select()
      .from(vehicleCandidates)
      .where(eq(vehicleCandidates.householdId, householdId));
    const bestCandidate = candidateRows.length
      ? candidateRows.reduce((best, c) =>
          c.estimatedMonthlyEconomicMinor < best.estimatedMonthlyEconomicMinor ? c : best,
        )
      : null;

    const out: (DetectedOpportunity | null)[] = [];
    const from = addDaysIso(asOf, -365);
    for (const v of vehicleRows) {
      const [finance] = await db
        .select()
        .from(vehicleFinanceAgreements)
        .where(eq(vehicleFinanceAgreements.vehicleId, v.id))
        .limit(1);
      const costs = await db
        .select({
          kind: vehicleCostEvents.kind,
          amountMinor: vehicleCostEvents.amountMinor,
          isEconomicCost: vehicleCostEvents.isEconomicCost,
        })
        .from(vehicleCostEvents)
        .where(
          and(
            eq(vehicleCostEvents.vehicleId, v.id),
            eq(vehicleCostEvents.householdId, householdId),
            gte(vehicleCostEvents.occurredOn, from),
          ),
        );

      const econ12 = vehicleEconomicCost(costs);
      const monthlyEconomicCostMinor = econ12 / 12n;
      const equity = vehicleNetEquity({
        estimatedValueMidMinor: v.estimatedValueMidMinor ?? 0n,
        remainingDebtMinor: finance?.remainingMinor ?? 0n,
        sellingCostMinor: 5_000_00n,
      });

      out.push(
        detectVehicleCostOpportunity({
          asOf,
          vehicleId: v.id,
          name: v.name,
          monthlyEconomicCostMinor,
          negativeEquity: equity.negativeEquity,
          netEquityMinor: equity.netEquityMinor,
        }),
      );

      if (bestCandidate) {
        const cmp = keepVsReplace({
          currentMonthlyEconomicMinor: monthlyEconomicCostMinor,
          candidateMonthlyEconomicMinor: bestCandidate.estimatedMonthlyEconomicMinor,
          switchingCostMinor: VEHICLE_SWITCHING_COST_MINOR,
        });
        out.push(
          detectVehicleReplacementOpportunity({
            asOf,
            vehicleId: v.id,
            name: v.name,
            recommendation: cmp.recommendation === "watch" ? "marginal" : cmp.recommendation,
            monthlyDeltaMinor: cmp.monthlyDeltaMinor,
            analysisSource: `mock_candidate:${bestCandidate.source}`,
            confidence: cmp.confidence,
          }),
        );
      }
    }
    return out;
  }

  /**
   * Upsert by (householdId, identityKey). DISMISSED rows are only resurrected
   * when the input materially changed (inputHash differs) AND the review
   * cooldown has elapsed.
   */
  private async persist(
    householdId: string,
    currency: CurrencyCode,
    asOf: string,
    detected: DetectedOpportunity[],
  ) {
    const db = getDb();
    const existingRows = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.householdId, householdId));
    const byIdentity = new Map(existingRows.map((r) => [r.identityKey, r]));
    const now = new Date();
    const validUntil = addDaysIso(asOf, 14);
    const nextReviewAt = new Date(now.getTime() + 14 * 86_400_000);
    const detectedKeys = new Set<string>();

    for (const opp of detected) {
      detectedKeys.add(opp.identityKey);
      const existing = byIdentity.get(opp.identityKey);

      const base = {
        householdId,
        title: opp.title,
        description: opp.description,
        estimatedAnnualSavingMinor: opp.estimatedAnnualImpactMinor,
        currency,
        confidence: opp.confidence.confidenceScore.toFixed(4),
        effort: opp.effort,
        risk: opp.risk,
        // Legacy 1..5 display priority (1 = most important) derived from priorityScore.
        priority: Math.max(1, Math.min(5, 5 - Math.round(opp.priority.priorityScore * 4))),
        category: opp.type,
        type: opp.type,
        detectorKey: opp.detectorKey,
        identityKey: opp.identityKey,
        estimatedMonthlyImpactMinor: opp.estimatedMonthlyImpactMinor,
        estimateBasis: opp.estimateBasis,
        assumptions: opp.assumptions,
        facts: opp.facts,
        dataSources: opp.dataSources,
        evidence: opp.evidence,
        confidenceScore: opp.confidence.confidenceScore.toFixed(4),
        confidenceLabel: opp.confidence.label,
        priorityScore: opp.priority.priorityScore.toFixed(6),
        calculationVersion: opp.calculationVersion,
        inputHash: opp.inputHash,
        asOf: opp.asOf.slice(0, 10),
        validUntil,
        lastCalculatedAt: now,
        nextReviewAt,
        updatedAt: now,
      };

      if (!existing) {
        await db.insert(opportunities).values({ ...base, status: "NEW" });
        continue;
      }

      if (existing.status === "DISMISSED") {
        const inputChanged = existing.inputHash !== opp.inputHash;
        const reviewDue = !existing.nextReviewAt || existing.nextReviewAt <= now;
        if (inputChanged && reviewDue) {
          await db
            .update(opportunities)
            .set({ ...base, status: "ACTIVE", dismissedAt: null })
            .where(eq(opportunities.id, existing.id));
        }
        continue;
      }

      const preserveStatus =
        existing.status === "ACCEPTED" || existing.status === "COMPLETED"
          ? existing.status
          : existing.status === "VIEWED"
            ? "VIEWED"
            : "ACTIVE";
      await db
        .update(opportunities)
        .set({ ...base, status: preserveStatus })
        .where(eq(opportunities.id, existing.id));
    }

    // Expire rows no longer detected (unless dismissed/accepted/completed, which are
    // user-owned). This also retires pre-U4 seeded rows (`legacy:` identity keys) —
    // they predate structured evidence/facts and can never be re-detected under a
    // real identityKey, so they are stale by construction.
    for (const row of existingRows) {
      if (detectedKeys.has(row.identityKey)) continue;
      if (["ACCEPTED", "COMPLETED", "DISMISSED", "EXPIRED"].includes(row.status)) continue;
      await db
        .update(opportunities)
        .set({ status: "EXPIRED", updatedAt: now })
        .where(eq(opportunities.id, row.id));
    }
  }
}

/** Resolve household currency without requiring a userId / access check. */
export async function resolveHouseholdCurrency(
  householdId: string,
): Promise<CurrencyCode> {
  const [row] = await getDb()
    .select({ baseCurrency: households.baseCurrency })
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1);
  return (row?.baseCurrency || "SEK") as CurrencyCode;
}
