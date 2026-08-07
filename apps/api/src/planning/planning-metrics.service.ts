import { Injectable } from "@nestjs/common";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import {
  annualizeSubscription,
  goalProgress,
  requiredMonthlyContribution,
  rollupActualByBudgetKey,
  summarizeBudget,
  monthsUntil,
} from "@ffos/financial-engine";
import { getDb } from "../db/client";
import { categories, financialEvents, merchants } from "../db/schema-economic";
import {
  budgetLines,
  budgetPeriods,
  contracts,
  goals,
  recurringItems,
  sinkingFunds,
  subscriptions,
} from "../db/schema-planning";
import { lastNMonths } from "../metrics/household-metrics.service";

@Injectable()
export class PlanningMetricsService {
  async monthExpenseTotal(householdId: string, label: string): Promise<bigint> {
    const db = getDb();
    const monthStart = `${label}-01`;
    const [y, m] = label.split("-").map(Number);
    const nextMonth =
      m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const [row] = await db
      .select({
        amountMinor: sql<string>`coalesce(sum(${financialEvents.expenseAmountMinor}), 0)`,
      })
      .from(financialEvents)
      .where(
        and(
          eq(financialEvents.householdId, householdId),
          gte(financialEvents.occurredOn, monthStart),
          lt(financialEvents.occurredOn, nextMonth),
        ),
      );
    return BigInt(row?.amountMinor ?? "0");
  }

  async resolveBudgetLabel(householdId: string, asOf: string): Promise<string> {
    const months = lastNMonths(asOf, 3);
    const current = months[months.length - 1]!;
    const previous = months[months.length - 2] ?? current;
    const db = getDb();

    const currentSpend = await this.monthExpenseTotal(householdId, current);
    const preferred = currentSpend > 0n ? current : previous;

    for (const label of [preferred, previous, current]) {
      const [period] = await db
        .select()
        .from(budgetPeriods)
        .where(
          and(eq(budgetPeriods.householdId, householdId), eq(budgetPeriods.label, label)),
        )
        .limit(1);
      if (period) return label;
    }
    return preferred;
  }

  async getBudget(householdId: string, currency: CurrencyCode, asOf: string) {
    const db = getDb();
    const label = await this.resolveBudgetLabel(householdId, asOf);
    const [period] = await db
      .select()
      .from(budgetPeriods)
      .where(
        and(eq(budgetPeriods.householdId, householdId), eq(budgetPeriods.label, label)),
      )
      .limit(1);
    if (!period) {
      return null;
    }

    const lines = await db
      .select()
      .from(budgetLines)
      .where(eq(budgetLines.budgetPeriodId, period.id))
      .orderBy(asc(budgetLines.sortOrder));

    const monthStart = `${label}-01`;
    const [y, m] = label.split("-").map(Number);
    const nextMonth =
      m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

    const actualRows = await db
      .select({
        categoryKey: categories.key,
        amountMinor: sql<string>`coalesce(sum(${financialEvents.expenseAmountMinor}), 0)`,
      })
      .from(financialEvents)
      .leftJoin(categories, eq(financialEvents.categoryId, categories.id))
      .where(
        and(
          eq(financialEvents.householdId, householdId),
          gte(financialEvents.occurredOn, monthStart),
          lt(financialEvents.occurredOn, nextMonth),
        ),
      )
      .groupBy(categories.key);

    const budgetKeys = lines.map((l) => l.categoryKey);
    const rolled = rollupActualByBudgetKey(
      actualRows
        .filter((r) => r.categoryKey)
        .map((r) => ({
          categoryKey: r.categoryKey!,
          amountMinor: BigInt(r.amountMinor),
        })),
      budgetKeys,
    );

    const summary = summarizeBudget(
      lines.map((line) => ({
        categoryKey: line.categoryKey,
        plannedMinor: line.plannedMinor,
        actualMinor: rolled.get(line.categoryKey) ?? 0n,
      })),
    );

    return {
      asOf,
      period: {
        id: period.id,
        label: period.label,
        startDate: period.startDate,
        endDate: period.endDate,
        status: period.status,
      },
      currency,
      totals: {
        planned: moneyToJson(money(summary.plannedMinor, currency)),
        actual: moneyToJson(money(summary.actualMinor, currency)),
        remaining: moneyToJson(money(summary.remainingMinor, currency)),
        variance: moneyToJson(money(summary.varianceMinor, currency)),
        utilizationPercent: summary.utilizationPercent,
      },
      lines: summary.lines.map((line, idx) => ({
        id: lines[idx]!.id,
        categoryKey: line.categoryKey,
        name: lines[idx]!.name,
        planned: moneyToJson(money(line.plannedMinor, currency)),
        actual: moneyToJson(money(line.actualMinor, currency)),
        remaining: moneyToJson(money(line.remainingMinor, currency)),
        variance: moneyToJson(money(line.varianceMinor, currency)),
        utilizationPercent: line.utilizationPercent,
      })),
    };
  }

