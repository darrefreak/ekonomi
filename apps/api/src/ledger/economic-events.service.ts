import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  buildCreditCardPayment,
  buildCreditCardPurchase,
  buildInternalTransfer,
  buildInvestmentTransfer,
  buildMortgagePayment,
  buildCashRefund,
  type BalancedLedgerDraft,
} from "@ffos/financial-engine";
import type { CurrencyCode } from "@ffos/domain";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { accounts } from "../db/schema-economic";
import { persistBalancedEvent } from "../db/seed/persist-event";
import { LedgerTruthService } from "./ledger-truth.service";
import { AuditService } from "../audit/audit.service";

async function requireAccount(
  householdId: string,
  accountId: string,
  types?: string[],
) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(accounts)
    .where(
      and(eq(accounts.householdId, householdId), eq(accounts.id, accountId)),
    )
    .limit(1);
  if (!row) throw new BadRequestException("Account not found");
  if (types && !types.includes(row.accountType)) {
    throw new BadRequestException(
      `Account type ${row.accountType} not allowed`,
    );
  }
  return row;
}

@Injectable()
export class EconomicEventsService {
  constructor(
    private readonly ledger: LedgerTruthService,
    private readonly audit: AuditService,
  ) {}

  private async afterWrite(householdId: string, asOf: string, action: string) {
    await this.ledger.refreshDerivedCaches(householdId, asOf);
    await this.audit.record({
      householdId,
      action,
      entity: "financial_event",
      after: { asOf },
      source: "api",
    });
  }

  async persistDraft(input: {
    householdId: string;
    draft: BalancedLedgerDraft;
    occurredOn: string;
    description: string;
    categoryId?: string;
    merchantId?: string;
    sourceAccountId?: string;
    sourceAmountMinor?: bigint;
    isInternalTransfer?: boolean;
    transferGroupId?: string;
    counterpartTx?: {
      accountId: string;
      amountMinor: bigint;
      externalId?: string;
    };
    splits?: Array<{
      categoryId?: string;
      amountMinor: bigint;
      memo?: string;
    }>;
    createReconciliationGroup?: boolean;
    incomeAmountMinor?: bigint;
    sourceType?: string;
    externalId?: string;
  }) {
    const event = await persistBalancedEvent({
      ...input,
      sourceType: input.sourceType ?? "api",
      externalId: input.externalId,
    });
    await this.afterWrite(
      input.householdId,
      input.occurredOn,
      "ledger.event_persist",
    );
    return event;
  }

  async createInternalTransfer(input: {
    householdId: string;
    fromAccountId: string;
    toAccountId: string;
    amountMinor: bigint;
    occurredOn: string;
    description?: string;
    currency?: CurrencyCode;
    externalId?: string;
  }) {
    if (input.amountMinor <= 0n) {
      throw new BadRequestException("amountMinor must be positive");
    }
    await requireAccount(input.householdId, input.fromAccountId, [
      "CHECKING",
      "SAVINGS",
      "CASH",
    ]);
    await requireAccount(input.householdId, input.toAccountId, [
      "CHECKING",
      "SAVINGS",
      "CASH",
    ]);
    const currency = input.currency ?? "SEK";
    const draft = buildInternalTransfer({
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amountMinor: input.amountMinor,
      currency,
    });
    const transferGroupId = randomUUID();
    const externalId =
      input.externalId ??
      `api-transfer-${input.fromAccountId}-${input.toAccountId}-${input.occurredOn}-${input.amountMinor}`;
    return this.persistDraft({
      householdId: input.householdId,
      draft,
      occurredOn: input.occurredOn,
      description: input.description ?? "Intern överföring",
      sourceAccountId: input.fromAccountId,
      sourceAmountMinor: -input.amountMinor,
      isInternalTransfer: true,
      transferGroupId,
      externalId,
      counterpartTx: {
        accountId: input.toAccountId,
        amountMinor: input.amountMinor,
        externalId: `${externalId}-counterpart`,
      },
      createReconciliationGroup: true,
    });
  }

  async createCreditCardPurchase(input: {
    householdId: string;
    creditCardAccountId: string;
    expenseAccountId: string;
    amountMinor: bigint;
    occurredOn: string;
    description?: string;
    categoryId?: string;
    merchantId?: string;
    currency?: CurrencyCode;
  }) {
    await requireAccount(input.householdId, input.creditCardAccountId, [
      "CREDIT_CARD",
    ]);
    await requireAccount(input.householdId, input.expenseAccountId, [
      "EXPENSE",
    ]);
    const draft = buildCreditCardPurchase({
      expenseAccountId: input.expenseAccountId,
      creditCardAccountId: input.creditCardAccountId,
      amountMinor: input.amountMinor,
      currency: input.currency ?? "SEK",
    });
    return this.persistDraft({
      householdId: input.householdId,
      draft,
      occurredOn: input.occurredOn,
      description: input.description ?? "Kreditkortsköp",
      categoryId: input.categoryId,
      merchantId: input.merchantId,
      sourceAccountId: input.creditCardAccountId,
      sourceAmountMinor: -input.amountMinor,
    });
  }

