/**
 * Deterministic tool layer for the AI advisor.
 * Tools return numbers/facts only — the advisor composes prose from these outputs.
 * No invented financial amounts.
 */

import { money, type CurrencyCode } from "@ffos/domain";
import { formatMoney } from "@ffos/utils";

export type ToolResult = {
  tool: string;
  ok: boolean;
  data: Record<string, unknown>;
};

export type AdvisorCitation = {
  tool: string;
  label: string;
  href?: string;
  value?: string;
};

export type BriefSection = {
  title: string;
  detail: string;
  sourceTools: string[];
  citations: AdvisorCitation[];
};

export function formatMinorSek(
  amountMinor: string | number | bigint | null | undefined,
  currency: CurrencyCode = "SEK",
): string {
  if (amountMinor == null || amountMinor === "") return "okänt belopp";
  try {
    return formatMoney(money(BigInt(amountMinor), currency), "sv-SE");
  } catch {
    return "okänt belopp";
  }
}

function evidenceCitations(
  tool: string,
  evidence: unknown,
): AdvisorCitation[] {
  if (!Array.isArray(evidence)) return [];
  return evidence
    .filter(
      (e): e is { label?: string; href?: string; kind?: string; id?: string } =>
        Boolean(e) && typeof e === "object",
    )
    .slice(0, 4)
    .map((e) => ({
      tool,
      label: e.label ?? e.kind ?? "Evidence",
      href: typeof e.href === "string" ? e.href : undefined,
    }));
}

export function explainFromTools(
  tools: ToolResult[],
  currency: CurrencyCode = "SEK",
) {
  const byName = Object.fromEntries(tools.map((t) => [t.tool, t]));
  const sections: BriefSection[] = [];

  const budgetTool = byName.get_budget;
  const budget = budgetTool?.data as
    | { remainingMinor?: string; utilizationPercent?: number; period?: string }
    | undefined;
  if (budgetTool?.ok && budget) {
    const remaining = formatMinorSek(budget.remainingMinor, currency);
    sections.push({
      title: "Budgetläge",
      detail: `I perioden ${budget.period ?? "aktuell"} är utnyttjandet ca ${budget.utilizationPercent ?? 0}% och kvarvarande budget är ${remaining}. Siffrorna kommer från budget-verktyget, inte från AI-gissning.`,
      sourceTools: ["get_budget"],
      citations: [
        {
          tool: "get_budget",
          label: `Kvarvarande budget ${remaining}`,
          href: "/budget",
          value: remaining,
        },
      ],
    });
  }

  const oppsTool = byName.get_opportunities;
  const opps = oppsTool?.data as
    | {
        topTitle?: string;
        annualSavingMinor?: string;
        evidence?: unknown;
        lifestyleCreep?: boolean;
      }
    | undefined;
  if (oppsTool?.ok && opps?.topTitle) {
    const saving = formatMinorSek(opps.annualSavingMinor, currency);
    const creep = opps.lifestyleCreep
      ? " Lifestyle creep har detekterats i kassaflödet."
      : "";
    sections.push({
      title: "Största möjligheten",
      detail: `${opps.topTitle} (estimerad årsbesparing ${saving}). AI föreslår handling men beloppet kommer från opportunity-registret.${creep}`,
      sourceTools: ["get_opportunities"],
      citations: [
        {
          tool: "get_opportunities",
          label: opps.topTitle,
          href: "/opportunities",
          value: saving,
        },
        ...evidenceCitations("get_opportunities", opps.evidence),
      ],
    });
  }

  const riskTool = byName.get_risk;
  const risk = riskTool?.data as
    | { topTitle?: string; level?: string; evidence?: unknown }
    | undefined;
  if (riskTool?.ok && risk?.topTitle) {
    sections.push({
      title: "Risk att bevaka",
      detail: `${risk.topTitle} (nivå ${risk.level ?? "UNKNOWN"}). Risksignalen är deterministiskt beräknad från hushållsdata.`,
      sourceTools: ["get_risk"],
      citations: [
        {
          tool: "get_risk",
          label: risk.topTitle,
          href: "/risk",
          value: risk.level,
        },
        ...evidenceCitations("get_risk", risk.evidence),
      ],
    });
  }

  const vehicleTool = byName.get_vehicle_equity;
  const vehicle = vehicleTool?.data as
    | {
        netEquityMinor?: string;
        negativeEquity?: boolean;
        vehicleId?: string;
      }
    | undefined;
  if (vehicleTool?.ok && vehicle) {
    const equity = formatMinorSek(vehicle.netEquityMinor, currency);
    const href = vehicle.vehicleId
      ? `/vehicles/${vehicle.vehicleId}`
      : "/vehicles";
    sections.push({
      title: "Fordonsequity",
      detail: vehicle.negativeEquity
        ? `Fordonet har negativ equity (${equity}). Undvik försäljning utan plan.`
        : `Fordonsequity är ${equity} enligt TCO/equity-verktyget.`,
      sourceTools: ["get_vehicle_equity"],
      citations: [
        {
          tool: "get_vehicle_equity",
          label: `Equity ${equity}`,
          href,
          value: equity,
        },
      ],
    });
  }

  const nwTool = byName.get_net_worth;
  const nw = nwTool?.data as
    | { netWorthMinor?: string; cashMinor?: string }
    | undefined;
  if (nwTool?.ok && nw) {
    const netWorth = formatMinorSek(nw.netWorthMinor, currency);
    const cash = formatMinorSek(nw.cashMinor, currency);
    sections.push({
      title: "Finansiell position",
      detail: `Nettoförmögenhet ${netWorth}, tillgänglig kassa ${cash}. Beloppen kommer från financial-engine via get_net_worth.`,
      sourceTools: ["get_net_worth"],
      citations: [
        {
          tool: "get_net_worth",
          label: `NW ${netWorth}`,
          href: "/net-worth",
          value: netWorth,
        },
      ],
    });
  }

  return {
    headline: "AI-brief baserad på deterministiska verktyg",
    disclaimer:
      "AI förklarar och rekommenderar. Alla belopp kommer från financial-engine/API-verktyg — inga påhittade siffror.",
    sections,
  };
}

