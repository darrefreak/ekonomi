import {
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import {
  assessHouseholdFit,
  calculateLeaseEconomics,
  compareAcquisitionModes,
  computeLiquidityProxy,
  computeMarketStats,
  computeMarketTrend,
  computePurchaseWindow,
  computeSellWindow,
  evaluateRequirementsAgainstCandidate,
  horizonOwnershipCost,
  keepVsReplace,
  recommendVehicleAction,
  replaceIncremental,
  selectComparables,
  valuationFromComparables,
  type MarketListing,
  type MarketSnapshotPoint,
} from "@ffos/financial-engine";
import type {
  CreateVehicleCandidateFromListingInput,
  CreateVehicleCandidateInput,
  UpdateVehicleCandidateInput,
} from "@ffos/schemas";
import { getDb } from "../db/client";
import {
  vehicleCandidates,
  vehicleHouseholdRequirements,
  vehicleLeaseAgreements,
  vehicleMarketHistoryPoints,
  vehicleMarketListings,
} from "../db/schema-vehicle-intel";
import { vehicles } from "../db/schema-vehicles";
import { HouseholdAccessService } from "../households/household-access.service";
import { VehiclesService } from "../vehicles/vehicles.service";

const SWITCHING_COST_MINOR = 15_000_00n;
const KEEP_HORIZON_MONTHS = 36;
const ASK_LABEL =
  "Liknande bilar annonseras för (utropspris, ej verifierad försäljning)";

function monthsBetween(asOf: string, endDate: string | null): number | null {
  if (!endDate) return null;
  const a = new Date(`${asOf.slice(0, 10)}T00:00:00.000Z`);
  const e = new Date(`${endDate.slice(0, 10)}T00:00:00.000Z`);
  return (
    (e.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (e.getUTCMonth() - a.getUTCMonth())
  );
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
      86_400_000,
  );
}

function mapListing(row: typeof vehicleMarketListings.$inferSelect): MarketListing {
  return {
    id: row.id,
    make: row.make,
    model: row.model,
    variant: row.variant,
    modelYear: row.modelYear,
    fuelType: row.fuelType,
    drivetrain: row.drivetrain,
    transmission: row.transmission,
    mileageKm: row.mileageKm,
    region: row.region,
    askPriceMinor: row.askPriceMinor,
    priceKind: row.priceKind as MarketListing["priceKind"],
    listedOn: row.listedOn,
    removedOn: row.removedOn,
    previousAskPriceMinor: row.previousAskPriceMinor,
    equipment: row.equipment ?? [],
  };
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

    const empty = {
      asOf,
      vehicleId: null,
      analysisSource: "live_over_mock_listings" as const,
      currentMonthlyEconomic: null,
      keepHorizonMonths: KEEP_HORIZON_MONTHS,
      snapshot: null,
      analytics: null,
      householdRequirements: null,
      candidates: [],
      comparisons: [],
      replacement: null,
      purchaseWindow: null,
      recommendation: null,
      lease: null,
      acquisitionComparison: null,
    };

    if (!targetVehicleId) return empty;

    const detail = await this.vehicles.get(userId, householdId, targetVehicleId);
    const currentMonthly = BigInt(detail.metrics.monthlyEconomicCost.amountMinor);
    const equityMinor = BigInt(detail.metrics.netEquity.amountMinor);
    const monthsToEnd = monthsBetween(asOf, detail.finance?.endDate ?? null);
    const annualKm = detail.usage.annualKm;
    const odometerKm = detail.usage.currentOdometerKm ?? 78_900;

    const listingRows = await db
      .select()
      .from(vehicleMarketListings)
      .where(eq(vehicleMarketListings.householdId, householdId));

    const historyRows = await db
      .select()
      .from(vehicleMarketHistoryPoints)
      .where(
        and(
          eq(vehicleMarketHistoryPoints.householdId, householdId),
          eq(vehicleMarketHistoryPoints.subjectVehicleId, targetVehicleId),
        ),
      );

    const [requirements] = await db
      .select()
      .from(vehicleHouseholdRequirements)
      .where(eq(vehicleHouseholdRequirements.householdId, householdId))
      .limit(1);

    const candidateRows = await db
      .select()
      .from(vehicleCandidates)
      .where(
        and(
          eq(vehicleCandidates.householdId, householdId),
          eq(vehicleCandidates.status, "ACTIVE"),
          isNull(vehicleCandidates.archivedAt),
        ),
      );

    const [leaseRow] = await db
      .select()
      .from(vehicleLeaseAgreements)
      .where(eq(vehicleLeaseAgreements.householdId, householdId))
      .limit(1);

    const listings = listingRows.map(mapListing);
    const subject = {
      make: detail.make,
      model: detail.model,
      modelYear: detail.modelYear,
      fuelType: detail.fuelType,
      mileageKm: odometerKm,
      region: "Stockholm",
    };

    const selection = selectComparables(subject, listings, asOf);
    const stats = computeMarketStats(selection.comparables);
    const valuation = valuationFromComparables({
      stats,
      selectionConfidence: selection.confidence,
      asOf,
      remainingDebtMinor: detail.finance
        ? BigInt(detail.finance.remaining.amountMinor)
        : 0n,
    });

    const trendPoints: MarketSnapshotPoint[] = historyRows.map((h) => ({
      asOf: h.asOf,
      medianAskingPriceMinor: h.medianAskingPriceMinor,
      listingCount: h.listingCount,
      medianListingAgeDays: h.medianListingAgeDays,
      priceReductionRate:
        h.priceReductionRate != null ? Number(h.priceReductionRate) : null,
    }));
    const trend = computeMarketTrend(trendPoints, asOf);

    const removedLast90d = listings.filter(
      (l) =>
        l.removedOn &&
        daysBetween(l.removedOn, asOf) <= 90 &&
        daysBetween(l.removedOn, asOf) >= 0,
    ).length;
    const newListingsLast30d = listings.filter(
      (l) =>
        daysBetween(l.listedOn, asOf) <= 30 && daysBetween(l.listedOn, asOf) >= 0,
    ).length;

    const liquidity = computeLiquidityProxy({
      activeComparableCount: selection.comparableCount,
      medianListingAgeDays: stats.medianListingAgeDays,
      removedLast90d,
      newListingsLast30d,
      priceReductionRate: stats.priceReductionRate,
    });

    const snapshot =
      stats.lowerQuartileMinor != null &&
      stats.medianAskingPriceMinor != null &&
      stats.upperQuartileMinor != null
        ? {
            askLow: moneyToJson(money(stats.lowerQuartileMinor, currency)),
            askMid: moneyToJson(money(stats.medianAskingPriceMinor, currency)),
            askHigh: moneyToJson(money(stats.upperQuartileMinor, currency)),
            sampleSize: stats.listingCount,
            notes: "Beräknat från jämförbara mock-annonser (utropspris)",
            askLabel: ASK_LABEL,
          }
        : null;

    const keepHorizon = horizonOwnershipCost({
      monthlyEconomicMinor: currentMonthly,
      horizonMonths: KEEP_HORIZON_MONTHS,
    });

    const req = requirements ?? {
      seatsRequired: 5,
      isofixRequired: 2,
      cargoRequired: true,
      towingRequired: false,
      homeChargingAvailable: false,
      minRangeKm: null,
      annualMileageKm: annualKm,
    };

    const mappedCandidates = candidateRows.map((c) => {
      const horizonMonths = c.holdingPeriodMonths ?? KEEP_HORIZON_MONTHS;
      const candidateHorizon = horizonOwnershipCost({
        monthlyEconomicMinor: c.estimatedMonthlyEconomicMinor,
        horizonMonths,
      });
      const fitReqs = evaluateRequirementsAgainstCandidate({
        seatsRequired: req.seatsRequired,
        isofixRequired: req.isofixRequired,
        cargoRequired: req.cargoRequired,
        towingRequired: req.towingRequired,
        homeChargingAvailable: req.homeChargingAvailable,
        minRangeKm: req.minRangeKm,
        annualMileageKm: req.annualMileageKm,
        candidate: {
          seats: c.seats,
          isofixCount: c.isofixCount,
          cargoOk: c.cargoOk,
          towingOk: c.towingOk,
          isElectric: c.isElectric,
          rangeKm: c.rangeKm,
          suitableAnnualKm: req.annualMileageKm,
        },
      });
      const fit = assessHouseholdFit(fitReqs);
      return {
        row: c,
        horizonMonths,
        candidateHorizon,
        fit,
        cashRequiredTodayMinor:
          c.financingDownPaymentMinor ?? c.askPriceMinor / 10n,
      };
    });

    const comparisons = mappedCandidates.map(({ row: c, fit, candidateHorizon }) => {
      const cmp = keepVsReplace({
        currentMonthlyEconomicMinor: currentMonthly,
        candidateMonthlyEconomicMinor: c.estimatedMonthlyEconomicMinor,
        switchingCostMinor: SWITCHING_COST_MINOR,
      });
      const incremental = replaceIncremental({
        keepTotalEconomicMinor: keepHorizon.totalEconomicMinor,
        candidateTotalEconomicMinor: candidateHorizon.totalEconomicMinor,
        cashRequiredTodayMinor:
          c.financingDownPaymentMinor ?? c.askPriceMinor / 10n,
        horizonMonths: KEEP_HORIZON_MONTHS,
      });
      return {
        id: c.id,
        title: `Behåll ${detail.name} vs ${c.name}`,
        monthlyDelta: moneyToJson(money(cmp.monthlyDeltaMinor, currency)),
        horizonDelta: moneyToJson(money(incremental.economicDeltaMinor, currency)),
        recommendation: cmp.recommendation,
        confidence: cmp.confidence,
        summary: `${incremental.summary} ${fit.summary}`,
        candidateId: c.id,
        fitEligible: fit.eligibleForPrimaryRecommendation,
      };
    });

    const sellWindow = computeSellWindow({
      equityMinor,
      monthsToBindingEnd: monthsToEnd,
      medianListingAgeDays: stats.medianListingAgeDays,
      liquidityLabel: liquidity.label,
      nextServiceOn: null,
      warrantyEndsOn: null,
      asOf,
      annualKm,
      currentOdometerKm: odometerKm,
      valuationLowMinor: valuation.estimatedLowMinor,
      valuationHighMinor: valuation.estimatedHighMinor,
    });

    const purchaseWindow = computePurchaseWindow({
      compsModelYears: selection.comparables.map((l) => l.modelYear),
      compsMileages: selection.comparables.map((l) => l.mileageKm),
      holdingPeriodMonths: KEEP_HORIZON_MONTHS,
      annualKm,
    });

    const ranked = [...mappedCandidates].sort((a, b) => {
      const aDelta =
        a.candidateHorizon.totalEconomicMinor - keepHorizon.totalEconomicMinor;
      const bDelta =
        b.candidateHorizon.totalEconomicMinor - keepHorizon.totalEconomicMinor;
      return Number(aDelta - bDelta);
    });
    const best = ranked[0];
    const bestIncremental = best
      ? replaceIncremental({
          keepTotalEconomicMinor: keepHorizon.totalEconomicMinor,
          candidateTotalEconomicMinor: best.candidateHorizon.totalEconomicMinor,
          cashRequiredTodayMinor: best.cashRequiredTodayMinor,
          horizonMonths: KEEP_HORIZON_MONTHS,
        })
      : null;

    let leaseBlock: ReturnType<VehicleIntelService["mapLease"]> | null = null;
    let leaseAdvantageMinor: bigint | null = null;
    if (leaseRow) {
      leaseBlock = this.mapLease(leaseRow, asOf, currency);
      const leaseEcon = calculateLeaseEconomics(
        {
          initialFeeMinor: leaseRow.initialFeeMinor,
          monthlyPaymentMinor: leaseRow.monthlyPaymentMinor,
          termMonths: leaseRow.termMonths,
          allowedMileageKm: leaseRow.allowedMileageKm,
          startOn: leaseRow.startOn,
          endOn: leaseRow.endOn,
          currentMileageKm: leaseRow.currentMileageKm,
          excessMileagePriceMinorPerKm: leaseRow.excessPriceMinorPerKm,
          serviceIncluded: leaseRow.serviceIncluded,
          insuranceIncluded: leaseRow.insuranceIncluded,
          tiresIncluded: leaseRow.tiresIncluded,
          expectedReturnCostMinor: leaseRow.expectedReturnCostMinor,
        },
        asOf,
      );
      leaseAdvantageMinor =
        leaseEcon.totalExpectedLeaseCashMinor - keepHorizon.totalEconomicMinor;
    }

    const recommendation = recommendVehicleAction({
      sellStatus: sellWindow.status,
      bestCandidate: best
        ? {
            id: best.row.id,
            name: best.row.name,
            economicDeltaMinor: bestIncremental!.economicDeltaMinor,
            cashRequiredTodayMinor: best.cashRequiredTodayMinor,
            fitEligible: best.fit.eligibleForPrimaryRecommendation,
          }
        : null,
      leaseAdvantageMinor,
      negativeEquity: equityMinor < 0n,
    });

    let acquisitionComparison = null;
    if (leaseRow && best) {
      const leaseEcon = calculateLeaseEconomics(
        {
          initialFeeMinor: leaseRow.initialFeeMinor,
          monthlyPaymentMinor: leaseRow.monthlyPaymentMinor,
          termMonths: leaseRow.termMonths,
          allowedMileageKm: leaseRow.allowedMileageKm,
          startOn: leaseRow.startOn,
          endOn: leaseRow.endOn,
          currentMileageKm: leaseRow.currentMileageKm,
          excessMileagePriceMinorPerKm: leaseRow.excessPriceMinorPerKm,
          serviceIncluded: leaseRow.serviceIncluded,
          insuranceIncluded: leaseRow.insuranceIncluded,
          tiresIncluded: leaseRow.tiresIncluded,
          expectedReturnCostMinor: leaseRow.expectedReturnCostMinor,
        },
        asOf,
      );
      const cmp = compareAcquisitionModes({
        horizonMonths: KEEP_HORIZON_MONTHS,
        cashPurchase: {
          purchasePriceMinor: best.row.askPriceMinor,
          expectedSaleValueMinor:
            best.row.expectedValuationMidMinor ?? best.row.askPriceMinor * 7n / 10n,
          ownershipEconomicMinor: best.candidateHorizon.totalEconomicMinor,
        },
        financedPurchase: {
          downPaymentMinor:
            best.row.financingDownPaymentMinor ?? best.row.askPriceMinor / 10n,
          totalInterestMinor: 35_000_00n,
          ownershipEconomicMinor: best.candidateHorizon.totalEconomicMinor,
          expectedSaleValueMinor:
            best.row.expectedValuationMidMinor ?? best.row.askPriceMinor * 7n / 10n,
          endingDebtMinor: 0n,
        },
        privateLease: {
          totalLeaseCashMinor: leaseEcon.totalExpectedLeaseCashMinor,
          ownershipEconomicMinor: leaseEcon.totalExpectedLeaseCashMinor,
        },
      });
      acquisitionComparison = {
        horizonMonths: cmp.horizonMonths,
        rows: cmp.rows.map((r) => ({
          mode: r.mode,
          totalCashOutflow: moneyToJson(money(r.totalCashOutflowMinor, currency)),
          totalEconomicCost: moneyToJson(money(r.totalEconomicCostMinor, currency)),
          notes: r.notes,
        })),
      };
    }

    return {
      asOf,
      vehicleId: targetVehicleId,
      analysisSource: "live_over_mock_listings" as const,
      currentMonthlyEconomic: moneyToJson(money(currentMonthly, currency)),
      keepHorizonMonths: KEEP_HORIZON_MONTHS,
      snapshot,
      analytics: {
        selectionLevel: selection.selectionLevel,
        comparableCount: selection.comparableCount,
        selectionCriteria: selection.selectionCriteria,
        confidence: selection.confidence,
        stats:
          stats.listingCount > 0
            ? {
                listingCount: stats.listingCount,
                medianAskingPrice: stats.medianAskingPriceMinor
                  ? moneyToJson(money(stats.medianAskingPriceMinor, currency))
                  : null,
                lowerQuartile: stats.lowerQuartileMinor
                  ? moneyToJson(money(stats.lowerQuartileMinor, currency))
                  : null,
                upperQuartile: stats.upperQuartileMinor
                  ? moneyToJson(money(stats.upperQuartileMinor, currency))
                  : null,
                mileageMedianKm: stats.mileageMedianKm,
                medianListingAgeDays: stats.medianListingAgeDays,
                priceReductionRate: stats.priceReductionRate,
                priceKindLabel: stats.priceKindLabel,
                askLabel: ASK_LABEL,
              }
            : null,
        valuation: valuation.insufficientData
          ? null
          : {
              estimatedLow: valuation.estimatedLowMinor
                ? moneyToJson(money(valuation.estimatedLowMinor, currency))
                : null,
              estimatedMid: valuation.estimatedMidMinor
                ? moneyToJson(money(valuation.estimatedMidMinor, currency))
                : null,
              estimatedHigh: valuation.estimatedHighMinor
                ? moneyToJson(money(valuation.estimatedHighMinor, currency))
                : null,
              expectedSellingCosts: valuation.expectedSellingCostsMinor
                ? moneyToJson(money(valuation.expectedSellingCostsMinor, currency))
                : null,
              estimatedNetSaleProceeds: valuation.estimatedNetSaleProceedsMinor
                ? moneyToJson(
                    money(valuation.estimatedNetSaleProceedsMinor, currency),
                  )
                : null,
              comparableCount: valuation.comparableCount,
              valuationDate: valuation.valuationDate,
              confidence: valuation.confidence,
              method: valuation.method,
              assumptions: valuation.assumptions,
              insufficientData: valuation.insufficientData,
              askLabel: ASK_LABEL,
            },
        trend: {
          d30: trend.d30
            ? {
                medianAskingChange: moneyToJson(
                  money(trend.d30.medianAskingChangeMinor ?? 0n, currency),
                ),
                listingCountChange: trend.d30.listingCountChange,
              }
            : null,
          d90: trend.d90
            ? {
                medianAskingChange: moneyToJson(
                  money(trend.d90.medianAskingChangeMinor ?? 0n, currency),
                ),
                listingCountChange: trend.d90.listingCountChange,
              }
            : null,
          m6: trend.m6
            ? {
                medianAskingChange: moneyToJson(
                  money(trend.m6.medianAskingChangeMinor ?? 0n, currency),
                ),
                listingCountChange: trend.m6.listingCountChange,
              }
            : null,
          m12: trend.m12
            ? {
                medianAskingChange: moneyToJson(
                  money(trend.m12.medianAskingChangeMinor ?? 0n, currency),
                ),
                listingCountChange: trend.m12.listingCountChange,
              }
            : null,
          pointCount: trend.pointCount,
          insufficientHistory: trend.insufficientHistory,
          askLabel: ASK_LABEL,
        },
        liquidity,
      },
      householdRequirements: requirements
        ? {
            seatsRequired: requirements.seatsRequired,
            isofixRequired: requirements.isofixRequired,
            cargoRequired: requirements.cargoRequired,
            towingRequired: requirements.towingRequired,
            homeChargingAvailable: requirements.homeChargingAvailable,
            minRangeKm: requirements.minRangeKm,
            annualMileageKm: requirements.annualMileageKm,
          }
        : null,
      candidates: mappedCandidates.map(
        ({ row: c, fit, horizonMonths, candidateHorizon }) => ({
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
          status: c.status,
          variant: c.variant,
          fuelType: c.fuelType,
          mileageKm: c.mileageKm,
          seats: c.seats,
          isElectric: c.isElectric,
          holdingPeriodMonths: horizonMonths,
          horizonMonths,
          horizonTotalEconomic: moneyToJson(
            money(candidateHorizon.totalEconomicMinor, currency),
          ),
          fit: {
            mustHaveFailures: fit.mustHaveFailures,
            preferenceScore: fit.preferenceScore,
            overallScore: fit.overallScore,
            eligibleForPrimaryRecommendation: fit.eligibleForPrimaryRecommendation,
            summary: fit.summary,
          },
        }),
      ),
      comparisons,
      replacement: {
        status: sellWindow.status,
        summary: sellWindow.summary,
        sellWindowStart: sellWindow.recommendedReviewStart,
        sellWindowEnd: sellWindow.recommendedReviewEnd,
        targetEquity: moneyToJson(money(equityMinor + 10_000_00n, currency)),
        monthsToBindingEnd: monthsToEnd,
        currentEquity: moneyToJson(money(equityMinor, currency)),
        recommendedReviewStart: sellWindow.recommendedReviewStart,
        recommendedReviewEnd: sellWindow.recommendedReviewEnd,
        confidence: sellWindow.confidence,
      },
      purchaseWindow: {
        recommendedModelYearLow: purchaseWindow.recommendedModelYearLow,
        recommendedModelYearHigh: purchaseWindow.recommendedModelYearHigh,
        recommendedMileageLowKm: purchaseWindow.recommendedMileageLowKm,
        recommendedMileageHighKm: purchaseWindow.recommendedMileageHighKm,
        expectedHoldingPeriodMonths: purchaseWindow.expectedHoldingPeriodMonths,
        targetSaleMileageKm: purchaseWindow.targetSaleMileageKm,
        confidence: purchaseWindow.confidence,
        insufficientData: purchaseWindow.insufficientData,
        summary: purchaseWindow.summary,
      },
      recommendation: {
        kind: recommendation.kind,
        financialReason: recommendation.financialReason,
        cashflowEffect: recommendation.cashflowEffect,
        householdFit: recommendation.householdFit,
        assumptions: recommendation.assumptions,
        confidence: recommendation.confidence,
        risks: recommendation.risks,
        subjectCandidateId: recommendation.subjectCandidateId,
      },
      lease: leaseBlock,
      acquisitionComparison,
    };
  }

  private mapLease(
    leaseRow: typeof vehicleLeaseAgreements.$inferSelect,
    asOf: string,
    currency: CurrencyCode,
  ) {
    const econ = calculateLeaseEconomics(
      {
        initialFeeMinor: leaseRow.initialFeeMinor,
        monthlyPaymentMinor: leaseRow.monthlyPaymentMinor,
        termMonths: leaseRow.termMonths,
        allowedMileageKm: leaseRow.allowedMileageKm,
        startOn: leaseRow.startOn,
        endOn: leaseRow.endOn,
        currentMileageKm: leaseRow.currentMileageKm,
        excessMileagePriceMinorPerKm: leaseRow.excessPriceMinorPerKm,
        serviceIncluded: leaseRow.serviceIncluded,
        insuranceIncluded: leaseRow.insuranceIncluded,
        tiresIncluded: leaseRow.tiresIncluded,
        expectedReturnCostMinor: leaseRow.expectedReturnCostMinor,
      },
      asOf,
    );
    return {
      name: leaseRow.name,
      totalExpectedLeaseCash: moneyToJson(
        money(econ.totalExpectedLeaseCashMinor, currency),
      ),
      monthlyNormalizedCash: moneyToJson(
        money(econ.monthlyNormalizedCashMinor, currency),
      ),
      costPerSwedishMile: econ.costPerSwedishMileMinor
        ? moneyToJson(money(econ.costPerSwedishMileMinor, currency))
        : null,
      expectedExcessMileageKm: econ.expectedExcessMileageKm,
      expectedExcessChargeLow: moneyToJson(
        money(econ.expectedExcessChargeLowMinor, currency),
      ),
      expectedExcessChargeHigh: moneyToJson(
        money(econ.expectedExcessChargeHighMinor, currency),
      ),
      remainingContractMonths: econ.remainingContractMonths,
      assumptions: econ.assumptions,
    };
  }

  async createCandidate(userId: string, input: CreateVehicleCandidateInput) {
    await this.access.requireMembership(userId, input.householdId);
    const db = getDb();
    const [row] = await db
      .insert(vehicleCandidates)
      .values({
        householdId: input.householdId,
        name: input.name,
        make: input.make,
        model: input.model,
        modelYear: input.modelYear,
        askPriceMinor: BigInt(input.askPriceMinor),
        estimatedMonthlyEconomicMinor: BigInt(input.estimatedMonthlyEconomicMinor),
        notes: input.notes ?? null,
        variant: input.variant ?? null,
        fuelType: input.fuelType ?? "hybrid",
        mileageKm: input.mileageKm,
        seats: input.seats,
        isofixCount: input.isofixCount,
        cargoOk: input.cargoOk ?? true,
        towingOk: input.towingOk ?? false,
        isElectric: input.isElectric ?? false,
        rangeKm: input.rangeKm ?? null,
        holdingPeriodMonths: input.holdingPeriodMonths ?? KEEP_HORIZON_MONTHS,
      })
      .returning();
    return { id: row.id, created: true };
  }

  async createCandidateFromListing(
    userId: string,
    input: CreateVehicleCandidateFromListingInput,
  ) {
    await this.access.requireMembership(userId, input.householdId);
    const db = getDb();
    const [listing] = await db
      .select()
      .from(vehicleMarketListings)
      .where(
        and(
          eq(vehicleMarketListings.id, input.listingId),
          eq(vehicleMarketListings.householdId, input.householdId),
        ),
      )
      .limit(1);
    if (!listing) throw new NotFoundException("Listing not found");

    const monthly =
      input.estimatedMonthlyEconomicMinor ??
      String(Math.round(Number(listing.askPriceMinor) / 72));

    const [row] = await db
      .insert(vehicleCandidates)
      .values({
        householdId: input.householdId,
        name:
          input.name ??
          `${listing.make} ${listing.model} ${listing.modelYear}`,
        make: listing.make,
        model: listing.model,
        modelYear: listing.modelYear,
        variant: listing.variant,
        fuelType: listing.fuelType,
        mileageKm: listing.mileageKm,
        askPriceMinor: listing.askPriceMinor,
        estimatedMonthlyEconomicMinor: BigInt(monthly),
        source: "from_listing",
        sourceListingId: listing.id,
        holdingPeriodMonths: input.holdingPeriodMonths ?? KEEP_HORIZON_MONTHS,
        notes: "Skapad från marknadsannons",
      })
      .returning();
    return { id: row.id, created: true };
  }

  async updateCandidate(
    userId: string,
    candidateId: string,
    input: UpdateVehicleCandidateInput,
  ) {
    await this.access.requireMembership(userId, input.householdId);
    const db = getDb();
    const [existing] = await db
      .select()
      .from(vehicleCandidates)
      .where(
        and(
          eq(vehicleCandidates.id, candidateId),
          eq(vehicleCandidates.householdId, input.householdId),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundException("Candidate not found");

    const patch: Partial<typeof vehicleCandidates.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.name != null) patch.name = input.name;
    if (input.make != null) patch.make = input.make;
    if (input.model != null) patch.model = input.model;
    if (input.modelYear != null) patch.modelYear = input.modelYear;
    if (input.askPriceMinor != null) patch.askPriceMinor = BigInt(input.askPriceMinor);
    if (input.estimatedMonthlyEconomicMinor != null) {
      patch.estimatedMonthlyEconomicMinor = BigInt(
        input.estimatedMonthlyEconomicMinor,
      );
    }
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.variant !== undefined) patch.variant = input.variant;
    if (input.fuelType != null) patch.fuelType = input.fuelType;
    if (input.mileageKm != null) patch.mileageKm = input.mileageKm;
    if (input.seats != null) patch.seats = input.seats;
    if (input.isofixCount != null) patch.isofixCount = input.isofixCount;
    if (input.cargoOk != null) patch.cargoOk = input.cargoOk;
    if (input.towingOk != null) patch.towingOk = input.towingOk;
    if (input.isElectric != null) patch.isElectric = input.isElectric;
    if (input.rangeKm !== undefined) patch.rangeKm = input.rangeKm;
    if (input.holdingPeriodMonths != null) {
      patch.holdingPeriodMonths = input.holdingPeriodMonths;
    }

    const [updated] = await db
      .update(vehicleCandidates)
      .set(patch)
      .where(eq(vehicleCandidates.id, candidateId))
      .returning();
    return { id: updated.id, updated: true };
  }

  async archiveCandidate(
    userId: string,
    householdId: string,
    candidateId: string,
  ) {
    await this.access.requireMembership(userId, householdId);
    const db = getDb();
    const [existing] = await db
      .select()
      .from(vehicleCandidates)
      .where(
        and(
          eq(vehicleCandidates.id, candidateId),
          eq(vehicleCandidates.householdId, householdId),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundException("Candidate not found");

    await db
      .update(vehicleCandidates)
      .set({
        status: "ARCHIVED",
        archivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(vehicleCandidates.id, candidateId));
    return { id: candidateId, archived: true };
  }
}
