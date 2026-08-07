import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { HouseholdAccessService } from "../households/household-access.service";
import { enqueueReconcileAccountBalances } from "../jobs/queue";
import { EconomicEventsService } from "./economic-events.service";
import { LedgerTruthService } from "./ledger-truth.service";

const householdQuery = z.object({
  householdId: z.string().uuid(),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const moneyMinor = z.string().regex(/^\d+$/);

const internalTransferSchema = z.object({
  householdId: z.string().uuid(),
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  amountMinor: moneyMinor,
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(240).optional(),
  externalId: z.string().max(160).optional(),
});

const creditCardPurchaseSchema = z.object({
  householdId: z.string().uuid(),
  creditCardAccountId: z.string().uuid(),
  expenseAccountId: z.string().uuid(),
  amountMinor: moneyMinor,
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(240).optional(),
  categoryId: z.string().uuid().optional(),
});

const creditCardPaymentSchema = z.object({
  householdId: z.string().uuid(),
  cashAccountId: z.string().uuid(),
  creditCardAccountId: z.string().uuid(),
  amountMinor: moneyMinor,
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(240).optional(),
});

const mortgagePaymentSchema = z.object({
  householdId: z.string().uuid(),
  cashAccountId: z.string().uuid(),
  mortgageAccountId: z.string().uuid(),
  interestExpenseAccountId: z.string().uuid(),
  principalMinor: moneyMinor,
  interestMinor: moneyMinor,
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(240).optional(),
});

const investmentTransferSchema = z.object({
  householdId: z.string().uuid(),
  cashAccountId: z.string().uuid(),
  investmentAccountId: z.string().uuid(),
  amountMinor: moneyMinor,
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(240).optional(),
});

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
    @Query(new ZodValidationPipe(householdQuery)) query: unknown,
  ) {
    const q = householdQuery.parse(query);
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
    @Body(new ZodValidationPipe(householdQuery)) body: unknown,
  ) {
    const q = householdQuery.parse(body);
    await this.access.requireCanWrite(user.userId, q.householdId);
    const asOf = q.asOf ?? process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    await enqueueReconcileAccountBalances(q.householdId, asOf);
    return this.ledger.reconcileHousehold(q.householdId, asOf);
  }

  @Post("transfers/internal")
  async internalTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(internalTransferSchema)) body: unknown,
  ) {
    const input = internalTransferSchema.parse(body);
    await this.access.requireCanWrite(user.userId, input.householdId);
    const event = await this.events.createInternalTransfer({
      householdId: input.householdId,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amountMinor: BigInt(input.amountMinor),
      occurredOn: input.occurredOn,
      description: input.description,
    });
    return { id: event.id, eventType: event.eventType };
  }

  @Post("credit-card/purchase")
  async creditCardPurchase(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(creditCardPurchaseSchema)) body: unknown,
  ) {
    const input = creditCardPurchaseSchema.parse(body);
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
    return { id: event.id, eventType: event.eventType };
  }

  @Post("credit-card/payment")
  async creditCardPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(creditCardPaymentSchema)) body: unknown,
  ) {
    const input = creditCardPaymentSchema.parse(body);
    await this.access.requireCanWrite(user.userId, input.householdId);
    const event = await this.events.createCreditCardPayment({
      householdId: input.householdId,
      cashAccountId: input.cashAccountId,
      creditCardAccountId: input.creditCardAccountId,
      amountMinor: BigInt(input.amountMinor),
      occurredOn: input.occurredOn,
      description: input.description,
    });
    return { id: event.id, eventType: event.eventType };
  }

  @Post("mortgage/payment")
  async mortgagePayment(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(mortgagePaymentSchema)) body: unknown,
  ) {
    const input = mortgagePaymentSchema.parse(body);
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
    return { id: event.id, eventType: event.eventType };
  }

  @Post("investments/transfer")
  async investmentTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(investmentTransferSchema)) body: unknown,
  ) {
    const input = investmentTransferSchema.parse(body);
    await this.access.requireCanWrite(user.userId, input.householdId);
    const event = await this.events.createInvestmentTransfer({
      householdId: input.householdId,
      cashAccountId: input.cashAccountId,
      investmentAccountId: input.investmentAccountId,
      amountMinor: BigInt(input.amountMinor),
      occurredOn: input.occurredOn,
      description: input.description,
    });
    return { id: event.id, eventType: event.eventType };
  }
}