  async createCreditCardPayment(input: {
    householdId: string;
    cashAccountId: string;
    creditCardAccountId: string;
    amountMinor: bigint;
    occurredOn: string;
    description?: string;
    currency?: CurrencyCode;
  }) {
    await requireAccount(input.householdId, input.cashAccountId, [
      "CHECKING",
      "SAVINGS",
      "CASH",
    ]);
    await requireAccount(input.householdId, input.creditCardAccountId, [
      "CREDIT_CARD",
    ]);
    const draft = buildCreditCardPayment({
      cashAccountId: input.cashAccountId,
      creditCardAccountId: input.creditCardAccountId,
      amountMinor: input.amountMinor,
      currency: input.currency ?? "SEK",
    });
    return this.persistDraft({
      householdId: input.householdId,
      draft,
      occurredOn: input.occurredOn,
      description: input.description ?? "Kreditkortsbetalning",
      sourceAccountId: input.cashAccountId,
      sourceAmountMinor: -input.amountMinor,
    });
  }

  async createMortgagePayment(input: {
    householdId: string;
    cashAccountId: string;
    mortgageAccountId: string;
    interestExpenseAccountId: string;
    principalMinor: bigint;
    interestMinor: bigint;
    occurredOn: string;
    description?: string;
    currency?: CurrencyCode;
  }) {
    await requireAccount(input.householdId, input.cashAccountId, [
      "CHECKING",
      "SAVINGS",
      "CASH",
    ]);
    await requireAccount(input.householdId, input.mortgageAccountId, [
      "MORTGAGE",
      "LOAN",
    ]);
    await requireAccount(input.householdId, input.interestExpenseAccountId, [
      "EXPENSE",
    ]);
    const total = input.principalMinor + input.interestMinor;
    const draft = buildMortgagePayment({
      cashAccountId: input.cashAccountId,
      mortgageAccountId: input.mortgageAccountId,
      interestExpenseAccountId: input.interestExpenseAccountId,
      principalMinor: input.principalMinor,
      interestMinor: input.interestMinor,
      currency: input.currency ?? "SEK",
    });
    return this.persistDraft({
      householdId: input.householdId,
      draft,
      occurredOn: input.occurredOn,
      description: input.description ?? "Bolånebetalning",
      sourceAccountId: input.cashAccountId,
      sourceAmountMinor: -total,
      splits: [
        {
          amountMinor: input.principalMinor,
          memo: "principal",
        },
        {
          amountMinor: input.interestMinor,
          memo: "interest",
        },
      ],
    });
  }

  async createInvestmentTransfer(input: {
    householdId: string;
    cashAccountId: string;
    investmentAccountId: string;
    amountMinor: bigint;
    occurredOn: string;
    description?: string;
    currency?: CurrencyCode;
  }) {
    await requireAccount(input.householdId, input.cashAccountId, [
      "CHECKING",
      "SAVINGS",
      "CASH",
    ]);
    await requireAccount(input.householdId, input.investmentAccountId, [
      "INVESTMENT",
      "PENSION",
      "CRYPTO",
    ]);
    const draft = buildInvestmentTransfer({
      cashAccountId: input.cashAccountId,
      investmentAccountId: input.investmentAccountId,
      amountMinor: input.amountMinor,
      currency: input.currency ?? "SEK",
    });
    return this.persistDraft({
      householdId: input.householdId,
      draft,
      occurredOn: input.occurredOn,
      description: input.description ?? "Överföring till investering",
      sourceAccountId: input.cashAccountId,
      sourceAmountMinor: -input.amountMinor,
    });
  }

  async createCashRefund(input: {
    householdId: string;
    cashAccountId: string;
    expenseAccountId: string;
    amountMinor: bigint;
    occurredOn: string;
    description?: string;
    currency?: CurrencyCode;
  }) {
    await requireAccount(input.householdId, input.cashAccountId);
    await requireAccount(input.householdId, input.expenseAccountId, ["EXPENSE"]);
    const draft = buildCashRefund({
      cashAccountId: input.cashAccountId,
      expenseAccountId: input.expenseAccountId,
      amountMinor: input.amountMinor,
      currency: input.currency ?? "SEK",
    });
    return this.persistDraft({
      householdId: input.householdId,
      draft,
      occurredOn: input.occurredOn,
      description: input.description ?? "Återbetalning",
      sourceAccountId: input.cashAccountId,
      sourceAmountMinor: input.amountMinor,
      incomeAmountMinor: 0n,
    });
  }
}
