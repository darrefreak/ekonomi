import {
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import {
  MORTGAGE_RATE_SHOCKS_BPS,
  monthlyInterestFromRateMinor,
  mortgageRateScenarioMonthlyDeltaMinor,
  outstandingLiabilityMinor,
  summarizePrincipalInterest,
} from "@ffos/financial-engine";
import { getDb } from "../db/client";
import {
  accounts,
  financialEvents,
  ledgerEntries,
  ledgerPostings,
} from "../db/schema-economic";
import { HouseholdAccessService } from "../households/household-access.service";

const LIABILITY_TYPES = ["MORTGAGE", "LOAN", "CREDIT_CARD"] as const;

@Injectable()
export class DebtService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
  ) {}

  private trailingWindow(asOf: string) {
    const end = asOf.slice(0, 10);
    const startDate = new Date(`${end}T00:00:00.000Z`);
    startDate.setUTCFullYear(startDate.getUTCFullYear() - 1);
    return { start: startDate.toISOString().slice(0, 10), end };
  }

  private async liabilityAccounts(householdId: string) {
    return getDb()
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.householdId, householdId),
          inArray(accounts.accountType, [...LIABILITY_TYPES]),
          eq(accounts.isSystem, false),
          isNull(accounts.archivedAt),
        ),
      );
  }

  private async paymentRows(
    householdId: string,
    accountId: string,
    start: string,
    end: string,
  ) {
    const db = getDb();
    return db
      .select({
        eventId: financialEvents.id,
        occurredOn: financialEvents.occurredOn,
        description: financialEvents.description,
        principalMinor: financialEvents.debtReductionMinor,
        interestMinor: financialEvents.expenseAmountMinor,
      })
      .from(ledgerPostings)
      .innerJoin(ledgerEntries, eq(ledgerPostings.ledgerEntryId, ledgerEntries.id))
      .innerJoin(
        financialEvents,
        eq(ledgerEntries.financialEventId, financialEvents.id),
      )
      .where(
        and(
          eq(ledgerPostings.householdId, householdId),
          eq(ledgerPostings.accountId, accountId),
          sql`${ledgerPostings.memo} = 'principal'`,
          gte(financialEvents.occurredOn, start),
          lte(financialEvents.occurredOn, end),
        ),
      )
      .orderBy(desc(financialEvents.occurredOn));
  }

  private mapItem(
    row: Awaited<ReturnType<DebtService["liabilityAccounts"]>>[number],
    currency: CurrencyCode,
    trailing: { principalMinor: bigint; interestMinor: bigint; paymentCount: number },
  ) {
    const outstandingMinor = outstandingLiabilityMinor(row.currentBalanceMinor);
    let rateBps = row.interestRateBps;
    // Fallback for DBs seeded before interest_rate_bps existed.
    if (
      (rateBps == null || rateBps <= 0) &&
      outstandingMinor > 0n &&
      trailing.interestMinor > 0n
    ) {
      rateBps = Number((trailing.interestMinor * 10_000n) / outstandingMinor);
    }
    const estimatedMonthly =
      rateBps != null && rateBps > 0
        ? monthlyInterestFromRateMinor(outstandingMinor, rateBps)
        : null;

    const rateScenarios =
      row.accountType === "MORTGAGE" && rateBps != null && rateBps > 0
        ? MORTGAGE_RATE_SHOCKS_BPS.map((delta) => {
            const monthlyDelta = mortgageRateScenarioMonthlyDeltaMinor({
              principalMinor: outstandingMinor,
              currentAnnualRateBps: rateBps,
              rateDeltaBps: delta,
            });
            const projected =
              (estimatedMonthly ?? 0n) + monthlyDelta;
            return {
              rateDeltaBps: delta,
              label: `+${(delta / 100).toFixed(2)} %`,
              monthlyInterestDelta: moneyToJson(money(monthlyDelta, currency)),
              projectedMonthlyInterest: moneyToJson(money(projected, currency)),
            };
          })
        : [];

    return {
      id: row.id,
      name: row.name,
      provider: row.provider,
      accountType: row.accountType as "MORTGAGE" | "LOAN" | "CREDIT_CARD",
      outstanding: moneyToJson(money(outstandingMinor, currency)),
      interestRateBps: rateBps ?? null,
      interestRatePercent: rateBps != null ? rateBps / 100 : null,
      bindingEndDate: row.bindingEndDate,
      estimatedMonthlyInterest: estimatedMonthly
        ? moneyToJson(money(estimatedMonthly, currency))
        : null,
      trailingPrincipal: moneyToJson(money(trailing.principalMinor, currency)),
      trailingInterest: moneyToJson(money(trailing.interestMinor, currency)),
      trailingPaymentCount: trailing.paymentCount,
      rateScenarios,
    };
  }

  async list(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const { start, end } = this.trailingWindow(asOf);
    const rows = await this.liabilityAccounts(householdId);

    const items: ReturnType<DebtService["mapItem"]>[] = [];
    for (const row of rows) {
      const payments = await this.paymentRows(householdId, row.id, start, end);
      const trailing = summarizePrincipalInterest(
        payments.map((p) => ({
          principalMinor: p.principalMinor,
          interestMinor: p.interestMinor,
        })),
      );
      items.push(this.mapItem(row, currency, trailing));
    }

    const sumType = (type: string) =>
      items
        .filter((i) => i.accountType === type)
        .reduce((acc, i) => acc + BigInt(i.outstanding.amountMinor), 0n);

    const totalOutstanding = items.reduce(
      (acc, i) => acc + BigInt(i.outstanding.amountMinor),
      0n,
    );
    const trailingPrincipal = items.reduce(
      (acc, i) => acc + BigInt(i.trailingPrincipal.amountMinor),
      0n,
    );
    const trailingInterest = items.reduce(
      (acc, i) => acc + BigInt(i.trailingInterest.amountMinor),
      0n,
    );

    return {
      asOf,
      currency,
      totals: {
        outstanding: moneyToJson(money(totalOutstanding, currency)),
        mortgages: moneyToJson(money(sumType("MORTGAGE"), currency)),
        loans: moneyToJson(money(sumType("LOAN"), currency)),
        creditCards: moneyToJson(money(sumType("CREDIT_CARD"), currency)),
        trailingPrincipal: moneyToJson(money(trailingPrincipal, currency)),
        trailingInterest: moneyToJson(money(trailingInterest, currency)),
      },
      items,
    };
  }

  async detail(userId: string, householdId: string, accountId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const { start, end } = this.trailingWindow(asOf);

    const [row] = await getDb()
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.id, accountId),
          eq(accounts.householdId, householdId),
          inArray(accounts.accountType, [...LIABILITY_TYPES]),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException("Debt account not found");

    const payments = await this.paymentRows(householdId, accountId, start, end);
    const trailing = summarizePrincipalInterest(
      payments.map((p) => ({
        principalMinor: p.principalMinor,
        interestMinor: p.interestMinor,
      })),
    );

    return {
      asOf,
      item: this.mapItem(row, currency, trailing),
      payments: payments.slice(0, 24).map((p) => ({
        id: p.eventId,
        occurredOn: p.occurredOn,
        description: p.description,
        principal: moneyToJson(money(p.principalMinor, currency)),
        interest: moneyToJson(money(p.interestMinor, currency)),
        total: moneyToJson(
          money(p.principalMinor + p.interestMinor, currency),
        ),
      })),
    };
  }

  /** Primary mortgage context for scenario rate shocks. */
  async primaryMortgageContext(householdId: string) {
    const rows = await this.liabilityAccounts(householdId);
    const mortgage = rows.find(
      (r) => r.accountType === "MORTGAGE" && r.interestRateBps != null,
    );
    if (!mortgage || mortgage.interestRateBps == null) return null;
    return {
      principalMinor: outstandingLiabilityMinor(mortgage.currentBalanceMinor),
      currentAnnualRateBps: mortgage.interestRateBps,
    };
  }
}
