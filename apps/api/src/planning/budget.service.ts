import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { CurrencyCode } from "@ffos/domain";
import type { UpdateBudgetLineInput } from "@ffos/schemas";
import { getDb } from "../db/client";
import { budgetLines } from "../db/schema-planning";
import { HouseholdAccessService } from "../households/household-access.service";
import { PlanningMetricsService } from "./planning-metrics.service";
import { resolveHouseholdAsOf } from "../common/as-of";

@Injectable()
export class BudgetService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(PlanningMetricsService)
    private readonly planning: PlanningMetricsService,
  ) {}

  async get(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const asOf = await resolveHouseholdAsOf(householdId);
    const budget = await this.planning.getBudget(
      householdId,
      (household.baseCurrency || "SEK") as CurrencyCode,
      asOf,
    );
    if (!budget) throw new NotFoundException("Budget period not found");
    return budget;
  }

  async updateLine(userId: string, lineId: string, input: UpdateBudgetLineInput) {
    const { household } = await this.access.requireCanWrite(
      userId,
      input.householdId,
    );
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
      .where(and(eq(budgetLines.id, lineId), eq(budgetLines.householdId, input.householdId)));

    const asOf = await resolveHouseholdAsOf(input.householdId);
    const budget = await this.planning.getBudget(
      input.householdId,
      (household.baseCurrency || "SEK") as CurrencyCode,
      asOf,
    );
    if (!budget) throw new NotFoundException("Budget period not found");
    return budget;
  }
}
