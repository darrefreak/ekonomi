import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import {
  METRIC_BUNDLE_VERSION,
  listMetricDefinitions,
  type MetricDefinition,
} from "@ffos/financial-engine";
import { getDb } from "../db/client";
import { metricDefinitions, metricSnapshots } from "../db/schema-metrics";
import { HouseholdMetricsService } from "./household-metrics.service";

type SnapshotRow = {
  metricKey: string;
  calculationVersion: string;
  asOf: string;
  period: string | null;
  currency?: CurrencyCode;
  valueMinor?: string | null;
  valueNumber?: number | null;
  money?: ReturnType<typeof moneyToJson> | null;
  inputHash?: string | null;
  coveragePercent?: number | null;
  freshnessLabel?: string | null;
  calculatedAt: string;
};

@Injectable()
export class MetricRegistryService {
  constructor(
    @Inject(HouseholdMetricsService)
    private readonly metrics: HouseholdMetricsService,
  ) {}

  /** Upsert code-first definitions into DB (idempotent). */
  async ensureDefinitions(): Promise<MetricDefinition[]> {
    const defs = listMetricDefinitions();
    const db = getDb();
    const now = new Date();
    for (const def of defs) {
      const [existing] = await db
        .select()
        .from(metricDefinitions)
        .where(
          and(
            eq(metricDefinitions.metricKey, def.metricKey),
            eq(metricDefinitions.calculationVersion, def.calculationVersion),
          ),
        )
        .limit(1);
      if (existing) {
        await db
          .update(metricDefinitions)
          .set({
            displayName: def.displayName,
            formulaDescription: def.formulaDescription,
            valueKind: def.valueKind,
            unit: def.unit ?? null,
            updatedAt: now,
          })
          .where(eq(metricDefinitions.id, existing.id));
      } else {
        await db.insert(metricDefinitions).values({
          metricKey: def.metricKey,
          displayName: def.displayName,
          formulaDescription: def.formulaDescription,
          calculationVersion: def.calculationVersion,
          valueKind: def.valueKind,
          unit: def.unit ?? null,
        });
      }
    }
    return defs;
  }

  async listDefinitions() {
    const items = await this.ensureDefinitions();
    return {
      bundleVersion: METRIC_BUNDLE_VERSION,
      items,
    };
  }

  /**
   * Compute core household metrics from the shared snapshot path and
   * persist rebuildable MetricSnapshot rows.
   */
  async materializeSnapshots(
    householdId: string,
    currency: CurrencyCode,
    asOf: string,
  ) {
    await this.ensureDefinitions();
    const snap = await this.metrics.getFinancialSnapshot(
      householdId,
      currency,
      asOf,
    );
    const coverage = await this.metrics.coverage(householdId, asOf);
    const calculatedAt = new Date().toISOString();
    const period = snap.monthLabel;
    const meta = snap.metricMeta;

    const moneySnap = (
      metricKey: string,
      amount: { amountMinor: bigint; currency: CurrencyCode },
      version: string,
    ): SnapshotRow => ({
      metricKey,
      calculationVersion: version,
      asOf,
      period,
      currency: amount.currency,
      valueMinor: String(amount.amountMinor),
      valueNumber: null,
      money: moneyToJson(amount),
      inputHash: meta.inputHash,
      coveragePercent: coverage.percent,
      freshnessLabel: coverage.freshnessSummary ?? null,
      calculatedAt,
    });

    const numberSnap = (
      metricKey: string,
      value: number,
      version: string,
    ): SnapshotRow => ({
      metricKey,
      calculationVersion: version,
      asOf,
      period,
      currency,
      valueMinor: null,
      valueNumber: value,
      money: null,
      inputHash: meta.inputHash,
      coveragePercent: coverage.percent,
      freshnessLabel: coverage.freshnessSummary ?? null,
      calculatedAt,
    });

    const defs = listMetricDefinitions();
    const versionOf = (key: string) =>
      defs.find((d) => d.metricKey === key)?.calculationVersion ??
      METRIC_BUNDLE_VERSION;

    const items: SnapshotRow[] = [
      moneySnap("net_worth", snap.position.netWorth, versionOf("net_worth")),
      moneySnap(
        "available_cash",
        snap.position.availableCash,
        versionOf("available_cash"),
      ),
      moneySnap(
        "investments_total",
        snap.position.investments,
        versionOf("investments_total"),
      ),
      moneySnap("assets_total", snap.position.assets, versionOf("assets_total")),
      moneySnap("debt_total", snap.position.liabilities, versionOf("debt_total")),
      moneySnap(
        "income_period",
        money(snap.incomeMinor, currency),
        versionOf("income_period"),
      ),
      moneySnap(
        "spending_period",
        money(snap.spendingMinor, currency),
        versionOf("spending_period"),
      ),
      moneySnap(
        "savings_period",
        money(snap.savingsMinor, currency),
        versionOf("savings_period"),
      ),
      numberSnap(
        "net_savings_rate",
        snap.savingsRate,
        versionOf("net_savings_rate"),
      ),
      numberSnap(
        "cash_runway_months",
        snap.runway,
        versionOf("cash_runway_months"),
      ),
      numberSnap(
        "financial_coverage_percent",
        coverage.percent,
        versionOf("financial_coverage_percent"),
      ),
    ];

    const db = getDb();
    for (const item of items) {
      const [existing] = await db
        .select()
        .from(metricSnapshots)
        .where(
          and(
            eq(metricSnapshots.householdId, householdId),
            eq(metricSnapshots.metricKey, item.metricKey),
            eq(metricSnapshots.asOf, item.asOf),
            eq(metricSnapshots.calculationVersion, item.calculationVersion),
          ),
        )
        .limit(1);

      const values = {
        period: item.period,
        currency: item.currency ?? null,
        valueMinor: item.valueMinor ?? null,
        valueNumber:
          item.valueNumber == null ? null : String(item.valueNumber),
        inputHash: item.inputHash ?? null,
        coveragePercent: item.coveragePercent ?? null,
        freshnessLabel: item.freshnessLabel ?? null,
        calculatedAt: new Date(item.calculatedAt),
      };

      if (existing) {
        await db
          .update(metricSnapshots)
          .set(values)
          .where(eq(metricSnapshots.id, existing.id));
      } else {
        await db.insert(metricSnapshots).values({
          householdId,
          metricKey: item.metricKey,
          calculationVersion: item.calculationVersion,
          asOf: item.asOf,
          ...values,
        });
      }
    }

    return {
      householdId,
      asOf,
      bundleVersion: METRIC_BUNDLE_VERSION,
      inputHash: meta.inputHash,
      calculatedAt,
      coveragePercent: coverage.percent,
      freshnessLabel: coverage.freshnessSummary ?? null,
      items,
      /** Live snapshot used by consumers (same object identity for consistency tests). */
      financialSnapshot: snap,
    };
  }

  async getSnapshots(
    householdId: string,
    currency: CurrencyCode,
    asOf: string,
  ) {
    return this.materializeSnapshots(householdId, currency, asOf);
  }
}
