import {
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import type {
  AdvisorChatInput,
  TrackRecommendationOutcomeInput,
  UpdateRecommendationOutcomeInput,
} from "@ffos/schemas";
import { getDb } from "../db/client";
import { aiBriefs, recommendationOutcomes } from "../db/schema-ai";
import { DecisionsService } from "../decisions/decisions.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { HouseholdAccessService } from "../households/household-access.service";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";
import { PlanningMetricsService } from "../planning/planning-metrics.service";
import { VehiclesService } from "../vehicles/vehicles.service";
import {
  listAdvisorTools,
  runAdvisorTools,
  type AdvisorToolContext,
} from "./ai-tool-registry";
import {
  answerFromTools,
  explainFromTools,
  selectToolsForMessage,
} from "./ai-tools";

@Injectable()
export class AdvisorService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(PlanningMetricsService) private readonly planning: PlanningMetricsService,
    @Inject(DecisionsService) private readonly decisions: DecisionsService,
    @Inject(VehiclesService) private readonly vehiclesSvc: VehiclesService,
    @Inject(HouseholdMetricsService) private readonly metrics: HouseholdMetricsService,
    @Inject(FeatureFlagsService) private readonly flags: FeatureFlagsService,
  ) {}

  private async requireAi() {
    await this.flags.requireEnabled("AI");
  }

  private async toolContext(
    userId: string,
    householdId: string,
  ): Promise<AdvisorToolContext & { household: { baseCurrency: string | null } }> {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    return {
      userId,
      householdId,
      currency,
      asOf,
      planning: this.planning,
      decisions: this.decisions,
      vehicles: this.vehiclesSvc,
      metrics: this.metrics,
      household,
    };
  }

  async brief(userId: string, householdId: string) {
    await this.requireAi();
    const ctx = await this.toolContext(userId, householdId);
    const tools = await runAdvisorTools("all", ctx);
    const explained = explainFromTools(tools, ctx.currency);
    const db = getDb();
    const [stored] = await db
      .insert(aiBriefs)
      .values({
        householdId,
        asOf: ctx.asOf,
        headline: explained.headline,
        body: explained,
        toolTrace: tools,
      })
      .returning();

    const oppsTool = tools.find((t) => t.tool === "get_opportunities");
    const topId = oppsTool?.data?.topId as string | undefined;
    const topTitle = oppsTool?.data?.topTitle as string | undefined;
    const annualSavingMinor = oppsTool?.data?.annualSavingMinor as
      | string
      | undefined;
    if (topId && topTitle) {
      await this.track(userId, {
        householdId,
        recommendationKey: `opp:${topId}`,
        title: topTitle,
        expectedImpactMinor: annualSavingMinor ?? null,
        status: "SHOWN",
        notes: "Tracked when shown in AI brief",
      });
    }

    return {
      asOf: ctx.asOf,
      briefId: stored.id,
      headline: explained.headline,
      disclaimer: explained.disclaimer,
      sections: explained.sections,
      toolTrace: tools,
      availableTools: listAdvisorTools(),
    };
  }

  async chat(userId: string, input: AdvisorChatInput) {
    await this.requireAi();
    const ctx = await this.toolContext(userId, input.householdId);
    const selected = selectToolsForMessage(input.message);
    const tools = await runAdvisorTools(selected, ctx);
    const answered = answerFromTools(input.message, tools, ctx.currency);
    return {
      asOf: ctx.asOf,
      reply: answered.reply,
      citations: answered.citations,
      toolTrace: tools,
      usedTools: answered.usedTools,
    };
  }

  async outcomes(userId: string, householdId: string) {
    await this.requireAi();
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
    await this.requireAi();
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
    await this.requireAi();
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
