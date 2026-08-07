import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import { keepVsReplace, sellWindowHint } from "@ffos/financial-engine";
import { getDb } from "../db/client";
import {
  vehicleCandidates,
  vehicleMarketSnapshots,
} from "../db/schema-vehicle-intel";
import { vehicles } from "../db/schema-vehicles";
import { HouseholdAccessService } from "../households/household-access.service";
import { VehiclesService } from "../vehicles/vehicles.service";

const SWITCHING_COST_MINOR = 15_000_00n;

function monthsBetween(asOf: string, endDate: string | null): number | null {
  if (!endDate) return null;
  const a = new Date(`${asOf.slice(0, 10)}T00:00:00.000Z`);
  const e = new Date(`${endDate.slice(0, 10)}T00:00:00.000Z`);
  const months =
    (e.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (e.getUTCMonth() - a.getUTCMonth());
  return months;
}

function addMonths(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class VehicleIntelService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(VehiclesService) private readonly vehicles: VehiclesService,
  ) {}

  async market(userId: string, householdId: string, vehicleId?: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const db = getDb();

    let targetVehicleId = vehicleId;
    if (!targetVehicleId) {
      const [first] = await db
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(eq(vehicles.householdId, householdId))
        .limit(1);
      targetVehicleId = first?.id;
    }
    if (!targetVehicleId) {
      return {
        asOf,
        vehicleId: null,
        analysisSource: "live_over_mock_listings" as const,
        currentMonthlyEconomic: null,
        snapshot: null,
        candidates: [],
        comparisons: [],
        replacement: null,
      };
    }

    const detail = await this.vehicles.get(userId, householdId, targetVehicleId);
    const currentMonthly = BigInt(detail.metrics.monthlyEconomicCost.amountMinor);
    const equityMinor = BigInt(detail.metrics.netEquity.amountMinor);
    const monthsToEnd = monthsBetween(asOf, detail.finance?.endDate ?? null);

    const [snapshot] = await db
      .select()
      .from(vehicleMarketSnapshots)
      .where(
        and(
          eq(vehicleMarketSnapshots.householdId, householdId),
          eq(vehicleMarketSnapshots.vehicleId, targetVehicleId),
        ),
      )
      .limit(1);

    const candidates = await db
      .select()
      .from(vehicleCandidates)
      .where(eq(vehicleCandidates.householdId, householdId));

    const comparisons = candidates.map((c) => {
      const cmp = keepVsReplace({
        currentMonthlyEconomicMinor: currentMonthly,
        candidateMonthlyEconomicMinor: c.estimatedMonthlyEconomicMinor,
        switchingCostMinor: SWITCHING_COST_MINOR,
      });
      return {
        id: c.id,
        title: `Behåll ${detail.name} vs ${c.name}`,
        monthlyDelta: moneyToJson(money(cmp.monthlyDeltaMinor, currency)),
        recommendation: cmp.recommendation,
        confidence: cmp.confidence,
        summary: `Live jämförelse mot mock-kandidat. Effektiv månadsdelta ${cmp.monthlyDeltaMinor} minor. Rekommendation: ${cmp.recommendation}.`,
        candidateId: c.id,
      };
    });

    const hint = sellWindowHint(equityMinor, monthsToEnd);
    let sellWindowStart: string | null = null;
    let sellWindowEnd: string | null = null;
    if (detail.finance?.endDate) {
      sellWindowEnd = detail.finance.endDate;
      sellWindowStart = addMonths(detail.finance.endDate, -6);
    } else if (monthsToEnd != null && monthsToEnd <= 12) {
      sellWindowStart = asOf;
      sellWindowEnd = addMonths(asOf, Math.max(monthsToEnd, 3));
    }

    return {
      asOf,
      vehicleId: targetVehicleId,
      analysisSource: "live_over_mock_listings" as const,
      currentMonthlyEconomic: moneyToJson(money(currentMonthly, currency)),
      snapshot: snapshot
        ? {
            askLow: moneyToJson(money(snapshot.askLowMinor, currency)),
            askMid: moneyToJson(money(snapshot.askMidMinor, currency)),
            askHigh: moneyToJson(money(snapshot.askHighMinor, currency)),
            sampleSize: snapshot.sampleSize,
            notes: snapshot.notes,
          }
        : null,
      candidates: candidates.map((c) => ({
        id: c.id,
        name: c.name,
        make: c.make,
        model: c.model,
        modelYear: c.modelYear,
        askPrice: moneyToJson(money(c.askPriceMinor, currency)),
        estimatedMonthlyEconomic: moneyToJson(
          money(c.estimatedMonthlyEconomicMinor, currency),
        ),
        notes: c.notes,
      })),
      comparisons,
      replacement: {
        status: hint.status,
        summary: hint.summary,
        sellWindowStart,
        sellWindowEnd,
        targetEquity: moneyToJson(money(equityMinor + 10_000_00n, currency)),
        monthsToBindingEnd: monthsToEnd,
        currentEquity: moneyToJson(money(equityMinor, currency)),
      },
    };
  }
}
