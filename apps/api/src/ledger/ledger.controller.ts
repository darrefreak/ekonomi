import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createAssetDepreciationSchema,
  createAssetPurchaseSchema,
  createCashRefundSchema,
  createCreditCardPaymentSchema,
  createCreditCardPurchaseSchema,
  createFinancedAssetPurchaseSchema,
  createInternalTransferSchema,
  createInvestmentTransferSchema,
  createMortgagePaymentSchema,
  ledgerBalancesQuerySchema,
  ledgerReconcileBodySchema,
  replaceEventSplitsBodySchema,
  reverseFinancialEventSchema,
  reviseClassificationSchema,
} from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { HouseholdAccessService } from "../households/household-access.service";
import { enqueueReconcileAccountBalances } from "../jobs/queue";
import { EconomicEventsService } from "./economic-events.service";
import { LedgerTruthService } from "./ledger-truth.service";

@ApiTags("ledger")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/ledger")
export class LedgerController {
  constructor(
    @Inject(LedgerTruthService) private readonly ledger: LedgerTruthService,
    @Inject(EconomicEventsService)
    private readonly events: EconomicEventsService,
    @Inject(HouseholdAccessService)
    private readonly access: HouseholdAccessService,
  ) {}

  @Get("balances")
  async balances(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ledgerBalancesQuerySchema)) query: unknown,
  ) {
    const q = ledgerBalancesQuerySchema.parse(query);
    await this.access.requireMembership(user.userId, q.householdId);
    const asOf = q.asOf ?? process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const rows = await this.ledger.getAuthoritativeBalances(q.householdId, asOf);
    return {
      asOf,
      items: rows.map((r) => ({
        accountId: r.accountId,
        accountType: r.accountType,
        currency: r.currency,
        openingBalanceMinor: r.openingBalanceMinor.toString(),
        ledgerCalculatedBalanceMinor: r.ledgerCalculatedBalanceMinor.toString(),
        cachedBalanceMinor: r.cachedBalanceMinor.toString(),
        reportedBalanceMinor: r.reportedBalanceMinor?.toString() ?? null,
        reconciliation: {
          status: r.reconcile.status,
          differenceMinor: r.reconcile.differenceMinor?.toString() ?? null,
        },
      })),
    };
  }

  @Post("reconcile")
  async reconcile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(ledgerReconcileBodySchema)) body: unknown,
  ) {
    const q = ledgerReconcileBodySchema.parse(body);
    await this.access.requireCanWrite(user.userId, q.householdId);
    const asOf = q.asOf ?? process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    await enqueueReconcileAccountBalances(q.householdId, asOf);
    return this.ledger.reconcileHousehold(q.householdId, asOf);
  }

  @Post("transfers/internal")
  async internalTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createInternalTransferSchema)) body: unknown,
  ) {
    const input = createInternalTransferSchema.parse(body);
    await this.access.requireCanWrite(user.userId, input.householdId);
    const event = await this.events.createInternalTransfer({
      householdId: input.householdId,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amountMinor: BigInt(input.amountMinor),
      occurredOn: input.occurredOn,
      description: input.description,
      externalId: input.externalId,
    });
    return { id: event.id, eventType: event.eventType, status: event.status };
  }

  @Post("credit-card/purchase")
  async creditCardPurchase(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createCreditCardPurchaseSchema)) body: unknown,
  ) {
    const input = createCreditCardPurchaseSchema.parse(body);
    await this.access.requireCanWrite(user.userId, input.householdId);
    const event = await this.events.createCreditCardPurchase({
      householdId: input.householdId,
      creditCardAccountId: input.creditCardAccountId,
      expenseAccountId: input.expenseAccountId,
      amountMinor: BigInt(input.amountMinor),
      occurredOn: input.occurredOn,
      description: input.description,
      categoryId: input.categoryId,
    });
    return { id: event.id, eventType: event.eventType, status: event.status };
  }

  @Post("credit-card/payment")
  async creditCardPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createCreditCardPaymentSchema)) body: unknown,
  ) {
    const input = createCreditCardPaymentSchema.parse(body);
    await this.access.requireCanWrite(user.userId, input.householdId);
    const event = await this.events.createCreditCardPayment({
      householdId: input.householdId,
      cashAccountId: input.cashAccountId,
      creditCardAccountId: input.creditCardAccountId,
      amountMinor: BigInt(input.amountMinor),
      occurredOn: input.occurredOn,
      description: input.description,
    });
    return { id: event.id, eventType: event.eventType, status: event.status };
  }

  @Post("mortgage/payment")
  async mortgagePayment(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createMortgagePaymentSchema)) body: unknown,
  ) {
    const input = createMortgagePaymentSchema.parse(body);
    await this.access.requireCanWrite(user.userId, input.householdId);
    const event = await this.events.createMortgagePayment({
      householdId: input.householdId,
      cashAccountId: input.cashAccountId,
      mortgageAccountId: input.mortgageAccountId,
      interestExpenseAccountId: input.interestExpenseAccountId,
      principalMinor: BigInt(input.principalMinor),
      interestMinor: BigInt(input.interestMinor),
      occurredOn: input.occurredOn,
      description: input.description,
    });
    return { id: event.id, eventType: event.eventType, status: event.status };
  }

  @Post("investments/transfer")
  async investmentTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createInvestmentTransferSchema)) body: unknown,
  ) {
    const input = createInvestmentTransferSchema.parse(body);
    await this.access.requireCanWrite(user.userId, input.householdId);
    const event = await this.events.createInvestmentTransfer({
      householdId: input.householdId,
      cashAccountId: input.cashAccountId,
      investmentAccountId: input.investmentAccountId,
      amountMinor: BigInt(input.amountMinor),
      occurredOn: input.occurredOn,
      description: input.description,
    });
    return { id: event.id, eventType: event.eventType, status: event.status };
  }

  @Post("assets/depreciation")
  async assetDepreciation(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createAssetDepreciationSchema)) body: unknown,
  ) {
    const input = createAssetDepreciationSchema.parse(body);
    await this.access.requireCanWrite(user.userId, input.householdId);
    const event = await this.events.createAssetDepreciation({
      householdId: input.householdId,
      assetAccountId: input.assetAccountId,
      expenseAccountId: input.expenseAccountId,
      amountMinor: BigInt(input.amountMinor),
      occurredOn: input.occurredOn,
      description: input.description,
      vehicleId: input.vehicleId,
    });
    return {
      id: event.id,
      eventType: event.eventType,
      status: event.status,
      expenseAmountMinor: event.expenseAmountMinor.toString(),
      netWorthDeltaMinor: event.netWorthDeltaMinor.toString(),
    };
  }

  @Post("refunds")
  async cashRefund(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createCashRefundSchema)) body: unknown,
  ) {
    const input = createCashRefundSchema.parse(body);
    await this.access.requireCanWrite(user.userId, input.householdId);
    const event = await this.events.createCashRefund({
      householdId: input.householdId,
      cashAccountId: input.cashAccountId,
      expenseAccountId: input.expenseAccountId,
      amountMinor: BigInt(input.amountMinor),
      occurredOn: input.occurredOn,
      description: input.description,
      externalId: input.externalId,
    });
    return {
      id: event.id,
      eventType: event.eventType,
      status: event.status,
      expenseAmountMinor: event.expenseAmountMinor.toString(),
    };
  }

  @Post("assets/purchase")
  async assetPurchase(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createAssetPurchaseSchema)) body: unknown,
  ) {
    const input = createAssetPurchaseSchema.parse(body);
    await this.access.requireCanWrite(user.userId, input.householdId);
    const event = await this.events.createAssetPurchase({
      householdId: input.householdId,
      cashAccountId: input.cashAccountId,
      assetAccountId: input.assetAccountId,
      amountMinor: BigInt(input.amountMinor),
      occurredOn: input.occurredOn,
      description: input.description,
      vehicleId: input.vehicleId,
      externalId: input.externalId,
    });
    return { id: event.id, eventType: event.eventType, status: event.status };
  }

  @Post("assets/financed-purchase")
  async financedAssetPurchase(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createFinancedAssetPurchaseSchema))
    body: unknown,
  ) {
    const input = createFinancedAssetPurchaseSchema.parse(body);
    await this.access.requireCanWrite(user.userId, input.householdId);
    const event = await this.events.createFinancedAssetPurchase({
      householdId: input.householdId,
      cashAccountId: input.cashAccountId,
      assetAccountId: input.assetAccountId,
      loanAccountId: input.loanAccountId,
      purchasePriceMinor: BigInt(input.purchasePriceMinor),
      downPaymentMinor: BigInt(input.downPaymentMinor),
      occurredOn: input.occurredOn,
      description: input.description,
      vehicleId: input.vehicleId,
      externalId: input.externalId,
    });
    return { id: event.id, eventType: event.eventType, status: event.status };
  }

  @Post("events/:eventId/splits")
  async replaceSplits(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId") eventId: string,
    @Body(new ZodValidationPipe(replaceEventSplitsBodySchema)) body: unknown,
  ) {
    const input = replaceEventSplitsBodySchema.parse(body);
    await this.access.requireCanWrite(user.userId, input.householdId);
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const event = await this.events.replaceSplits({
      householdId: input.householdId,
      financialEventId: eventId,
      sourceAmountMinor: BigInt(input.sourceAmountMinor),
      occurredOn: asOf,
      splits: input.splits.map((s) => ({
        categoryId: s.categoryId,
        amountMinor: BigInt(s.amountMinor),
        memo: s.memo,
      })),
    });
    return { id: event.id, eventType: event.eventType, status: event.status };
  }

  @Post("events/revise-classification")
  async reviseClassification(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(reviseClassificationSchema)) body: unknown,
  ) {
    const input = reviseClassificationSchema.parse(body);
    await this.access.requireCanWrite(user.userId, input.householdId);
    if (input.mode !== "EXPENSE_TO_TRANSFER") {
      return { error: "unsupported" };
    }
    const event = await this.events.reviseExpenseToTransfer({
      householdId: input.householdId,
      financialEventId: input.financialEventId,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amountMinor: BigInt(input.amountMinor),
      occurredOn: input.occurredOn,
      description: input.description,
    });
    return {
      id: event.id,
      eventType: event.eventType,
      status: event.status,
      expenseAmountMinor: event.expenseAmountMinor.toString(),
    };
  }

  @Post("events/reverse")
  async reverseEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(reverseFinancialEventSchema)) body: unknown,
  ) {
    const input = reverseFinancialEventSchema.parse(body);
    await this.access.requireCanWrite(user.userId, input.householdId);
    const event = await this.events.reverseFinancialEvent({
      householdId: input.householdId,
      financialEventId: input.financialEventId,
    });
    return { id: event.id, eventType: event.eventType, status: event.status };
  }
}
