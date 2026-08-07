import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { CurrencyCode } from "@ffos/domain";
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
      },
    });

    const risk = await this.decisions.risk(userId, householdId);
    const topRisk = risk.signals[0];
    tools.push({
      tool: "get_risk",
      ok: true,
      data: { topTitle: topRisk?.title, level: topRisk?.level },
    });

    const vehicleList = await this.vehiclesSvc.list(userId, householdId);
    const v = vehicleList.items[0];
    tools.push({
      tool: "get_vehicle_equity",
      ok: !!v,
      data: v
        ? {
            netEquityMinor: v.netEquity?.amountMinor,
            negativeEquity: v.netEquity
              ? BigInt(v.netEquity.amountMinor) < 0n
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
      await db.insert(recommendationOutcomes).values({
        householdId,
        recommendationKey: `opp:${top.id}`,
        title: top.title,
        status: "SHOWN",
        expectedImpactMinor: top.estimatedAnnualSaving
          ? BigInt(top.estimatedAnnualSaving.amountMinor)
          : null,
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
    await this.access.requireMembership(userId, householdId);
    const db = getDb();
    const rows = await db
      .select()
      .from(recommendationOutcomes)
      .where(eq(recommendationOutcomes.householdId, householdId));
    return {
      items: rows.map((r) => ({
        id: r.id,
        recommendationKey: r.recommendationKey,
        title: r.title,
        status: r.status,
        shownAt: r.shownAt.toISOString(),
        notes: r.notes,
      })),
    };
  }
}
