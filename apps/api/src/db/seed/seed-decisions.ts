import {
  buildForecastPoints,
  estimateMortgageRateSavingMinor,
  healthLevelFromScore,
} from "@ffos/financial-engine";
import { getDb } from "../client";
import {
  forecastPoints,
  forecastRuns,
  healthDimensions,
  opportunities,
  riskSignals,
  scenarios,
} from "../schema-decisions";

export async function seedDecisionsData(input: {
  householdId: string;
  asOf: string;
  startingCashMinor: bigint;
  startingNetWorthMinor: bigint;
  monthlyNetSavingsMinor: bigint;
  /** Trailing-12m mortgage interest for opportunity sizing. */
  mortgageInterestAnnualMinor?: bigint;
}) {
  const db = getDb();
  const mortgageSaving = estimateMortgageRateSavingMinor(
    input.mortgageInterestAnnualMinor ?? 96_000_00n,
  );
  const mortgageSavingKr = Math.round(Number(mortgageSaving) / 100);
  const [run] = await db
    .insert(forecastRuns)
    .values({
      householdId: input.householdId,
      asOf: input.asOf,
      horizonDays: 365,
      currency: "SEK",
    })
    .returning();

  const points = buildForecastPoints({
    startingCashMinor: input.startingCashMinor,
    startingNetWorthMinor: input.startingNetWorthMinor,
    monthlyNetSavingsMinor: input.monthlyNetSavingsMinor,
    asOf: input.asOf,
  });

  await db.insert(forecastPoints).values(
    points.map((p) => ({
      householdId: input.householdId,
      forecastRunId: run.id,
      onDate: p.onDate,
      projectedCashMinor: p.projectedCashMinor,
      projectedNetWorthMinor: p.projectedNetWorthMinor,
      label: p.label,
    })),
  );

  await db.insert(opportunities).values([
    {
      householdId: input.householdId,
      title: "Förhandla bolåneränta",
      description: `Jämför SBAB-erbjudande och begär räntesänkning. Estimering ~${mortgageSavingKr.toLocaleString("sv-SE")} kr/år (~10 % av räntekostnad).`,
      estimatedAnnualSavingMinor: mortgageSaving,
      confidence: "0.72",
      effort: "medium",
      risk: "low",
      priority: 1,
      status: "ACTIVE",
      category: "mortgage",
    },
    {
      householdId: input.householdId,
      title: "Byt elavtal innan förnyelse",
      description: "Vattenfall-avtalet löper ut snart. Jämför rörligt vs fast.",
      estimatedAnnualSavingMinor: 2_400_00n,
      confidence: "0.64",
      effort: "low",
      risk: "low",
      priority: 2,
      status: "NEW",
      category: "contracts",
    },
    {
      householdId: input.householdId,
      title: "Granska streamingabonnemang",
      description: "Netflix + Spotify + iCloud summerar ~4 764 kr/år. Trimma 1 tjänst.",
      estimatedAnnualSavingMinor: 1_800_00n,
      confidence: "0.8",
      effort: "low",
      risk: "low",
      priority: 3,
      status: "NEW",
      category: "subscriptions",
    },
  ]);

  await db.insert(riskSignals).values([
    {
      householdId: input.householdId,
      dimension: "fixed-cost-ratio",
      level: "MODERATE",
      title: "Höga fasta kostnader",
      detail: "Bolån + försäkring + abonnemang tar stor del av inkomsten.",
      score: 58,
    },
    {
      householdId: input.householdId,
      dimension: "vehicle-financing",
      level: "MODERATE",
      title: "Billån minskar flexibilitet",
      detail: "Kvarvarande billån ~195 kkr påverkar cash runway.",
      score: 55,
    },
    {
      householdId: input.householdId,
      dimension: "data-coverage",
      level: "HIGH",
      title: "Saknad pensions-/skattedata",
      detail: "Coverage saknar skattekonto och pension — hälsa osäkrare.",
      score: 42,
    },
  ]);

  const dims = [
    { dimension: "liquidity", score: 78, summary: "Tillgänglig likviditet täcker flera månader." },
    { dimension: "debt", score: 62, summary: "Bolån + billån hanterbara men bundna." },
    { dimension: "savings-rate", score: 84, summary: "Stark sparandegrad i normalmånader." },
    { dimension: "coverage", score: 55, summary: "Viktiga datakällor saknas fortfarande." },
    { dimension: "fixed-costs", score: 58, summary: "Fasta kostnader värda att optimera." },
  ];
  await db.insert(healthDimensions).values(
    dims.map((d) => ({
      householdId: input.householdId,
      dimension: d.dimension,
      score: d.score,
      level: healthLevelFromScore(d.score),
      summary: d.summary,
      asOf: input.asOf,
    })),
  );

  await db.insert(scenarios).values([
    {
      householdId: input.householdId,
      name: "Inkomstbortfall 3 mån",
      description: "En lön uteblir i 3 månader — påverkan på cash och runway.",
      assumptions: { missingSalaries: 3, person: "Alex" },
      projectedMonthlyDeltaMinor: -42_600_00n,
    },
    {
      householdId: input.householdId,
      name: "Räntehöjning +1%",
      description: "Bolåneräntan stiger 1 procentenhet.",
      assumptions: { mortgageRateDeltaBps: 100 },
      projectedMonthlyDeltaMinor: -2_100_00n,
    },
    {
      householdId: input.householdId,
      name: "Sälj bil om 12 mån",
      description: "Sälj XC60 och gå till billigare bil / kollektivtrafik-mix.",
      assumptions: { sellVehicle: true, horizonMonths: 12 },
      projectedMonthlyDeltaMinor: 3_800_00n,
    },
  ]);
}
