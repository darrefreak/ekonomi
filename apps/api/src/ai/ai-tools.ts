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

  /*
   * Financial Intelligence sections (§46–§48). Each one repeats an engine
   * figure and links to the surface where the household can inspect it —
   * "Matkostnaderna ökade främst på grund av restaurang" must be clickable
   * evidence, not an assertion.
   */
  const liquidityTool = byName.get_liquidity_requirement;
  const liquidity = liquidityTool?.data as
    | {
        recommendedMinor?: string;
        surplusMinor?: string;
        shortfallMinor?: string;
        liquidCashMinor?: string;
        confidence?: string;
      }
    | undefined;
  if (liquidityTool?.ok && liquidity?.recommendedMinor) {
    const recommended = formatMinorSek(liquidity.recommendedMinor, currency);
    const cash = formatMinorSek(liquidity.liquidCashMinor, currency);
    const surplus = BigInt(liquidity.surplusMinor ?? "0");
    const shortfall = BigInt(liquidity.shortfallMinor ?? "0");
    const position =
      shortfall > 0n
        ? `Det saknas ${formatMinorSek(liquidity.shortfallMinor, currency)} upp till nivån.`
        : surplus > 0n
          ? `Kassan ligger ${formatMinorSek(liquidity.surplusMinor, currency)} över nivån.`
          : "Kassan ligger på nivån.";
    sections.push({
      title: "Buffert och likviditet",
      detail: `Rekommenderad likviditetsnivå är ${recommended} (beräknad från hushållets egna kostnader, konfidens ${liquidity.confidence ?? "okänd"}). Tillgänglig kassa är ${cash}. ${position}`,
      sourceTools: ["get_liquidity_requirement"],
      citations: [
        {
          tool: "get_liquidity_requirement",
          label: `Rekommenderad nivå ${recommended}`,
          href: "/intelligence/liquidity",
          value: recommended,
        },
      ],
    });
  }

  const savingsTool = byName.get_savings_target;
  const savings = savingsTool?.data as
    | {
        totalAllocatedMinor?: string;
        normalMonthlySurplusMinor?: string;
        cashflowNegative?: boolean;
      }
    | undefined;
  if (savingsTool?.ok && savings) {
    const allocated = formatMinorSek(savings.totalAllocatedMinor, currency);
    sections.push({
      title: "Sparande",
      detail: savings.cashflowNegative
        ? "En normal månad går inte ihop just nu, så ingen sparnivå rekommenderas — det vore en siffra utan täckning."
        : `Rekommenderat månadssparande är ${allocated}, fördelat av sparvattenfallet utifrån ett normalt månadsöverskott på ${formatMinorSek(savings.normalMonthlySurplusMinor, currency)}.`,
      sourceTools: ["get_savings_target"],
      citations: [
        {
          tool: "get_savings_target",
          label: `Månadssparande ${allocated}`,
          href: "/intelligence/liquidity",
          value: allocated,
        },
      ],
    });
  }

  const surplusTool = byName.get_available_surplus;
  const surplusData = surplusTool?.data as
    | { availableSurplusMinor?: string; shortfallMinor?: string }
    | undefined;
  if (surplusTool?.ok && surplusData?.availableSurplusMinor) {
    const surplus = formatMinorSek(surplusData.availableSurplusMinor, currency);
    sections.push({
      title: "Tillgängligt överskott",
      detail: `Kassa över den rekommenderade likviditetsnivån: ${surplus}. Samma likviditetsmodell som buffertberäkningen — inte en andra formel.`,
      sourceTools: ["get_available_surplus"],
      citations: [
        {
          tool: "get_available_surplus",
          label: `Överskott ${surplus}`,
          href: "/intelligence/liquidity",
          value: surplus,
        },
      ],
    });
  }

  const subsTool = byName.get_subscription_changes;
  const subs = subsTool?.data as
    | {
        increasedStreams?: number;
        annualIncreaseMinor?: string;
        items?: Array<{ name?: string }>;
      }
    | undefined;
  if (subsTool?.ok && subs && (subs.increasedStreams ?? 0) > 0) {
    const annual = formatMinorSek(subs.annualIncreaseMinor, currency);
    const names = (subs.items ?? [])
      .map((item) => item.name)
      .filter(Boolean)
      .slice(0, 3)
      .join(", ");
    sections.push({
      title: "Prishöjningar",
      detail: `${subs.increasedStreams} återkommande kostnad(er) har höjt priset${names ? ` (${names})` : ""}, sammanlagt ${annual} per år. Beloppen kommer från prisintelligensen, exakta i minor units.`,
      sourceTools: ["get_subscription_changes"],
      citations: [
        {
          tool: "get_subscription_changes",
          label: `Årseffekt ${annual}`,
          href: "/subscriptions",
          value: annual,
        },
      ],
    });
  }

  const recurringTool = byName.get_recurring_summary;
  const recurring = recurringTool?.data as
    | {
        totals?: {
          recurringExpensesMonthlyMinor?: string;
          subscriptionsMonthlyMinor?: string;
        };
        counts?: { streams?: number; subscriptions?: number };
      }
    | undefined;
  if (recurringTool?.ok && recurring?.totals) {
    const monthly = formatMinorSek(
      recurring.totals.recurringExpensesMonthlyMinor,
      currency,
    );
    const subsMonthly = formatMinorSek(
      recurring.totals.subscriptionsMonthlyMinor,
      currency,
    );
    sections.push({
      title: "Återkommande kostnader",
      detail: `${recurring.counts?.streams ?? 0} återkommande strömmar, ${monthly} per månad, varav abonnemang ${subsMonthly} (${recurring.counts?.subscriptions ?? 0} st).`,
      sourceTools: ["get_recurring_summary"],
      citations: [
        {
          tool: "get_recurring_summary",
          label: `Återkommande ${monthly}/mån`,
          href: "/subscriptions",
          value: monthly,
        },
      ],
    });
  }

  const driversTool = byName.get_period_change_drivers;
  const drivers = driversTool?.data as
    | {
        beforeMonth?: string;
        afterMonth?: string;
        expenseChangeMinor?: string;
        categoryDrivers?: Array<{ key?: string; changeMinor?: string }>;
      }
    | undefined;
  if (driversTool?.ok && drivers?.expenseChangeMinor) {
    const change = formatMinorSek(drivers.expenseChangeMinor, currency);
    const top = drivers.categoryDrivers?.[0];
    const topText = top?.key
      ? ` Största drivkraften: ${top.key} (${formatMinorSek(top.changeMinor, currency)}).`
      : "";
    sections.push({
      title: "Vad som förändrades",
      detail: `Utgifterna ändrades ${change} mellan ${drivers.beforeMonth ?? "föregående månad"} och ${drivers.afterMonth ?? "senaste månaden"}.${topText} Aritmetiken är exakt: drivkrafterna summerar till förändringen.`,
      sourceTools: ["get_period_change_drivers"],
      citations: [
        {
          tool: "get_period_change_drivers",
          label: `Förändring ${change}`,
          href: "/cashflow",
          value: change,
        },
      ],
    });
  }

  const trendTool = byName.get_category_trend;
  const trend = trendTool?.data as
    | {
        items?: Array<{
          categoryName?: string;
          categoryKey?: string;
          changeVsBaselinePercent?: number | null;
        }>;
      }
    | undefined;
  const topTrend = trend?.items?.[0];
  if (trendTool?.ok && topTrend?.changeVsBaselinePercent != null) {
    const percent = `${topTrend.changeVsBaselinePercent > 0 ? "+" : ""}${topTrend.changeVsBaselinePercent}%`;
    sections.push({
      title: "Kategoritrend",
      detail: `${topTrend.categoryName ?? topTrend.categoryKey} ligger ${percent} mot sitt eget 12-månadersmönster. Jämförelsen görs mot kategorins egen baslinje, inte mot en godtycklig månad.`,
      sourceTools: ["get_category_trend"],
      citations: [
        {
          tool: "get_category_trend",
          label: `${topTrend.categoryName ?? "Kategori"} ${percent}`,
          href: `/transactions?categoryKey=${encodeURIComponent(topTrend.categoryKey ?? "")}`,
          value: percent,
        },
      ],
    });
  }

  const merchantTrendTool = byName.get_merchant_trend;
  const merchantTrend = merchantTrendTool?.data as
    | {
        items?: Array<{
          merchantName?: string;
          changeVsAveragePercent?: number | null;
        }>;
      }
    | undefined;
  const topMerchant = merchantTrend?.items?.[0];
  if (merchantTrendTool?.ok && topMerchant?.changeVsAveragePercent != null) {
    const percent = `${topMerchant.changeVsAveragePercent > 0 ? "+" : ""}${topMerchant.changeVsAveragePercent}%`;
    sections.push({
      title: "Handlartrend",
      detail: `${topMerchant.merchantName} ligger ${percent} mot sitt eget 12-månaderssnitt.`,
      sourceTools: ["get_merchant_trend"],
      citations: [
        {
          tool: "get_merchant_trend",
          label: `${topMerchant.merchantName} ${percent}`,
          href: "/transactions",
          value: percent,
        },
      ],
    });
  }

  const expectedTool = byName.get_expected_transactions;
  const expected = expectedTool?.data as
    | { upcoming?: Array<Record<string, unknown>> }
    | undefined;
  if (expectedTool?.ok && expected?.upcoming && expected.upcoming.length > 0) {
    sections.push({
      title: "Förväntade transaktioner",
      detail: `${expected.upcoming.length} förväntade transaktioner är beräknade från de återkommande strömmarnas egna mönster.`,
      sourceTools: ["get_expected_transactions"],
      citations: [
        {
          tool: "get_expected_transactions",
          label: `${expected.upcoming.length} kommande`,
          href: "/subscriptions",
        },
      ],
    });
  }

  const missingTool = byName.get_missing_expected;
  const missing = missingTool?.data as
    | { missing?: Array<Record<string, unknown>> }
    | undefined;
  if (missingTool?.ok && missing?.missing) {
    sections.push({
      title: "Uteblivna förväntade transaktioner",
      detail:
        missing.missing.length === 0
          ? "Inga förväntade transaktioner saknas just nu."
          : `${missing.missing.length} förväntade transaktioner har inte dykt upp inom sitt fönster.`,
      sourceTools: ["get_missing_expected"],
      citations: [
        {
          tool: "get_missing_expected",
          label: `${missing.missing.length} saknas`,
          href: "/subscriptions",
        },
      ],
    });
  }

  const anomaliesTool = byName.get_anomalies;
  const anomalies = anomaliesTool?.data as
    | { items?: Array<Record<string, unknown>> }
    | undefined;
  if (anomaliesTool?.ok && anomalies?.items && anomalies.items.length > 0) {
    sections.push({
      title: "Avvikelser",
      detail: `${anomalies.items.length} öppna avvikelser (ovanliga transaktioner, dubbletter eller utebliven inkomst) från den deterministiska avvikelsedetektorn.`,
      sourceTools: ["get_anomalies"],
      citations: [
        {
          tool: "get_anomalies",
          label: `${anomalies.items.length} avvikelser`,
          href: "/anomalies",
        },
      ],
    });
  }

  const baselineTool = byName.get_spending_baseline;
  const baseline = baselineTool?.data as
    | { median12mMinor?: string | null; monthsOfHistory?: number }
    | undefined;
  if (baselineTool?.ok && baseline?.median12mMinor) {
    const median = formatMinorSek(baseline.median12mMinor, currency);
    sections.push({
      title: "Normalnivå",
      detail: `Hushållets normala månadsutgift (12-månadersmedian) är ${median}, beräknad med robust statistik över ${baseline.monthsOfHistory ?? "?"} månaders historik.`,
      sourceTools: ["get_spending_baseline"],
      citations: [
        {
          tool: "get_spending_baseline",
          label: `Normalnivå ${median}`,
          href: "/cashflow",
          value: median,
        },
      ],
    });
  }

  const resilienceTool = byName.get_financial_resilience;
  const resilience = resilienceTool?.data as
    | { resilience?: { level?: string; reasons?: string[] } }
    | undefined;
  if (resilienceTool?.ok && resilience?.resilience?.level) {
    sections.push({
      title: "Motståndskraft",
      detail: `Bedömning: ${resilience.resilience.level}. ${resilience.resilience.reasons?.[0] ?? ""}`,
      sourceTools: ["get_financial_resilience"],
      citations: [
        {
          tool: "get_financial_resilience",
          label: `Motståndskraft ${resilience.resilience.level}`,
          href: "/intelligence/liquidity",
        },
      ],
    });
  }

  const coverageTool = byName.get_financial_coverage;
  const coverage = coverageTool?.data as
    | { percent?: number; areas?: Array<{ label?: string; status?: string }> }
    | undefined;
  if (coverageTool?.ok && coverage?.percent != null) {
    const missingAreas = (coverage.areas ?? [])
      .filter((area) => area.status === "missing")
      .map((area) => area.label)
      .filter(Boolean);
    sections.push({
      title: "Datatäckning",
      detail:
        missingAreas.length === 0
          ? `Datatäckning ${coverage.percent}%.`
          : `Datatäckning ${coverage.percent}%. Saknas: ${missingAreas.join(", ")}. Analyser som bygger på helheten ska läsas med det i åtanke.`,
      sourceTools: ["get_financial_coverage"],
      citations: [
        {
          tool: "get_financial_coverage",
          label: `Täckning ${coverage.percent}%`,
          href: "/settings",
        },
      ],
    });
  }

  const creepTool = byName.get_lifestyle_creep;
  const creep = creepTool?.data as
    | { creeping?: boolean; annualisedIncreaseMinor?: string }
    | undefined;
  if (creepTool?.ok && creep?.creeping != null) {
    sections.push({
      title: "Lifestyle creep",
      detail: creep.creeping
        ? `Diskretionära utgifter driver uppåt${creep.annualisedIncreaseMinor ? ` (${formatMinorSek(creep.annualisedIncreaseMinor, currency)} per år)` : ""}.`
        : "Ingen lifestyle creep detekterad i kassaflödet.",
      sourceTools: ["get_lifestyle_creep"],
      citations: [
        {
          tool: "get_lifestyle_creep",
          label: creep.creeping ? "Creep detekterad" : "Ingen creep",
          href: "/opportunities",
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

/**
 * Contextual tool bias: what page the user asked from decides which
 * deterministic tools are relevant even when the message itself is terse
 * ("Varför?"). Context never adds data — only tool selection.
 */
export function toolsForPageContext(context?: {
  page: string;
  entityType?: string;
}): string[] {
  if (!context) return [];
  const page = context.page.toLowerCase();
  const selected = new Set<string>();
  if (page.includes("liquidity") || page.includes("likvid")) {
    selected.add("get_liquidity_requirement");
    selected.add("get_available_surplus");
  }
  if (page.includes("calendar") || page.includes("kalender")) {
    selected.add("get_expected_transactions");
    selected.add("get_missing_expected");
  }
  if (page.includes("subscription") || page.includes("abonnemang")) {
    selected.add("get_subscription_changes");
    selected.add("get_recurring_summary");
  }
  if (page.includes("budget")) selected.add("get_budget");
  if (page.includes("savings") || page.includes("sparande")) {
    selected.add("get_savings_target");
    selected.add("get_available_surplus");
  }
  if (page.includes("what-changed") || page.includes("insights")) {
    selected.add("get_period_change_drivers");
    selected.add("get_category_trend");
  }
  if (page.includes("forecast") || page.includes("prognos")) {
    selected.add("get_expected_transactions");
    selected.add("get_net_worth");
  }
  if (context.entityType === "category") selected.add("get_category_trend");
  if (context.entityType === "merchant") selected.add("get_merchant_trend");
  if (context.entityType === "vehicle") selected.add("get_vehicle_equity");
  if (context.entityType === "subscription" || context.entityType === "recurring") {
    selected.add("get_subscription_changes");
    selected.add("get_recurring_summary");
  }
  return [...selected];
}

/** Map natural-language chat to allowlisted tool names. */
export function selectToolsForMessage(
  message: string,
  context?: { page: string; entityType?: string },
): string[] {
  const m = message.toLowerCase();
  const selected = new Set<string>(toolsForPageContext(context));

  if (/budget|kvar|utnytt/.test(m)) selected.add("get_budget");
  if (/möjlig|opportunity|lifestyle/.test(m)) {
    selected.add("get_opportunities");
  }
  if (/risk|hälsa|skuld/.test(m)) selected.add("get_risk");
  if (/bil|fordon|equity|tco|leasing/.test(m)) selected.add("get_vehicle_equity");
  if (/netto|förmögen|nw|position/.test(m)) {
    selected.add("get_net_worth");
  }

  /*
   * Financial Intelligence routing (§47): the questions the spec names go to
   * deterministic engines. "Hur mycket behöver vi i buffert?" is a liquidity
   * question, not an invitation to invent a formula.
   */
  if (/buffert|likvid|reserv|nödfond/.test(m)) {
    selected.add("get_liquidity_requirement");
  }
  if (/spara|sparande|sparkvot|månadsspar/.test(m)) {
    selected.add("get_savings_target");
    selected.add("get_available_surplus");
  }
  if (/abonnemang|prenumer|höjt|prishöjning|dyrare/.test(m)) {
    selected.add("get_subscription_changes");
    selected.add("get_recurring_summary");
  }
  if (/varför.*(ökade|ökat|steg|högre)|förändr|jämfört med förra/.test(m)) {
    selected.add("get_period_change_drivers");
    selected.add("get_category_trend");
  }
  if (/kategori|matkostnad|mat |livsmedel|restaurang/.test(m)) {
    selected.add("get_category_trend");
  }
  if (/handlare|butik|merchant/.test(m)) selected.add("get_merchant_trend");
  if (/återkommande|räkning/.test(m)) selected.add("get_recurring_summary");
  if (/förväntad|väntad|kommande betal/.test(m)) {
    selected.add("get_expected_transactions");
    selected.add("get_missing_expected");
  }
  if (/avvikelse|ovanlig|konstig|dubbel/.test(m)) selected.add("get_anomalies");
  if (/normal|baslinje|baseline|brukar/.test(m)) selected.add("get_spending_baseline");
  if (/motståndskraft|resilien|klarar vi/.test(m)) {
    selected.add("get_financial_resilience");
  }
  if (/täckning|coverage|saknas data|underlag/.test(m)) {
    selected.add("get_financial_coverage");
  }
  if (/kassa|cash/.test(m)) selected.add("get_net_worth");

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
