import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  buildAssetDepreciation,
  buildAssetPurchaseAtFairValue,
  buildCashExpense,
  buildCreditCardPayment,
  buildCreditCardPurchase,
  buildFinancedAssetPurchase,
  buildInternalTransfer,
  buildInvestmentTransfer,
  buildMortgagePayment,
  buildCashRefund,
  type BalancedLedgerDraft,
} from "@ffos/financial-engine";
import type { CurrencyCode } from "@ffos/domain";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  accounts,
  financialEvents,
  sourceTransactionLinks,
  sourceTransactions,
} from "../db/schema-economic";
import { auditLogs } from "../db/schema";
import {
  FinancialCommandFailedError,
  IdempotencyConflictError,
  persistBalancedEvent,
  replaceEventSplits,
  reviseEventEconomicMeaning,
  type FinancialCommandType,
  type PersistFailPoint,
  type PersistSplit,
} from "../db/seed/persist-event";
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

function mapPersistError(err: unknown): never {
  if (err instanceof IdempotencyConflictError) {
    throw new ConflictException({
      code: "IDEMPOTENCY_CONFLICT",
      message: "Samma idempotency-nyckel med annat ekonomiskt innehåll.",
    });
  }
  if (err instanceof FinancialCommandFailedError) {
    throw new BadRequestException({
      code: "FINANCIAL_COMMAND_FAILED",
      message: "Finansiellt kommando misslyckades.",
      fields: { _: err.message },
    });
  }
  throw err;
}

@Injectable()
export class EconomicEventsService {
  constructor(
    private readonly ledger: LedgerTruthService,
    /** Retained for Nest/module DI parity; financial audit rows write inside persist txn. */
    private readonly _audit: AuditService,
  ) {}

