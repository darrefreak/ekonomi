import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import { getDb } from "../db/client";
import {
  vehicleCandidates,
  vehicleComparisons,
  vehicleMarketSnapshots,
  vehicleReplacementPlans,
} from "../db/schema-vehicle-intel";
import { HouseholdAccessService } from "../households/household-access.service";

@Injectable()
export class VehicleIntelService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
  ) {}

  async market(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const db = getDb();
    const [snapshot] = await db
      .select()
      .from(vehicleMarketSnapshots)
      .where(eq(vehicleMarketSnapshots.householdId, householdId))
      .limit(1);
    const candidates = await db
      .select()
      .from(vehicleCandidates)
      .where(eq(vehicleCandidates.householdId, householdId));
    const comparisons = await db
      .select()
      .from(vehicleComparisons)
      .where(eq(vehicleComparisons.householdId, householdId));
    const [replacement] = await db
      .select()
      .from(vehicleReplacementPlans)
      .where(eq(vehicleReplacementPlans.householdId, householdId))
      .limit(1);

    return {
      asOf,
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
      comparisons: comparisons.map((c) => ({
        id: c.id,
        title: c.title,
        monthlyDelta: moneyToJson(money(c.monthlyDeltaMinor, currency)),
        recommendation: c.recommendation,
        confidence: c.confidence ? Number(c.confidence) : null,
        summary: c.summary,
      })),
      replacement: replacement
        ? {
            status: replacement.status,
            summary: replacement.summary,
            sellWindowStart: replacement.sellWindowStart,
            sellWindowEnd: replacement.sellWindowEnd,
            targetEquity: replacement.targetEquityMinor
              ? moneyToJson(money(replacement.targetEquityMinor, currency))
              : null,
          }
        : null,
    };
  }
}
