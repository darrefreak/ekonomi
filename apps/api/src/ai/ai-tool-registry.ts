import type { CurrencyCode } from "@ffos/domain";
import type { DecisionsService } from "../decisions/decisions.service";
import type { HouseholdMetricsService } from "../metrics/household-metrics.service";
import type { PlanningMetricsService } from "../planning/planning-metrics.service";
import type { VehiclesService } from "../vehicles/vehicles.service";
import type { ToolResult } from "./ai-tools";

export type AdvisorToolContext = {
  userId: string;
  householdId: string;
  currency: CurrencyCode;
  asOf: string;
  planning: PlanningMetricsService;
  decisions: DecisionsService;
  vehicles: VehiclesService;
  metrics: HouseholdMetricsService;
};

export type AdvisorToolDef = {
  name: string;
  description: string;
  /** V1 safety: all advisor tools are read-only. */
  readOnly: true;
  run: (ctx: AdvisorToolContext) => Promise<ToolResult>;
};

export const ADVISOR_TOOL_NAMES = [
  "get_budget",
  "get_opportunities",
  "get_risk",
  "get_vehicle_equity",
  "get_net_worth",
] as const;

export type AdvisorToolName = (typeof ADVISOR_TOOL_NAMES)[number];

const tools: AdvisorToolDef[] = [
  {
    name: "get_budget",
    description: "Budget remaining and utilization for current period",
    readOnly: true,
    async run(ctx) {
      const budget = await ctx.planning.getBudget(
        ctx.householdId,
        ctx.currency,
        ctx.asOf,
      );
      return {
        tool: "get_budget",
        ok: !!budget,
        data: budget
          ? {
              period: budget.period.label,
              remainingMinor: budget.totals.remaining.amountMinor,
              utilizationPercent: budget.totals.utilizationPercent,
            }
          : {},
      };
    },
  },
  {
    name: "get_opportunities",
    description: "Top savings opportunity with evidence links",
    readOnly: true,
    async run(ctx) {
      const opps = await ctx.decisions.opportunities(ctx.userId, ctx.householdId);
      const top = [...opps.items].sort((a, b) => a.priority - b.priority)[0];
      return {
        tool: "get_opportunities",
        ok: true,
        data: {
          topId: top?.id,
          topTitle: top?.title,
          annualSavingMinor: top?.estimatedAnnualSaving?.amountMinor,
          evidence: top?.evidence?.slice(0, 3) ?? [],
          lifestyleCreep: opps.lifestyleCreep?.creeping ?? false,
        },
      };
    },
  },
  {
    name: "get_risk",
    description: "Top risk signal with evidence",
    readOnly: true,
    async run(ctx) {
      const risk = await ctx.decisions.risk(ctx.userId, ctx.householdId);
      const topRisk = [...risk.signals].sort((a, b) => a.score - b.score)[0];
      return {
        tool: "get_risk",
        ok: true,
        data: {
          topTitle: topRisk?.title,
          level: topRisk?.level,
          evidence: topRisk?.evidence?.slice(0, 3) ?? [],
        },
      };
    },
  },
  {
    name: "get_vehicle_equity",
    description: "Primary vehicle net equity from TCO engine",
    readOnly: true,
    async run(ctx) {
      const vehicles = await ctx.vehicles.list(ctx.userId, ctx.householdId);
      const v0 = vehicles.items[0];
      return {
        tool: "get_vehicle_equity",
        ok: vehicles.items.length > 0,
        data: v0
          ? {
              vehicleId: v0.id,
              netEquityMinor: v0.netEquity?.amountMinor,
              negativeEquity: v0.netEquity
                ? BigInt(v0.netEquity.amountMinor) < 0n
                : false,
            }
          : {},
      };
    },
  },
  {
    name: "get_net_worth",
    description: "Net worth and available cash from financial snapshot",
    readOnly: true,
    async run(ctx) {
      const snap = await ctx.metrics.getFinancialSnapshot(
        ctx.householdId,
        ctx.currency,
        ctx.asOf,
      );
      return {
        tool: "get_net_worth",
        ok: true,
        data: {
          netWorthMinor: snap.position.netWorth.amountMinor.toString(),
          cashMinor: snap.position.availableCash.amountMinor.toString(),
          investmentsMinor: snap.position.investments.amountMinor.toString(),
          liabilitiesMinor: snap.position.liabilities.amountMinor.toString(),
          bundleVersion: snap.metricMeta.bundleVersion,
          inputHash: snap.metricMeta.inputHash,
        },
      };
    },
  },
];

const byName = new Map(tools.map((t) => [t.name, t]));

export function listAdvisorTools(): Array<{
  name: string;
  description: string;
  readOnly: true;
}> {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    readOnly: t.readOnly,
  }));
}

export async function runAdvisorTools(
  names: string[] | "all",
  ctx: AdvisorToolContext,
): Promise<ToolResult[]> {
  const selected =
    names === "all" ? tools.map((t) => t.name) : [...new Set(names)];
  const results: ToolResult[] = [];
  for (const name of selected) {
    const def = byName.get(name);
    if (!def) {
      results.push({
        tool: name,
        ok: false,
        data: { error: "Unknown tool (not in allowlist)" },
      });
      continue;
    }
    results.push(await def.run(ctx));
  }
  return results;
}

export function assertReadOnlyTools(names: string[]): void {
  for (const name of names) {
    const def = byName.get(name);
    if (def && !def.readOnly) {
      throw new Error(`Tool ${name} is not read-only`);
    }
  }
}