  /** Post-commit derived cache only — never inside the financial txn. */
  private async afterCommit(householdId: string, asOf: string) {
    await this.ledger.refreshDerivedCaches(householdId, asOf);
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
    vehicleId?: string;
    commandType?: FinancialCommandType;
    failPoint?: PersistFailPoint;
  }) {
    try {
      const event = await persistBalancedEvent({
        ...input,
        sourceType: input.sourceType ?? "api",
        externalId: input.externalId,
        vehicleId: input.vehicleId,
        commandType: input.commandType ?? "LEDGER_EVENT",
        audit: {
          action: "ledger.event_persist",
          after: { asOf: input.occurredOn },
          source: "api",
        },
      });
      await this.afterCommit(input.householdId, input.occurredOn);
      return event;
    } catch (err) {
      mapPersistError(err);
    }
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
    failPoint?: PersistFailPoint;
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
      commandType: "INTERNAL_TRANSFER",
      counterpartTx: {
        accountId: input.toAccountId,
        amountMinor: input.amountMinor,
        externalId: `${externalId}-counterpart`,
      },
      createReconciliationGroup: true,
      failPoint: input.failPoint,
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
    externalId?: string;
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
      externalId: input.externalId,
      commandType: "CREDIT_CARD_PURCHASE",
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
    externalId?: string;
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
    const externalId =
      input.externalId ??
      `api-cc-pay-${input.cashAccountId}-${input.creditCardAccountId}-${input.occurredOn}-${input.amountMinor}`;
    return this.persistDraft({
      householdId: input.householdId,
      draft,
      occurredOn: input.occurredOn,
      description: input.description ?? "Kreditkortsbetalning",
      sourceAccountId: input.cashAccountId,
      sourceAmountMinor: -input.amountMinor,
      externalId,
      commandType: "CREDIT_CARD_PAYMENT",
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
    externalId?: string;
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
      externalId: input.externalId,
      commandType: "MORTGAGE_PAYMENT",
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
    externalId?: string;
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
      externalId: input.externalId,
      commandType: "INVESTMENT_TRANSFER",
    });
  }

  async resolveExpenseBook(householdId: string) {
    const db = getDb();
    const [row] = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.householdId, householdId),
          eq(accounts.accountType, "EXPENSE"),
          eq(accounts.isSystem, true),
        ),
      )
      .limit(1);
    if (!row) throw new BadRequestException("Expense book not found");
    return row;
  }

  async createCashRefund(input: {
    householdId: string;
    cashAccountId: string;
    expenseAccountId?: string;
    amountMinor: bigint;
    occurredOn: string;
    description?: string;
    currency?: CurrencyCode;
    externalId?: string;
  }) {
    await requireAccount(input.householdId, input.cashAccountId);
    const expenseAccountId =
      input.expenseAccountId ??
      (await this.resolveExpenseBook(input.householdId)).id;
    await requireAccount(input.householdId, expenseAccountId, ["EXPENSE"]);
    const draft = buildCashRefund({
      cashAccountId: input.cashAccountId,
      expenseAccountId,
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
      externalId: input.externalId,
      commandType: "CASH_REFUND",
    });
  }

  async createAssetPurchase(input: {
    householdId: string;
    cashAccountId: string;
    assetAccountId: string;
    amountMinor: bigint;
    occurredOn: string;
    description?: string;
    vehicleId?: string;
    currency?: CurrencyCode;
    externalId?: string;
  }) {
    if (input.amountMinor <= 0n) {
      throw new BadRequestException("amountMinor must be positive");
    }
    await requireAccount(input.householdId, input.cashAccountId, [
      "CHECKING",
      "SAVINGS",
      "CASH",
    ]);
    await requireAccount(input.householdId, input.assetAccountId, ["ASSET"]);
    const draft = buildAssetPurchaseAtFairValue({
      cashAccountId: input.cashAccountId,
      assetAccountId: input.assetAccountId,
      amountMinor: input.amountMinor,
      currency: input.currency ?? "SEK",
    });
    return this.persistDraft({
      householdId: input.householdId,
      draft,
      occurredOn: input.occurredOn,
      description: input.description ?? "Tillgångsköp",
      sourceAccountId: input.cashAccountId,
      sourceAmountMinor: -input.amountMinor,
      vehicleId: input.vehicleId,
      externalId:
        input.externalId ??
        `api-purchase-${input.assetAccountId}-${input.occurredOn}-${input.amountMinor}`,
      commandType: "LEDGER_EVENT",
    });
  }

  async createFinancedAssetPurchase(input: {
    householdId: string;
    cashAccountId: string;
    assetAccountId: string;
    loanAccountId: string;
    purchasePriceMinor: bigint;
    downPaymentMinor: bigint;
    occurredOn: string;
    description?: string;
    vehicleId?: string;
    currency?: CurrencyCode;
    externalId?: string;
  }) {
    await requireAccount(input.householdId, input.cashAccountId, [
      "CHECKING",
      "SAVINGS",
      "CASH",
    ]);
    await requireAccount(input.householdId, input.assetAccountId, ["ASSET"]);
    await requireAccount(input.householdId, input.loanAccountId, [
      "LOAN",
      "MORTGAGE",
    ]);
    const draft = buildFinancedAssetPurchase({
      cashAccountId: input.cashAccountId,
      assetAccountId: input.assetAccountId,
      loanAccountId: input.loanAccountId,
      purchasePriceMinor: input.purchasePriceMinor,
      downPaymentMinor: input.downPaymentMinor,
      currency: input.currency ?? "SEK",
    });
    return this.persistDraft({
      householdId: input.householdId,
      draft,
      occurredOn: input.occurredOn,
      description: input.description ?? "Finansierat tillgångsköp",
      sourceAccountId: input.cashAccountId,
      sourceAmountMinor: -input.downPaymentMinor,
      vehicleId: input.vehicleId,
      externalId:
        input.externalId ??
        `api-financed-${input.assetAccountId}-${input.occurredOn}-${input.purchasePriceMinor}`,
      commandType: "LEDGER_EVENT",
    });
  }

  async reviseExpenseToTransfer(input: {
    householdId: string;
    financialEventId: string;
    fromAccountId: string;
    toAccountId: string;
    amountMinor: bigint;
    occurredOn: string;
    description?: string;
  }) {
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
    const draft = buildInternalTransfer({
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amountMinor: input.amountMinor,
      currency: "SEK",
    });
    return this.reviseClassification({
      householdId: input.householdId,
      financialEventId: input.financialEventId,
      draft,
      occurredOn: input.occurredOn,
      description: input.description ?? "Omklassificerad intern överföring",
      isInternalTransfer: true,
    });
  }

  /**
   * Mark financial event REVERSED — excluded from reconstruct + period totals.
   * Idempotent if already REVERSED.
   */
  async reverseFinancialEvent(input: {
    householdId: string;
    financialEventId: string;
  }) {
    const db = getDb();
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    try {
      const event = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(financialEvents)
          .where(
            and(
              eq(financialEvents.id, input.financialEventId),
              eq(financialEvents.householdId, input.householdId),
            ),
          )
          .limit(1);
        if (!existing) {
          throw new FinancialCommandFailedError("Financial event not found");
        }
        if (existing.status === "REVERSED") return existing;

        const [updated] = await tx
          .update(financialEvents)
          .set({ status: "REVERSED", updatedAt: new Date() })
          .where(eq(financialEvents.id, input.financialEventId))
          .returning();

        const links = await tx
          .select({
            sourceTransactionId: sourceTransactionLinks.sourceTransactionId,
          })
          .from(sourceTransactionLinks)
          .where(
            eq(
              sourceTransactionLinks.financialEventId,
              input.financialEventId,
            ),
          );
        for (const link of links) {
          await tx
            .update(sourceTransactions)
            .set({ status: "REVERSED", updatedAt: new Date() })
            .where(eq(sourceTransactions.id, link.sourceTransactionId));
        }

        await tx.insert(auditLogs).values({
          householdId: input.householdId,
          action: "ledger.reverse_event",
          entity: "financial_event",
          entityId: input.financialEventId,
          before: { status: existing.status },
          after: { status: "REVERSED" },
          source: "api",
        });
        return updated;
      });
      await this.afterCommit(input.householdId, asOf);
      return event;
    } catch (err) {
      mapPersistError(err);
    }
  }

  async createAssetDepreciation(input: {
    householdId: string;
    assetAccountId: string;
    expenseAccountId: string;
    amountMinor: bigint;
    occurredOn: string;
    description?: string;
    vehicleId?: string;
    currency?: CurrencyCode;
    externalId?: string;
    failPoint?: PersistFailPoint;
  }) {
    if (input.amountMinor <= 0n) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Kontrollera uppgifterna och försök igen.",
        fields: { amountMinor: "Belopp måste vara positivt." },
      });
    }
    const asset = await requireAccount(input.householdId, input.assetAccountId, [
      "ASSET",
    ]);
    await requireAccount(input.householdId, input.expenseAccountId, ["EXPENSE"]);

    // Domain: V1 assets cannot be written below zero.
    const balances = await this.ledger.reconstructHousehold(input.householdId);
    const current =
      balances.get(input.assetAccountId) ?? asset.openingBalanceMinor;
    if (input.amountMinor > current) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Kontrollera uppgifterna och försök igen.",
        fields: {
          amountMinor:
            "Värdeminskning får inte överstiga tillgångens aktuella ledger-saldo.",
        },
      });
    }

    const draft = buildAssetDepreciation({
      assetAccountId: input.assetAccountId,
      expenseAccountId: input.expenseAccountId,
      amountMinor: input.amountMinor,
      currency: input.currency ?? "SEK",
    });
    return this.persistDraft({
      householdId: input.householdId,
      draft,
      occurredOn: input.occurredOn,
      description: input.description ?? "Värdeminskning",
      vehicleId: input.vehicleId,
      externalId:
        input.externalId ??
        `api-depr-${input.assetAccountId}-${input.occurredOn}-${input.amountMinor}`,
      commandType: "ASSET_DEPRECIATION",
      failPoint: input.failPoint,
      // No cash source transaction — non-cash write-down (cashflow 0).
    });
  }

  /**
   * Replace splits for an existing event in one DB transaction.
   * Invalid sets leave prior splits untouched.
   */
  async replaceSplits(input: {
    householdId: string;
    financialEventId: string;
    sourceAmountMinor: bigint;
    splits: PersistSplit[];
    occurredOn: string;
    failPoint?: PersistFailPoint;
  }) {
    try {
      const event = await replaceEventSplits({
        householdId: input.householdId,
        financialEventId: input.financialEventId,
        sourceAmountMinor: input.sourceAmountMinor,
        splits: input.splits,
        failPoint: input.failPoint,
      });
      await this.afterCommit(input.householdId, input.occurredOn);
      return event;
    } catch (err) {
      mapPersistError(err);
    }
  }

  /**
   * Create a cash expense then revise it to an internal transfer atomically
   * (used for classification revision integrity). Production callers use
   * `reviseClassification` directly on an existing event.
   */
  async reviseClassification(input: {
    householdId: string;
    financialEventId: string;
    draft: BalancedLedgerDraft;
    occurredOn: string;
    description: string;
    incomeAmountMinor?: bigint;
    isInternalTransfer?: boolean;
    failPoint?: PersistFailPoint;
  }) {
    try {
      const event = await reviseEventEconomicMeaning(input);
      await this.afterCommit(input.householdId, input.occurredOn);
      return event;
    } catch (err) {
      mapPersistError(err);
    }
  }

  /** Helper for tests / future API: cash expense create. */
  async createCashExpense(input: {
    householdId: string;
    cashAccountId: string;
    expenseAccountId: string;
    amountMinor: bigint;
    occurredOn: string;
    description?: string;
    currency?: CurrencyCode;
    externalId?: string;
  }) {
    await requireAccount(input.householdId, input.cashAccountId, [
      "CHECKING",
      "SAVINGS",
      "CASH",
    ]);
    await requireAccount(input.householdId, input.expenseAccountId, ["EXPENSE"]);
    const draft = buildCashExpense({
      cashAccountId: input.cashAccountId,
      expenseAccountId: input.expenseAccountId,
      amountMinor: input.amountMinor,
      currency: input.currency ?? "SEK",
    });
    return this.persistDraft({
      householdId: input.householdId,
      draft,
      occurredOn: input.occurredOn,
      description: input.description ?? "Utgift",
      sourceAccountId: input.cashAccountId,
      sourceAmountMinor: -input.amountMinor,
      externalId: input.externalId,
      commandType: "LEDGER_EVENT",
    });
  }
}
