import assert from "node:assert/strict";
import { test } from "node:test";
import { moneyFromJson } from "@ffos/domain";
import { calculateNetWorth, forecastCashflowDeltas } from "@ffos/financial-engine";
import { dashboardResponseSchema } from "@ffos/schemas";
import { buildBrief } from "./dashboard.service";
import { getDb, getPool } from "../db/client";
import { households } from "../db/schema";
import { DashboardService } from "./dashboard.service";
import { DecisionsService } from "../decisions/decisions.service";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";
import { PlanningMetricsService } from "../planning/planning-metrics.service";
import { ReviewService } from "../review/review.service";
import type { HouseholdAccessService } from "../households/household-access.service";

test("net worth composition uses financial-engine", () => {
  const netWorth = calculateNetWorth({
    cash: moneyFromJson({ amountMinor: "28400000", currency: "SEK" }),
    investments: moneyFromJson({ amountMinor: "118000000", currency: "SEK" }),
    assets: moneyFromJson({ amountMinor: "730000000", currency: "SEK" }),
    liabilities: moneyFromJson({ amountMinor: "394256100", currency: "SEK" }),
  });
  assert.equal(netWorth.amountMinor, 482143900n);
});

test("buildBrief prefers opportunities over hardcoded mortgage tip", () => {
  const brief = buildBrief({
    spendingDeltaPercent: 12.5,
    currentLabel: "2026-07",
    previousLabel: "2026-06",
    reviewTotal: 3,
    hasAccounts: true,
    opportunities: [
      {
        id: "opp-1",
        title: "Förhandla bolåneränta",
        description: "Baserat på räntehistorik kan du spara cirka 4 200 kr/år.",
      },
      {
        id: "opp-2",
        title: "Byt elavtal",
        description: "Jämför innan förnyelse.",
      },
    ],
  });
  assert.match(brief.headline, /opportunities/i);
  assert.ok(brief.items.some((i) => i.id === "opp-opp-1"));
  assert.ok(!brief.items.some((i) => i.detail.includes("9 800")));
});

test("buildBrief empty household has onboarding copy", () => {
  const brief = buildBrief({
    spendingDeltaPercent: 0,
    currentLabel: "2026-08",
    previousLabel: "2026-07",
    reviewTotal: 0,
    hasAccounts: false,
    opportunities: [],
  });
  assert.equal(brief.items[0]?.id, "empty-accounts");
});

test("dashboard response schema requires forecast and opportunities", () => {
  const parsed = dashboardResponseSchema.parse({
    greeting: "God morgon",
    asOf: "2026-08-01",
    householdName: "Test",
    position: {
      netWorth: { amountMinor: "100", currency: "SEK" },
      netWorthChangeMonth: { amountMinor: "10", currency: "SEK" },
      availableCash: { amountMinor: "50", currency: "SEK" },
      investments: { amountMinor: "20", currency: "SEK" },
      debt: { amountMinor: "5", currency: "SEK" },
    },
    thisMonth: {
      income: { amountMinor: "80", currency: "SEK" },
      spending: { amountMinor: "40", currency: "SEK" },
      savings: { amountMinor: "40", currency: "SEK" },
      savingsRatePercent: 50,
      budgetRemaining: { amountMinor: "10", currency: "SEK" },
    },
    cashRunwayMonths: 2.5,
    forecast: {
      days30: { amountMinor: "1", currency: "SEK" },
      days60: { amountMinor: "2", currency: "SEK" },
      days90: { amountMinor: "3", currency: "SEK" },
    },
    brief: { headline: "x", items: [] },
    upcoming: [],
    opportunities: [
      {
        id: "1",
        title: "t",
        description: "d",
        estimatedAnnualSaving: null,
        confidence: 0.7,
        effort: "low",
        risk: "low",
        priority: 1,
        status: "NEW",
        category: "subs",
      },
    ],
    coveragePercent: 40,
    freshnessLabel: "ok",
    hasAccounts: true,
  });
  assert.equal(parsed.opportunities.length, 1);
  assert.equal(parsed.forecast.days30.amountMinor, "1");
});

test("forecast deltas for dashboard are engine-driven (not hardcoded)", () => {
  const deltas = forecastCashflowDeltas({
    startingCashMinor: 200_000_00n,
    startingNetWorthMinor: 1_000_000_00n,
    monthlyNetSavingsMinor: 30_000_00n,
    asOf: "2026-08-01",
  });
  assert.notEqual(deltas.days30, 18_400_00n);
  assert.notEqual(deltas.days60, 9_800_00n);
  assert.notEqual(deltas.days90, -4_200_00n);
  assert.ok(deltas.days60 > deltas.days30);
});

test("getDashboard aggregates opportunities and forecast from live services", async () => {
  const db = getDb();
  const [household] = await db.select().from(households).limit(1);
  if (!household) {
    await getPool().end().catch(() => undefined);
    return;
  }

  const access = {
    requireMembership: async () => ({
      household,
      member: { id: "member", role: "OWNER" },
    }),
  } as unknown as HouseholdAccessService;

  const service = new DashboardService(
    access,
    new HouseholdMetricsService(),
    new ReviewService(access),
    new PlanningMetricsService(),
    new DecisionsService(
      access,
      new HouseholdMetricsService(),
      new PlanningMetricsService(),
    ),
  );

  const dashboard = await service.getDashboard("user-1", household.id);
  const parsed = dashboardResponseSchema.parse(dashboard);

  assert.ok(parsed.forecast.days30);
  assert.ok(Array.isArray(parsed.opportunities));
  assert.ok(Array.isArray(parsed.upcoming));
  assert.equal(typeof parsed.cashRunwayMonths, "number");
  assert.ok(!JSON.stringify(parsed.brief).includes("9800"));
  assert.ok(!JSON.stringify(parsed.brief).includes("9 800"));
});
