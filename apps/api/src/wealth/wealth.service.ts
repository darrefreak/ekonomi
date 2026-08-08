import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import { getDb } from "../db/client";
import {
  accounts,
  financialEvents,
  ledgerEntries,
  ledgerPostings,
} from "../db/schema-economic";
import { vehicles } from "../db/schema-vehicles";
import { HouseholdAccessService } from "../households/household-access.service";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";
import { resolveHouseholdAsOf } from "../common/as-of";

const INVESTMENT_TYPES = ["INVESTMENT", "PENSION", "CRYPTO"] as const;

@Injectable()
export class WealthService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(HouseholdMetricsService)
    private readonly metrics: HouseholdMetricsService,
  ) {}

  private trailingWindow(asOf: string) {
    const end = asOf.slice(0, 10);
    const startDate = new Date(`${end}T00:00:00.000Z`);
    startDate.setUTCFullYear(startDate.getUTCFullYear() - 1);
    return { start: startDate.toISOString().slice(0, 10), end };
  }

  async investments(userId: string, householdId: string, asOfInput?: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = await resolveHouseholdAsOf(householdId, asOfInput);
    const { start, end } = this.trailingWindow(asOf);
    const db = getDb();
    const [aligned, snap] = await Promise.all([
      this.metrics.getLedgerAlignedAccountRows(householdId),
      this.metrics.getFinancialSnapshot(householdId, currency, asOf),
    ]);
    const balanceById = new Map(
      aligned.map((a) => [a.id, a.currentBalanceMinor] as const),
    );

    const rows = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.householdId, householdId),
          inArray(accounts.accountType, [...INVESTMENT_TYPES]),
          eq(accounts.isSystem, false),
          isNull(accounts.archivedAt),
        ),
      );

    const contribRows = await db
      .select({
        eventId: financialEvents.id,
        occurredOn: financialEvents.occurredOn,
        description: financialEvents.description,
        amountMinor: ledgerPostings.amountMinor,
        accountId: ledgerPostings.accountId,
        accountName: accounts.name,
      })
      .from(ledgerPostings)
      .innerJoin(ledgerEntries, eq(ledgerPostings.ledgerEntryId, ledgerEntries.id))
      .innerJoin(
        financialEvents,
        eq(ledgerEntries.financialEventId, financialEvents.id),
      )
      .innerJoin(accounts, eq(ledgerPostings.accountId, accounts.id))
      .where(
        and(
          eq(ledgerPostings.householdId, householdId),
          inArray(accounts.accountType, [...INVESTMENT_TYPES]),
          eq(ledgerPostings.side, "debit"),
          gte(financialEvents.occurredOn, start),
          lte(financialEvents.occurredOn, end),
          sql`${financialEvents.eventType} = 'INVESTMENT'`,
        ),
      )
      .orderBy(desc(financialEvents.occurredOn));

    const contribByAccount = new Map<string, { amount: bigint; count: number }>();
    for (const c of contribRows) {
      const prev = contribByAccount.get(c.accountId) ?? { amount: 0n, count: 0 };
      contribByAccount.set(c.accountId, {
        amount: prev.amount + c.amountMinor,
        count: prev.count + 1,
      });
    }

    const items = rows.map((row) => {
      const contrib = contribByAccount.get(row.id) ?? { amount: 0n, count: 0 };
      const bal = balanceById.get(row.id) ?? row.currentBalanceMinor;
      return {
        id: row.id,
        name: row.name,
        provider: row.provider,
        accountType: row.accountType,
        balance: moneyToJson(money(bal, currency)),
        trailingContributions: moneyToJson(money(contrib.amount, currency)),
        contributionCount: contrib.count,
      };
    });

    const totalContrib = items.reduce(
      (acc, i) => acc + BigInt(i.trailingContributions.amountMinor),
      0n,
    );

    return {
      asOf,
      currency,
      metricMeta: snap.metricMeta,
      totals: {
        // Registry investments_total
        balance: moneyToJson(snap.position.investments),
        trailingContributions: moneyToJson(money(totalContrib, currency)),
      },
      items,
      recentContributions: contribRows.slice(0, 12).map((c) => ({
        id: c.eventId,
        occurredOn: c.occurredOn,
        description: c.description,
        amount: moneyToJson(money(c.amountMinor, currency)),
        accountName: c.accountName,
      })),
    };
  }

  async assets(userId: string, householdId: string, asOfInput?: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = await resolveHouseholdAsOf(householdId, asOfInput);
    const db = getDb();
    const [aligned, snap] = await Promise.all([
      this.metrics.getLedgerAlignedAccountRows(householdId),
      this.metrics.getFinancialSnapshot(householdId, currency, asOf),
    ]);
    const balanceById = new Map(
      aligned.map((a) => [a.id, a.currentBalanceMinor] as const),
    );

    const rows = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.householdId, householdId),
          eq(accounts.accountType, "ASSET"),
          eq(accounts.isSystem, false),
          isNull(accounts.archivedAt),
        ),
      );

    const vehicleRows = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.householdId, householdId));

    const vehicleByAsset = new Map(
      vehicleRows
        .filter((v) => v.linkedAssetAccountId)
        .map((v) => [v.linkedAssetAccountId!, v] as const),
    );

    const items = rows.map((row) => {
      const vehicle = vehicleByAsset.get(row.id);
      const bal = balanceById.get(row.id) ?? row.currentBalanceMinor;
      return {
        id: row.id,
        name: row.name,
        provider: row.provider,
        accountType: row.accountType,
        estimatedValue: moneyToJson(money(bal, currency)),
        vehicleId: vehicle?.id ?? null,
        vehicleName: vehicle
          ? `${vehicle.make} ${vehicle.model}`.trim()
          : null,
        vehicleValueLow: vehicle?.estimatedValueLowMinor
          ? moneyToJson(money(vehicle.estimatedValueLowMinor, currency))
          : null,
        vehicleValueHigh: vehicle?.estimatedValueHighMinor
          ? moneyToJson(money(vehicle.estimatedValueHighMinor, currency))
          : null,
      };
    });

    return {
      asOf,
      currency,
      metricMeta: snap.metricMeta,
      totals: {
        // Registry assets_total
        estimatedValue: moneyToJson(snap.position.assets),
      },
      items,
    };
  }
}