/** Compose a chat reply strictly from tool outputs (no invented amounts). */
export function answerFromTools(
  message: string,
  tools: ToolResult[],
  currency: CurrencyCode = "SEK",
): { reply: string; citations: AdvisorCitation[]; usedTools: string[] } {
  const explained = explainFromTools(tools, currency);
  const usedTools = tools.filter((t) => t.ok).map((t) => t.tool);
  const citations = explained.sections.flatMap((s) => s.citations);

  if (explained.sections.length === 0) {
    return {
      reply:
        "Jag kunde inte hämta några verktygsfakta för den frågan. Prova att fråga om budget, möjligheter, risk, fordon eller nettoförmögenhet.",
      citations: [],
      usedTools,
    };
  }

  const body = explained.sections
    .map((s) => `${s.title}: ${s.detail}`)
    .join("\n\n");

  return {
    reply: `Svar baserat enbart på verktyg (fråga: “${message.trim().slice(0, 120)}”):\n\n${body}`,
    citations,
    usedTools,
  };
}

/** Map natural-language chat to allowlisted tool names. */
export function selectToolsForMessage(message: string): string[] {
  const m = message.toLowerCase();
  const selected = new Set<string>();

  if (/budget|kvar|utnytt/.test(m)) selected.add("get_budget");
  if (/möjlig|opportunity|spara|abonnemang|ränta|lifestyle/.test(m)) {
    selected.add("get_opportunities");
  }
  if (/risk|hälsa|likvid|skuld/.test(m)) selected.add("get_risk");
  if (/bil|fordon|equity|tco|leasing/.test(m)) selected.add("get_vehicle_equity");
  if (/netto|förmögen|kassa|cash|nw|position/.test(m)) {
    selected.add("get_net_worth");
  }

  if (selected.size === 0) {
    return [
      "get_budget",
      "get_opportunities",
      "get_risk",
      "get_net_worth",
    ];
  }
  return [...selected];
}
