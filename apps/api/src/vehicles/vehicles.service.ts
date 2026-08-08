import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { and, desc, eq, gte } from "drizzle-orm";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import type { CreateVehicleInput, UpdateVehicleInput } from "@ffos/schemas";
import {
  kmToSwedishMiles,
  projectedTco,
  vehicleCashOutflow,
  vehicleCostPerKm,
  vehicleCostPerSwedishMile,
  vehicleEconomicCost,
  vehicleNetEquity,
} from "@ffos/financial-engine";
import { getDb } from "../db/client";
import { accounts, financialEvents } from "../db/schema-economic";
import {
  vehicleCostEvents,
  vehicleFinanceAgreements,
  vehicleOdometerReadings,
  vehicleOwnerships,
  vehicles,
  vehicleUsageProfiles,
} from "../db/schema-vehicles";
import { AuditService } from "../audit/audit.service";
import { HouseholdAccessService } from "../households/household-access.service";
import type { EconomicEventsService } from "../ledger/economic-events.service";
import { ECONOMIC_EVENTS_SERVICE } from "../ledger/economic-events.token";
import { resolveHouseholdAsOf } from "../common/as-of";

const CASH_ACCOUNT_TYPES = new Set(["CHECKING", "SAVINGS", "CASH"]);

@Injectable()
export class VehiclesService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    /** Write path only; read-only consumers (jobs, tests) construct without it. */
    @Optional()
    @Inject(ECONOMIC_EVENTS_SERVICE)
    private readonly events?: EconomicEventsService,
    @Optional()
    @Inject(AuditService)
    private readonly audit?: AuditService,
  ) {}

  private requireWriteDeps() {
    if (!this.events || !this.audit) {
      throw new Error("VehiclesService write path requires ledger and audit services");
    }
    return { events: this.events, audit: this.audit };
  }

  async list(userId: string, householdId: string) {
    await this.access.requireMembership(userId, householdId);
    const asOf = await resolveHouseholdAsOf(householdId);
    const db = getDb();
    const rows = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.householdId, householdId));

    const items = [];
    for (const v of rows) {
      const detail = await this.buildDetail(v.id, householdId, asOf);
      items.push({
        id: v.id,
        name: v.name,
        make: v.make,
        model: v.model,
        modelYear: v.modelYear,
        registrationNumber: v.registrationNumber,
        ownershipType: detail.ownershipType,
        estimatedValueMid: detail.valuation.mid,
        remainingDebt: detail.finance?.remaining ?? null,
        netEquity: detail.metrics.netEquity,
        monthlyEconomicCost: detail.metrics.monthlyEconomicCost,
      });
    }

    return { asOf, items };
  }

  async get(userId: string, householdId: string, vehicleId: string) {
    await this.access.requireMembership(userId, householdId);
    const asOf = await resolveHouseholdAsOf(householdId);
    return this.buildDetail(vehicleId, householdId, asOf);
  }

  /**
   * Add a vehicle the way a household actually gets one (RT-012).
   *
   * Financial semantics follow accepted P0 rules:
   * - NEW_PURCHASE books a ledger command on the purchase date — cash down,
   *   asset up, debt up. A purchase is never consumption and loan proceeds are
   *   never income.
   * - EXISTING onboards an already-owned vehicle as an opening position:
   *   asset and loan accounts start at their current values, so the current
   *   period gains no fake spending, income or cashflow.
   */
  async create(userId: string, input: CreateVehicleInput) {
    const { events, audit } = this.requireWriteDeps();
    await this.access.requireCanWrite(userId, input.householdId);
    const db = getDb();
    const householdId = input.householdId;
    const currency = (input.currency || "SEK") as CurrencyCode;
    const isLease = input.purchaseType === "PRIVATE_LEASE";
    const isFinanced = input.purchaseType === "FINANCED";
    const isNewPurchase = input.acquisitionMode === "NEW_PURCHASE";

    const purchasePriceMinor = BigInt(input.purchasePriceMinor);
    const currentValueMinor = BigInt(input.currentValueMinor);
    const outstandingDebtMinor = BigInt(input.outstandingDebtMinor ?? "0");
    const downPaymentMinor = BigInt(
      input.downPaymentMinor ?? (isFinanced ? "0" : input.purchasePriceMinor),
    );

    if (isNewPurchase && !isLease) {
      const [cash] = await db
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.householdId, householdId),
            eq(accounts.id, input.cashAccountId!),
          ),
        )
        .limit(1);
      if (!cash || !CASH_ACCOUNT_TYPES.has(cash.accountType)) {
        throw new BadRequestException({
          code: "VALIDATION_ERROR",
          message: "Kontrollera uppgifterna och försök igen.",
          fields: { cashAccountId: "Välj ett giltigt kontantkonto." },
        });
      }
    }

    // Opening positions only for onboarding; a new purchase starts at zero and
    // is moved by the ledger command below.
    const assetOpeningMinor = isNewPurchase ? 0n : currentValueMinor;
    const loanOpeningMinor = isNewPurchase ? 0n : outstandingDebtMinor;

    let assetAccountId: string | undefined;
    let loanAccountId: string | undefined;

    if (!isLease) {
      const [assetAccount] = await db
        .insert(accounts)
        .values({
          householdId,
          name: `${input.name} (fordon)`,
          accountType: "ASSET",
          currency,
          isShared: true,
          isSystem: false,
          connectionStatus: "DISCONNECTED",
          openingBalanceMinor: assetOpeningMinor,
          currentBalanceMinor: assetOpeningMinor,
          reportedBalanceMinor: assetOpeningMinor,
        })
        .returning();
      assetAccountId = assetAccount.id;

      if (isFinanced && (outstandingDebtMinor > 0n || isNewPurchase)) {
        const [loanAccount] = await db
          .insert(accounts)
          .values({
            householdId,
            name: `${input.name} (billån)`,
            accountType: "LOAN",
            currency,
            isShared: true,
            isSystem: false,
            connectionStatus: "DISCONNECTED",
            openingBalanceMinor: loanOpeningMinor,
            currentBalanceMinor: loanOpeningMinor,
            reportedBalanceMinor: loanOpeningMinor,
          })
          .returning();
        loanAccountId = loanAccount.id;
      }
    }

    const [vehicle] = await db
      .insert(vehicles)
      .values({
        householdId,
        name: input.name.trim(),
        make: input.make.trim(),
        model: [input.model.trim(), input.variant?.trim()]
          .filter(Boolean)
          .join(" ")
          .slice(0, 80),
        modelYear: input.modelYear,
        registrationNumber: input.registrationNumber?.trim() || null,
        fuelType: input.fuelType.toLowerCase(),
        currency,
        purchasePriceMinor,
        purchaseDate: input.purchaseDate,
        estimatedValueLowMinor: (currentValueMinor * 95n) / 100n,
        estimatedValueMidMinor: currentValueMinor,
        estimatedValueHighMinor: (currentValueMinor * 105n) / 100n,
        valuationAsOf: await resolveHouseholdAsOf(householdId),
        linkedAssetAccountId: assetAccountId ?? null,
        linkedLoanAccountId: loanAccountId ?? null,
        notes: input.transmission ? `Växellåda: ${input.transmission}` : null,
      })
      .returning();

    await db.insert(vehicleOwnerships).values({
      householdId,
      vehicleId: vehicle.id,
      ownershipType: isLease
        ? "PRIVATE_LEASE"
        : isFinanced
          ? "FINANCED"
          : "PRIVATE_OWNED",
      ownerSharePercent: "100",
      startedOn: input.purchaseDate,
    });

    await db.insert(vehicleUsageProfiles).values({
      householdId,
      vehicleId: vehicle.id,
      annualKm: input.annualKm ?? 15_000,
      commuteSharePercent: "60",
    });

    if (input.currentOdometerKm != null) {
      await db.insert(vehicleOdometerReadings).values({
        householdId,
        vehicleId: vehicle.id,
        readingKm: input.currentOdometerKm,
        recordedOn: await resolveHouseholdAsOf(householdId),
        source: "manual",
      });
    }

    if (isFinanced && outstandingDebtMinor >= 0n && loanAccountId) {
      await db.insert(vehicleFinanceAgreements).values({
        householdId,
        vehicleId: vehicle.id,
        lender: input.financeLender?.trim() || "Okänd långivare",
        principalMinor: isNewPurchase
          ? purchasePriceMinor - downPaymentMinor
          : outstandingDebtMinor,
        remainingMinor: isNewPurchase
          ? purchasePriceMinor - downPaymentMinor
          : outstandingDebtMinor,
        interestRateBps: input.financeInterestRateBps ?? 0,
        monthlyPaymentMinor: BigInt(input.financeMonthlyPaymentMinor ?? "0"),
        currency,
        startDate: input.purchaseDate,
        endDate: input.financeEndDate ?? null,
      });
    }

    if (isNewPurchase && !isLease && assetAccountId) {
      if (isFinanced && loanAccountId) {
        await events.createFinancedAssetPurchase({
          householdId,
          cashAccountId: input.cashAccountId!,
          assetAccountId,
          loanAccountId,
          purchasePriceMinor,
          downPaymentMinor,
          occurredOn: input.purchaseDate,
          description: `Köp av ${input.name}`,
          vehicleId: vehicle.id,
          currency,
        });
      } else {
        await events.createAssetPurchase({
          householdId,
          cashAccountId: input.cashAccountId!,
          assetAccountId,
          amountMinor: purchasePriceMinor,
          occurredOn: input.purchaseDate,
          description: `Köp av ${input.name}`,
          vehicleId: vehicle.id,
          currency,
        });
      }
    }

    await audit.record({
      householdId,
      actorUserId: userId,
      action: "vehicle.create",
      entity: "vehicle",
      entityId: vehicle.id,
      after: {
        name: vehicle.name,
        acquisitionMode: input.acquisitionMode,
        purchaseType: input.purchaseType,
        assetAccountId: assetAccountId ?? null,
        loanAccountId: loanAccountId ?? null,
      },
    });

    return this.get(userId, householdId, vehicle.id);
  }

  /**
   * Correct descriptive vehicle facts. Financial state stays ledger-derived:
   * valuation writes only touch the vehicle's estimated value, never postings.
   */
  async update(userId: string, vehicleId: string, input: UpdateVehicleInput) {
    const { audit } = this.requireWriteDeps();
    await this.access.requireCanWrite(userId, input.householdId);
    const db = getDb();
    const [existing] = await db
      .select()
      .from(vehicles)
      .where(
        and(
          eq(vehicles.id, vehicleId),
          eq(vehicles.householdId, input.householdId),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundException("Vehicle not found");

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name != null) patch.name = input.name.trim();
    if (input.registrationNumber !== undefined) {
      patch.registrationNumber = input.registrationNumber?.trim() || null;
    }
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.currentValueMinor != null) {
      const mid = BigInt(input.currentValueMinor);
      patch.estimatedValueLowMinor = (mid * 95n) / 100n;
      patch.estimatedValueMidMinor = mid;
      patch.estimatedValueHighMinor = (mid * 105n) / 100n;
      patch.valuationAsOf = await resolveHouseholdAsOf(input.householdId);
    }

    await db.update(vehicles).set(patch).where(eq(vehicles.id, vehicleId));

    if (input.currentOdometerKm != null) {
      await db.insert(vehicleOdometerReadings).values({
        householdId: input.householdId,
        vehicleId,
        readingKm: input.currentOdometerKm,
        recordedOn: await resolveHouseholdAsOf(input.householdId),
        source: "manual",
      });
    }

    if (input.annualKm != null) {
      const [usage] = await db
        .select()
        .from(vehicleUsageProfiles)
        .where(eq(vehicleUsageProfiles.vehicleId, vehicleId))
        .limit(1);
      if (usage) {
        await db
          .update(vehicleUsageProfiles)
          .set({ annualKm: input.annualKm, updatedAt: new Date() })
          .where(eq(vehicleUsageProfiles.id, usage.id));
      } else {
        await db.insert(vehicleUsageProfiles).values({
          householdId: input.householdId,
          vehicleId,
          annualKm: input.annualKm,
        });
      }
    }

    await audit.record({
      householdId: input.householdId,
      actorUserId: userId,
      action: "vehicle.update",
      entity: "vehicle",
      entityId: vehicleId,
      after: { fields: Object.keys(patch).filter((k) => k !== "updatedAt") },
    });

    return this.get(userId, input.householdId, vehicleId);
  }

  private async buildDetail(vehicleId: string, householdId: string, asOf: string) {
    const db = getDb();
    const [v] = await db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, vehicleId), eq(vehicles.householdId, householdId)))
      .limit(1);
    if (!v) throw new NotFoundException("Vehicle not found");

    const currency = (v.currency || "SEK") as CurrencyCode;
    const [ownership] = await db
      .select()
      .from(vehicleOwnerships)
      .where(eq(vehicleOwnerships.vehicleId, vehicleId))
      .limit(1);
    const [usage] = await db
      .select()
      .from(vehicleUsageProfiles)
      .where(eq(vehicleUsageProfiles.vehicleId, vehicleId))
      .limit(1);
    const [finance] = await db
      .select()
      .from(vehicleFinanceAgreements)
      .where(eq(vehicleFinanceAgreements.vehicleId, vehicleId))
      .limit(1);
    const odometerRows = await db
      .select()
      .from(vehicleOdometerReadings)
      .where(eq(vehicleOdometerReadings.vehicleId, vehicleId))
      // Same-day corrections are common; the newest write wins.
      .orderBy(
        desc(vehicleOdometerReadings.recordedOn),
        desc(vehicleOdometerReadings.createdAt),
      );
    const odo = odometerRows[0];

    const from = new Date(`${asOf}T00:00:00.000Z`);
    from.setUTCFullYear(from.getUTCFullYear() - 1);
    const fromStr = from.toISOString().slice(0, 10);

    const costs = await db
      .select()
      .from(vehicleCostEvents)
      .where(
        and(
          eq(vehicleCostEvents.vehicleId, vehicleId),
          gte(vehicleCostEvents.occurredOn, fromStr),
        ),
      )
      .orderBy(desc(vehicleCostEvents.occurredOn));

    const linkedEventRows = await db
      .select({
        id: financialEvents.id,
        occurredOn: financialEvents.occurredOn,
        description: financialEvents.description,
        expenseAmountMinor: financialEvents.expenseAmountMinor,
      })
      .from(financialEvents)
      .where(
        and(
          eq(financialEvents.householdId, householdId),
          eq(financialEvents.vehicleId, vehicleId),
        ),
      )
      .orderBy(desc(financialEvents.occurredOn))
      .limit(40);

    const costInputs = costs.map((c) => ({
      kind: c.kind,
      amountMinor: c.amountMinor,
      isEconomicCost: c.isEconomicCost,
    }));
    const cash12 = vehicleCashOutflow(costInputs);
    const econ12 = vehicleEconomicCost(costInputs);
    const monthly = econ12 / 12n;
    const annualKm = usage?.annualKm ?? 15_000;
    const equity = vehicleNetEquity({
      estimatedValueMidMinor: v.estimatedValueMidMinor ?? 0n,
      remainingDebtMinor: finance?.remainingMinor ?? 0n,
      sellingCostMinor: 5_000_00n,
    });

    return {
      id: v.id,
      name: v.name,
      make: v.make,
      model: v.model,
      modelYear: v.modelYear,
      registrationNumber: v.registrationNumber,
      fuelType: v.fuelType,
      ownershipType: ownership?.ownershipType ?? "OTHER",
      purchasePrice: v.purchasePriceMinor
        ? moneyToJson(money(v.purchasePriceMinor, currency))
        : null,
      purchaseDate: v.purchaseDate,
      linkedAssetAccountId: v.linkedAssetAccountId ?? null,
      linkedLoanAccountId: v.linkedLoanAccountId ?? null,
      valuation: {
        low: v.estimatedValueLowMinor
          ? moneyToJson(money(v.estimatedValueLowMinor, currency))
          : null,
        mid: v.estimatedValueMidMinor
          ? moneyToJson(money(v.estimatedValueMidMinor, currency))
          : null,
        high: v.estimatedValueHighMinor
          ? moneyToJson(money(v.estimatedValueHighMinor, currency))
          : null,
        asOf: v.valuationAsOf,
      },
      finance: finance
        ? {
            lender: finance.lender,
            remaining: moneyToJson(money(finance.remainingMinor, currency)),
            monthlyPayment: moneyToJson(money(finance.monthlyPaymentMinor, currency)),
            interestRatePercent: finance.interestRateBps / 100,
            endDate: finance.endDate,
          }
        : null,
      usage: {
        annualKm,
        annualSwedishMiles: kmToSwedishMiles(annualKm),
        currentOdometerKm: odo?.readingKm ?? null,
      },
      metrics: {
        cashOutflow12m: moneyToJson(money(cash12, currency)),
        economicCost12m: moneyToJson(money(econ12, currency)),
        monthlyEconomicCost: moneyToJson(money(monthly, currency)),
        costPerKm: moneyToJson(money(vehicleCostPerKm(econ12, annualKm), currency)),
        costPerSwedishMile: moneyToJson(
          money(vehicleCostPerSwedishMile(econ12, annualKm), currency),
        ),
        netEquity: moneyToJson(money(equity.netEquityMinor, currency)),
        negativeEquity: equity.negativeEquity,
        projectedTco12m: moneyToJson(money(projectedTco(monthly, 12), currency)),
        projectedTco24m: moneyToJson(money(projectedTco(monthly, 24), currency)),
        projectedTco36m: moneyToJson(money(projectedTco(monthly, 36), currency)),
      },
      recentCosts: costs.slice(0, 20).map((c) => ({
        id: c.id,
        kind: c.kind,
        occurredOn: c.occurredOn,
        amount: moneyToJson(money(c.amountMinor, currency)),
        isEconomicCost: c.isEconomicCost,
        description: c.description,
        odometerKm: c.odometerKm,
      })),
      costs: costs.map((c) => ({
        id: c.id,
        kind: c.kind,
        occurredOn: c.occurredOn,
        amount: moneyToJson(money(c.amountMinor, currency)),
        isEconomicCost: c.isEconomicCost,
        description: c.description,
        odometerKm: c.odometerKm,
      })),
      odometerHistory: odometerRows.map((r) => ({
        id: r.id,
        readingKm: r.readingKm,
        recordedOn: r.recordedOn,
        source: r.source,
      })),
      linkedEvents: linkedEventRows.map((e) => ({
        id: e.id,
        occurredOn: e.occurredOn,
        description: e.description,
        amount: moneyToJson(money(e.expenseAmountMinor ?? 0n, currency)),
      })),
    };
  }
}
