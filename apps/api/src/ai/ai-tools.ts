/**
 * Deterministic tool layer for the AI advisor.
 * Tools return numbers/facts only — the advisor composes prose from these outputs.
 */

export type ToolResult = {
  tool: string;
  ok: boolean;
  data: Record<string, unknown>;
};

export function explainFromTools(tools: ToolResult[]) {
  const byName = Object.fromEntries(tools.map((t) => [t.tool, t.data]));
  const budget = byName.get_budget as
    | { remainingMinor?: string; utilizationPercent?: number; period?: string }
    | undefined;
  const opps = byName.get_opportunities as
    | { topTitle?: string; annualSavingMinor?: string }
    | undefined;
  const risk = byName.get_risk as { topTitle?: string; level?: string } | undefined;
  const vehicle = byName.get_vehicle_equity as
    | { netEquityMinor?: string; negativeEquity?: boolean }
    | undefined;

  const sections: Array<{ title: string; detail: string; sourceTools: string[] }> = [];

  if (budget) {
    sections.push({
      title: "Budgetläge",
      detail: `I perioden ${budget.period ?? "aktuell"} är utnyttjandet ca ${budget.utilizationPercent ?? 0}% och kvarvarande budget är ${budget.remainingMinor ?? "0"} minor units. Siffrorna kommer från budget-verktyget, inte från AI-gissning.`,
      sourceTools: ["get_budget"],
    });
  }
  if (opps?.topTitle) {
    sections.push({
      title: "Största möjligheten",
      detail: `${opps.topTitle} (estimerad årsbesparing ${opps.annualSavingMinor ?? "0"} minor). AI föreslår handling men beloppet kommer från opportunity-registret.`,
      sourceTools: ["get_opportunities"],
    });
  }
  if (risk?.topTitle) {
    sections.push({
      title: "Risk att bevaka",
      detail: `${risk.topTitle} (nivå ${risk.level ?? "UNKNOWN"}). Risksignalen är deterministiskt seedad/beräknad.`,
      sourceTools: ["get_risk"],
    });
  }
  if (vehicle) {
    sections.push({
      title: "Fordonsequity",
      detail: vehicle.negativeEquity
        ? `Fordonet har negativ equity (${vehicle.netEquityMinor} minor). Undvik försäljning utan plan.`
        : `Fordonsequity är ${vehicle.netEquityMinor} minor enligt TCO/equity-verktyget.`,
      sourceTools: ["get_vehicle_equity"],
    });
  }

  return {
    headline: "AI-brief baserad på deterministiska verktyg",
    disclaimer:
      "AI förklarar och rekommenderar. Alla belopp kommer från financial-engine/API-verktyg.",
    sections,
  };
}
