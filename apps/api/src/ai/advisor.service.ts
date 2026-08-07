import {
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import type {
  TrackRecommendationOutcomeInput,
  UpdateRecommendationOutcomeInput,
} from "@ffos/schemas";
import { getDb } from "../db/client";
import { aiBriefs, recommendationOutcomes } from "../db/schema-ai";
import { DecisionsService } from "../decisions/decisions.service";
import { HouseholdAccessService } from "../households/household-access.service";
import { PlanningMetricsService } from "../planning/planning-metrics.service";
import { VehiclesService } from "../vehicles/vehicles.service";
import { explainFromTools, type ToolResult } from "./ai-tools";

@Injectable()
export class AdvisorService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(PlanningMetricsService) private readonly planning: PlanningMetricsService,
    @Inject(DecisionsService) private readonly decisions: DecisionsService,
    @Inject(VehiclesService) private readonly vehiclesSvc: VehiclesService,
  ) {}

  async brief(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";

    const tools: ToolResult[] = [];

    const budget = await this.planning.getBudget(householdId, currency, asOf);
    tools.push({
      tool: "get_budget",
      ok: !!budget,
      data: budget
        ? {
            period: budget.period.label,
            remainingMinor: budget.totals.remaining.amountMinor,
            utilizationPercent: budget.totals.utilizationPercent,
          }
        : {},
    });

    const opps = await this.decisions.opportunities(userId, householdId);
    const top = opps.items.sort((a, b) => a.priority - b.priority)[0];
    tools.push({
      tool: "get_opportunities",
      ok: true,
      data: {
        topTitle: top?.title,
        annualSavingMinor: top?.estimatedAnnualSaving?.amountMinor,
        evidence: top?.evidence?.slice(0, 3) ?? [],
        lifestyleCreep: opps.lifestyleCreep?.creeping ?? false,
      },
    });

    const risk = await this.decisions.risk(userId, householdId);
    const topRisk = risk.signals.sort((a, b) => a.score - b.score)[0];
    tools.push({
      tool: "get_risk",
      ok: true,
      data: {
        topTitle: topRisk?.title,
        level: topRisk?.level,
        evidence: topRisk?.evidence?.slice(0, 3) ?? [],
      },
    });

    const vehicles = await this.vehiclesSvc.list(userId, householdId);
    const v0 = vehicles.items[0];
    tools.push({
      tool: "get_vehicle_equity",
      ok: vehicles.items.length > 0,
      data: v0
        ? {
            netEquityMinor: v0.netEquity?.amountMinor,
            negativeEquity: v0.netEquity
              ? BigInt(v0.netEquity.amountMinor) < 0n
              : false,
          }
        : {},
    });

    const explained = explainFromTools(tools);
    const db = getDb();
    const [stored] = await db
      .insert(aiBriefs)
      .values({
        householdId,
        asOf,
        headline: explained.headline,
        body: explained,
        toolTrace: tools,
      })
      .returning();

    if (top) {
      await this.track(userId, {
        householdId,
        recommendationKey: `opp:${top.id}`,
        title: top.title,
        expectedImpactMinor: top.estimatedAnnualSaving?.amountMinor ?? null,
        status: "SHOWN",
        notes: "Tracked when shown in AI brief",
      });
    }

    return {
      asOf,
      briefId: stored.id,
      headline: explained.headline,
      disclaimer: explained.disclaimer,
      sections: explained.sections,
      toolTrace: tools,
    };
  }

  async outcomes(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const db = getDb();
    const rows = await db
      .select()
      .from(recommendationOutcomes)
      .where(eq(recommendationOutcomes.householdId, householdId))
      .orderBy(desc(recommendationOutcomes.shownAt));
    return {
      items: rows.map((r) => ({
        id: r.id,
        recommendationKey: r.recommendationKey,
        title: r.title,
        status: r.status,
        expectedImpact: r.expectedImpactMinor
          ? moneyToJson(money(r.expectedImpactMinor, currency))
          : null,
        shownAt: r.shownAt.toISOString(),
        notes: r.notes,
      })),
    };
  }

  async track(userId: string, input: TrackRecommendationOutcomeInput) {
    await this.access.requireMembership(userId, input.householdId);
    const db = getDb();
    const [existing] = await db
      .select()
      .from(recommendationOutcomes)
      .where(
        and(
          eq(recommendationOutcomes.householdId, input.householdId),
          eq(recommendationOutcomes.recommendationKey, input.recommendationKey),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(recommendationOutcomes)
        .set({
          status: input.status ?? existing.status,
          notes: input.notes ?? existing.notes,
          title: input.title,
          expectedImpactMinor:
            input.expectedImpactMinor != null
              ? BigInt(input.expectedImpactMinor)
              : existing.expectedImpactMinor,
        })
        .where(eq(recommendationOutcomes.id, existing.id))
        .returning();
      return { id: updated.id, created: false };
    }

    const [row] = await db
      .insert(recommendationOutcomes)
      .values({
        householdId: input.householdId,
        recommendationKey: input.recommendationKey,
        title: input.title,
        status: input.status ?? "SHOWN",
        expectedImpactMinor:
          input.expectedImpactMinor != null
            ? BigInt(input.expectedImpactMinor)
            : null,
        notes: input.notes ?? null,
      })
      .returning();
    return { id: row.id, created: true };
  }

  async updateOutcome(
    userId: string,
    outcomeId: string,
    input: UpdateRecommendationOutcomeInput,
  ) {
    await this.access.requireMembership(userId, input.householdId);
    const db = getDb();
    const [existing] = await db
      .select()
      .from(recommendationOutcomes)
      .where(
        and(
          eq(recommendationOutcomes.id, outcomeId),
          eq(recommendationOutcomes.householdId, input.householdId),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundException("Outcome not found");

    await db
      .update(recommendationOutcomes)
      .set({
        status: input.status,
        notes: input.notes === undefined ? existing.notes : input.notes,
      })
      .where(eq(recommendationOutcomes.id, outcomeId));

    return this.outcomes(userId, input.householdId);
  }
}
