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

const INVESTMENT_TYPES = ["INVESTMENT", "PENSION", "CRYPTO"] as const;

@Injectable()
export class WealthService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
  ) {}

  private trailingWindow(asOf: string) {
    const end = asOf.slice(0, 10);
    const startDate = new Date(`${end}T00:00:00.000Z`);
    startDate.setUTCFullYear(startDate.getUTCFullYear() - 1);
    return { start: startDate.toISOString().slice(0, 10), end };
  }

  async investments(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const { start, end } = this.trailingWindow(asOf);
    const db = getDb();

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
      return {
        id: row.id,
        name: row.name,
        provider: row.provider,
        accountType: row.accountType,
        balance: moneyToJson(money(row.currentBalanceMinor, currency)),
        trailingContributions: moneyToJson(money(contrib.amount, currency)),
        contributionCount: contrib.count,
      };
    });

    const totalBalance = items.reduce(
      (acc, i) => acc + BigInt(i.balance.amountMinor),
      0n,
    );
    const totalContrib = items.reduce(
      (acc, i) => acc + BigInt(i.trailingContributions.amountMinor),
      0n,
    );

    return {
      asOf,
      currency,
      totals: {
        balance: moneyToJson(money(totalBalance, currency)),
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

  async assets(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const db = getDb();

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
      return {
        id: row.id,
        name: row.name,
        provider: row.provider,
        accountType: row.accountType,
        estimatedValue: moneyToJson(money(row.currentBalanceMinor, currency)),
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

    const total = items.reduce(
      (acc, i) => acc + BigInt(i.estimatedValue.amountMinor),
      0n,
    );

    return {
      asOf,
      currency,
      totals: {
        estimatedValue: moneyToJson(money(total, currency)),
      },
      items,
    };
  }
}