  async getSubscriptions(householdId: string, currency: CurrencyCode, asOf: string) {
    const db = getDb();
    const rows = await db
      .select({
        sub: subscriptions,
        merchantName: merchants.canonicalName,
      })
      .from(subscriptions)
      .leftJoin(merchants, eq(subscriptions.merchantId, merchants.id))
      .where(eq(subscriptions.householdId, householdId));

    const items = rows.map(({ sub, merchantName }) => {
      const annual = annualizeSubscription(
        sub.amountMinor,
        sub.cadence as "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY",
      );
      return {
        id: sub.id,
        name: sub.name,
        status: sub.status,
        cadence: sub.cadence,
        amount: moneyToJson(money(sub.amountMinor, currency)),
        annualCost: moneyToJson(money(annual, currency)),
        lastChargedOn: sub.lastChargedOn,
        nextChargeOn: sub.nextChargeOn,
        priceTrendPercent: sub.priceTrendPercent
          ? Number(sub.priceTrendPercent)
          : null,
        merchantName: merchantName ?? null,
        _monthlyEquivalent:
          sub.cadence === "YEARLY"
            ? sub.amountMinor / 12n
            : sub.cadence === "QUARTERLY"
              ? sub.amountMinor / 3n
              : sub.cadence === "WEEKLY"
                ? (sub.amountMinor * 52n) / 12n
                : sub.amountMinor,
        _annual: annual,
      };
    });

    const totalMonthly = items
      .filter((i) => i.status === "ACTIVE")
      .reduce((acc, i) => acc + i._monthlyEquivalent, 0n);
    const totalAnnual = items
      .filter((i) => i.status === "ACTIVE")
      .reduce((acc, i) => acc + i._annual, 0n);

    const recurring = await db
      .select()
      .from(recurringItems)
      .where(eq(recurringItems.householdId, householdId));

    return {
      asOf,
      totalMonthly: moneyToJson(money(totalMonthly, currency)),
      totalAnnual: moneyToJson(money(totalAnnual, currency)),
      items: items.map(({ _monthlyEquivalent: _m, _annual: _a, ...rest }) => rest),
      recurring: recurring.map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        cadence: r.cadence,
        amount: moneyToJson(money(r.amountMinor, currency)),
        status: r.status,
        nextExpectedOn: r.nextExpectedOn,
        confidence: r.confidence ? Number(r.confidence) : null,
      })),
    };
  }

  async getContracts(householdId: string, currency: CurrencyCode, asOf: string) {
    const db = getDb();
    const rows = await db
      .select()
      .from(contracts)
      .where(eq(contracts.householdId, householdId));

    return {
      asOf,
      items: rows.map((c) => ({
        id: c.id,
        name: c.name,
        provider: c.provider,
        contractType: c.contractType,
        status: c.status,
        monthlyCost: c.monthlyCostMinor
          ? moneyToJson(money(c.monthlyCostMinor, currency))
          : null,
        annualCost: c.annualCostMinor
          ? moneyToJson(money(c.annualCostMinor, currency))
          : null,
        renewalDate: c.renewalDate,
        cancellationDeadline: c.cancellationDeadline,
        noticePeriodDays: c.noticePeriodDays,
        autoRenewal: c.autoRenewal,
      })),
    };
  }

  async getGoals(householdId: string, currency: CurrencyCode, asOf: string) {
    const db = getDb();
    const goalRows = await db
      .select()
      .from(goals)
      .where(eq(goals.householdId, householdId));
    const fundRows = await db
      .select()
      .from(sinkingFunds)
      .where(eq(sinkingFunds.householdId, householdId));

    return {
      asOf,
      goals: goalRows.map((g) => {
        const progress = goalProgress(g.currentMinor, g.targetMinor);
        const months = monthsUntil(asOf, g.targetDate);
        const required = requiredMonthlyContribution(
          g.currentMinor,
          g.targetMinor,
          months,
        );
        return {
          id: g.id,
          name: g.name,
          goalType: g.goalType,
          status: g.status,
          target: moneyToJson(money(g.targetMinor, currency)),
          current: moneyToJson(money(g.currentMinor, currency)),
          remaining: moneyToJson(money(progress.remainingMinor, currency)),
          percentComplete: progress.percentComplete,
          monthlyContribution: moneyToJson(
            money(g.monthlyContributionMinor, currency),
          ),
          requiredMonthly: moneyToJson(money(required, currency)),
          targetDate: g.targetDate,
          priority: g.priority,
        };
      }),
      sinkingFunds: fundRows.map((f) => {
        const progress = goalProgress(f.currentReservedMinor, f.targetMinor);
        return {
          id: f.id,
          name: f.name,
          target: moneyToJson(money(f.targetMinor, currency)),
          currentReserved: moneyToJson(money(f.currentReservedMinor, currency)),
          monthlyContribution: moneyToJson(
            money(f.monthlyContributionMinor, currency),
          ),
          remaining: moneyToJson(money(progress.remainingMinor, currency)),
          percentComplete: progress.percentComplete,
          targetDate: f.targetDate,
          priority: f.priority,
        };
      }),
    };
  }
}
