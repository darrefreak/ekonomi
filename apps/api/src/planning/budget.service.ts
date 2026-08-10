import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import type { CreateBudgetInput, UpdateBudgetLineInput } from "@ffos/schemas";
import { getDb } from "../db/client";
import { categories } from "../db/schema-economic";
import { budgetLines, budgetPeriods } from "../db/schema-planning";
import { HouseholdAccessService } from "../households/household-access.service";
import { PlanningMetricsService } from "./planning-metrics.service";
import { resolveHouseholdAsOf } from "../common/as-of";
import { runIdempotentCommand } from "../common/command-idempotency";
import {
  BUDGET_TEMPLATES,
  monthBoundsFor,
  monthLabelOf,
  SIMPLE_BUDGET_GROUPS,
} from "./budget-defaults";

@Injectable()
export class BudgetService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(PlanningMetricsService)
    private readonly planning: PlanningMetricsService,
  ) {}

  /**
   * The budget for the household's current period.
   *
   * A household without one is not an error, it is a household that has not
   * made a budget yet, so it gets an empty state it can act on rather than the
   * 404 that used to make Budget a dead end (FPA-003).
   */
  async get(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = await resolveHouseholdAsOf(householdId);

    // A household that has budgeted before gets this month's period carried
    // forward from the last one. It is a no-op once the period exists, so
    // reading the page repeatedly cannot produce duplicates.
    await this.planning.rolloverIntoCurrentMonth(householdId, asOf);

    const budget = await this.planning.getBudget(householdId, currency, asOf);
    if (budget) return { hasBudget: true as const, ...budget };

    return this.emptyState(asOf, currency);
  }

  private emptyState(asOf: string, currency: CurrencyCode) {
    const zero = moneyToJson(money(0n, currency));
    return {
      hasBudget: false as const,
      asOf,
      period: null,
      currency,
      totals: {
        planned: zero,
        actual: zero,
        remaining: zero,
        variance: zero,
        utilizationPercent: 0,
      },
      lines: [],
      /** Offered as the starting point for a first budget. */
      suggestedGroups: SIMPLE_BUDGET_GROUPS.map((group) => ({
        categoryKey: group.categoryKey,
        name: group.name,
        sortOrder: group.sortOrder,
      })),
    };
  }

  /**
   * Create the household's first budget for the current month.
   *
   * Repeating the call returns the existing budget instead of a second period:
   * the command is idempotent by key, and the unique index on
   * (household, label) settles anything that races past it.
   */
  async create(
    userId: string,
    input: CreateBudgetInput,
    options: { idempotencyKey?: string | null } = {},
  ) {
    const { household } = await this.access.requireCanWrite(
      userId,
      input.householdId,
    );
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = await resolveHouseholdAsOf(input.householdId);
    const label = input.month ?? monthLabelOf(asOf);
    const { start, end } = monthBoundsFor(label);

    const template = BUDGET_TEMPLATES[input.template ?? "SIMPLE"];
    const requested = input.lines?.length
      ? input.lines.map((line, index) => ({
          categoryKey: line.categoryKey,
          name: line.name,
          plannedMinor: BigInt(line.plannedMinor),
          sortOrder: index + 1,
        }))
      : template.map((group) => ({
          categoryKey: group.categoryKey,
          name: group.name,
          plannedMinor: 0n,
          sortOrder: group.sortOrder,
        }));

    for (const line of requested) {
      if (line.plannedMinor < 0n) {
        throw new BadRequestException("plannedMinor must be >= 0");
      }
    }

    await runIdempotentCommand({
      householdId: input.householdId,
      commandType: "CREATE_BUDGET",
      idempotencyKey: options.idempotencyKey,
      request: {
        householdId: input.householdId,
        label,
        lines: requested.map((line) => ({
          categoryKey: line.categoryKey,
          name: line.name,
          plannedMinor: line.plannedMinor.toString(),
        })),
      },
      command: async (tx) => {
        const [period] = await tx
          .insert(budgetPeriods)
          .values({
            householdId: input.householdId,
            label,
            startDate: start,
            endDate: end,
            currency,
            status: "ACTIVE",
          })
          .onConflictDoNothing({
            target: [budgetPeriods.householdId, budgetPeriods.label],
          })
          .returning();

        // Already budgeted for this month: leave the existing plan alone rather
        // than overwriting amounts the household entered.
        if (!period) return { created: false };

        const keys = requested.map((line) => line.categoryKey);
        const categoryRows = keys.length
          ? await tx
              .select({ id: categories.id, key: categories.key })
              .from(categories)
              .where(
                and(
                  eq(categories.householdId, input.householdId),
                  inArray(categories.key, keys),
                ),
              )
          : [];
        const categoryIdByKey = new Map(
          categoryRows.map((row) => [row.key, row.id]),
        );

        if (requested.length > 0) {
          await tx.insert(budgetLines).values(
            requested.map((line) => ({
              householdId: input.householdId,
              budgetPeriodId: period.id,
              categoryId: categoryIdByKey.get(line.categoryKey) ?? null,
              categoryKey: line.categoryKey,
              name: line.name,
              plannedMinor: line.plannedMinor,
              sortOrder: line.sortOrder,
            })),
          );
        }
        return { created: true };
      },
    });

    return this.get(userId, input.householdId);
  }

  async updateLine(userId: string, lineId: string, input: UpdateBudgetLineInput) {
    await this.access.requireCanWrite(userId, input.householdId);
    const db = getDb();
    const [line] = await db
      .select()
      .from(budgetLines)
      .where(eq(budgetLines.id, lineId))
      .limit(1);
    if (!line) throw new NotFoundException("Budget line not found");
    if (line.householdId !== input.householdId) {
      throw new ForbiddenException("Budget line belongs to another household");
    }

    const plannedMinor = BigInt(input.plannedMinor);
    if (plannedMinor < 0n) {
      throw new BadRequestException("plannedMinor must be >= 0");
    }

    await db
      .update(budgetLines)
      .set({ plannedMinor })
      .where(
        and(eq(budgetLines.id, lineId), eq(budgetLines.householdId, input.householdId)),
      );

    return this.get(userId, input.householdId);
  }
}
