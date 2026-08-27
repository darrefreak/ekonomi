import { Inject, Injectable } from "@nestjs/common";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import { formatMoney } from "@ffos/utils";
import type {
  DecisionAction,
  DecisionActionCategory,
  DecisionsCenterResponse,
} from "@ffos/schemas";
import { DecisionsService } from "../decisions/decisions.service";
import { AnomalyService } from "../decisions/anomaly.service";
import { DebtService } from "../debt/debt.service";
import { FinancialBriefService } from "../intelligence/financial-brief.service";
import { FinancialIntelligenceService } from "../intelligence/financial-intelligence.service";

/**
 * The Decision Center.
 *
 * One ranked list of concrete things to do, composed from the deterministic
 * engines that already exist — opportunities, debt payoff, liquidity/savings,
 * anomalies and the brief's findings. It owns no calculation of its own: it
 * normalises each engine's output into a single "action" shape, removes overlap,
 * and ranks by financial impact and confidence so the household sees what to do
 * next and how much it is worth, without touring ten pages.
 */

/** Yearly impact that maps to a full impact score of 1.0 when ranking. */
const IMPACT_REFERENCE_MINOR = 50_000_00n;
/** Above this assumed/real rate, expensive debt should be cleared before investing. */
const EXPENSIVE_DEBT_BPS = 700;

const CATEGORY_LABELS: Record<DecisionActionCategory, string> = {
  DEBT: "Skulder",
  SUBSCRIPTIONS: "Abonnemang",
  SPENDING: "Utgifter",
  LIQUIDITY: "Likviditet",
  SAVINGS: "Sparande",
  VEHICLE: "Fordon",
  INCOME: "Inkomst",
  BUDGET: "Budget",
  RISK: "Risk",
  OTHER: "Övrigt",
};

const TONE_WEIGHT: Record<DecisionAction["tone"], number> = {
  critical: 1,
  warning: 0.7,
  opportunity: 0.5,
  info: 0.3,
  positive: 0.2,
};

type Opportunity = NonNullable<
  Awaited<ReturnType<DecisionsService["opportunities"]>>
>["items"][number];

@Injectable()
export class DecisionsCenterService {
  constructor(
    @Inject(DecisionsService) private readonly decisions: DecisionsService,
    @Inject(AnomalyService) private readonly anomalies: AnomalyService,
    @Inject(DebtService) private readonly debt: DebtService,
    @Inject(FinancialBriefService) private readonly brief: FinancialBriefService,
    @Inject(FinancialIntelligenceService)
    private readonly intelligence: FinancialIntelligenceService,
  ) {}

  async get(userId: string, householdId: string): Promise<DecisionsCenterResponse> {
    const [opportunities, anomalies, savings, brief, payoff] = await Promise.all([
      this.decisions.opportunities(userId, householdId).catch(() => null),
      this.anomalies.listForUser(userId, householdId).catch(() => null),
      this.intelligence.savingsTarget(userId, householdId).catch(() => null),
      this.brief.getBrief(userId, householdId).catch(() => null),
      this.debt.payoff(userId, householdId, { method: "avalanche" }).catch(() => null),
    ]);

    const currency = ((savings?.currency ??
      payoff?.currency ??
      "SEK") as CurrencyCode) satisfies CurrencyCode;
    const asOf =
      savings?.asOf ?? payoff?.asOf ?? brief?.asOf ?? new Date().toISOString().slice(0, 10);
    const kr = (minor: bigint) => formatMoney(money(minor, currency), "sv-SE");

    const actions: DecisionAction[] = [];
    const seen = new Set<string>();

    // The concrete monthly surplus a normal month leaves over, used to make the
    // debt and savings advice specific rather than abstract.
    const monthlySurplus = savings
      ? BigInt(savings.normalMonthlySurplusMinor)
      : 0n;

    // ---- Debt payoff focus -------------------------------------------------
    // Directing the surplus at the most expensive debt is usually the single
    // highest-value move, so it leads. Computing the projection with the real
    // surplus turns it into a dated, quantified recommendation.
    const focus = payoff?.focus ?? null;
    const focusItem = payoff?.items?.find((i) => i.id === focus?.id) ?? null;
    const expensiveDebt =
      focusItem != null && focusItem.interestRateBps >= EXPENSIVE_DEBT_BPS;

    if (payoff && focus && focusItem) {
      let recommendation: string;
      let annualImpactMinor: bigint | null =
        BigInt(focusItem.monthlyInterest.amountMinor) * 12n;
      if (monthlySurplus > 0n) {
        const projected = await this.debt
          .payoff(userId, householdId, {
            method: "avalanche",
            extraMonthlyMinor: monthlySurplus,
          })
          .catch(() => null);
        const proj = projected?.projection ?? null;
        if (proj && proj.focusMonthsToClear != null) {
          const saved = BigInt(proj.focusInterestSaved.amountMinor);
          if (saved > 0n) annualImpactMinor = saved;
          recommendation = `Rikta ditt månadsöverskott (~${kr(monthlySurplus)}/mån) mot ${focus.name}. Skuldfri om ${proj.focusMonthsToClear} mån, sparar ${kr(saved)} i ränta.`;
        } else {
          recommendation = `Lägg extra amortering på ${focus.name} (${focusItem.interestRatePercent.toFixed(1).replace(".", ",")} % ränta) — dyrast skulden.`;
        }
      } else {
        recommendation = `När du har utrymme: amortera extra på ${focus.name} (${focusItem.interestRatePercent.toFixed(1).replace(".", ",")} % ränta) — dyrast skulden.`;
      }
      actions.push({
        id: `debt:${focus.id}`,
        source: "debt",
        category: "DEBT",
        title: `Betala av ${focus.name} först`,
        detail: `${focus.reason} Räntekostnad ca ${kr(BigInt(focusItem.monthlyInterest.amountMinor))}/mån.`,
        recommendation,
        impact: focusItem.monthlyInterest,
        impactHorizon: "monthly",
        annualImpactMinor: annualImpactMinor != null ? annualImpactMinor.toString() : null,
        confidence: focusItem.assumedRate ? 0.6 : 0.9,
        confidenceLabel: focusItem.assumedRate ? "medium" : "high",
        effort: "low",
        tone: "opportunity",
        score: this.score({
          annualImpactMinor,
          confidence: focusItem.assumedRate ? 0.6 : 0.9,
          tone: "opportunity",
        }),
        href: "/debt",
        evidence: [],
      });
    }

    // ---- Opportunities -----------------------------------------------------
    // The broadest source: subscription hikes, mortgage rate, budget overruns,
    // lifestyle creep, vehicle cost/replacement, cash surplus. Already ranked
    // and quantified; we just normalise and de-overlap.
    for (const opp of opportunities?.items ?? []) {
      // If expensive debt is in play, do not also tell the household to invest
      // the very surplus that should clear that debt first.
      if (opp.type === "CASH_SURPLUS" && expensiveDebt) continue;
      const category = this.categoryForOpportunity(opp);
      const annual = this.annualImpactForOpportunity(opp);
      const dedupe = `${opp.type ?? opp.detectorKey ?? opp.id}:${opp.evidence?.[0]?.id ?? opp.id}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const tone: DecisionAction["tone"] =
        opp.type === "BUDGET_OVERRUN" || opp.type === "VEHICLE_COST"
          ? "warning"
          : "opportunity";
      actions.push({
        id: `opp:${opp.id}`,
        source: "opportunity",
        category,
        title: opp.title,
        detail: opp.description,
        recommendation: this.recommendationForOpportunity(opp, kr, annual),
        impact: opp.estimatedAnnualSaving ?? opp.estimatedMonthlyImpact ?? null,
        impactHorizon: opp.estimatedAnnualSaving
          ? "annual"
          : opp.estimatedMonthlyImpact
            ? "monthly"
            : null,
        annualImpactMinor: annual != null ? annual.toString() : null,
        confidence: opp.confidence ?? null,
        confidenceLabel: opp.confidenceLabel ?? null,
        effort: opp.effort ?? null,
        tone,
        score:
          opp.priorityScore ??
          this.score({ annualImpactMinor: annual, confidence: opp.confidence ?? null, tone }),
        href: opp.evidence?.[0]?.href ?? this.routeForCategory(category),
        evidence: opp.evidence ?? [],
      });
    }

    // ---- Liquidity shortfall ----------------------------------------------
    if (savings && BigInt(savings.shortfallMinor) > 0n) {
      const shortfall = BigInt(savings.shortfallMinor);
      actions.push({
        id: "liquidity:shortfall",
        source: "liquidity",
        category: "LIQUIDITY",
        title: "Bygg upp bufferten",
        detail: `Det saknas ${kr(shortfall)} till din rekommenderade buffert.`,
        recommendation:
          monthlySurplus > 0n && !expensiveDebt
            ? `Avsätt en del av ditt överskott (~${kr(monthlySurplus)}/mån) tills bufferten är fylld.`
            : "Fyll på bufferten när du har utrymme, innan annat sparande.",
        impact: moneyToJson(money(shortfall, currency)),
        impactHorizon: "oneoff",
        annualImpactMinor: null,
        confidence: 0.7,
        confidenceLabel: "medium",
        effort: "medium",
        tone: "warning",
        score: this.score({ annualImpactMinor: null, confidence: 0.7, tone: "warning" }),
        href: "/liquidity",
        evidence: [],
      });
    }

    // ---- Anomalies — "here something is off" ------------------------------
    for (const anomaly of anomalies?.items ?? []) {
      const high = anomaly.severity === "high";
      actions.push({
        id: `anomaly:${anomaly.id}`,
        source: "anomaly",
        category: anomaly.entityKind === "income" ? "INCOME" : "SPENDING",
        title: anomaly.title,
        detail: anomaly.detail,
        recommendation: "Kontrollera posten och rätta eller bekräfta den.",
        impact:
          anomaly.amountMinor != null
            ? moneyToJson(money(BigInt(anomaly.amountMinor), currency))
            : null,
        impactHorizon: anomaly.amountMinor != null ? "oneoff" : null,
        annualImpactMinor: null,
        confidence: high ? 0.6 : 0.4,
        confidenceLabel: high ? "medium" : "low",
        effort: "low",
        tone: high ? "warning" : "info",
        score: this.score({
          annualImpactMinor: null,
          confidence: high ? 0.6 : 0.4,
          tone: high ? "warning" : "info",
        }),
        href: anomaly.href ?? "/review",
        evidence: [],
      });
    }

    // ---- Brief findings the sources above do not already cover -------------
    for (const item of brief?.items ?? []) {
      if (item.type === "CATEGORY_INCREASE") {
        const finding = brief!.findings.find((f) => f.key === item.findingKey);
        const monthly = finding ? BigInt(finding.impactMinor) : 0n;
        actions.push({
          id: `brief:${item.findingKey}`,
          source: "brief",
          category: "SPENDING",
          title: "En kostnad ligger över ditt normala",
          detail: item.text,
          recommendation: "Se de största posterna och kapa där du kan.",
          impact: monthly > 0n ? moneyToJson(money(monthly, currency)) : null,
          impactHorizon: monthly > 0n ? "monthly" : null,
          annualImpactMinor: monthly > 0n ? (monthly * 12n).toString() : null,
          confidence: finding?.confidence ?? 0.6,
          confidenceLabel: "medium",
          effort: "low",
          tone: "warning",
          score: this.score({
            annualImpactMinor: monthly > 0n ? monthly * 12n : null,
            confidence: finding?.confidence ?? 0.6,
            tone: "warning",
          }),
          href: item.explainRoute,
          evidence: [],
        });
      } else if (item.type === "MISSING_EXPECTED_INCOME") {
        actions.push({
          id: `brief:${item.findingKey}`,
          source: "brief",
          category: "INCOME",
          title: "Väntad inkomst saknas",
          detail: item.text,
          recommendation: "Kontrollera om lönen eller inkomsten kommit in som väntat.",
          impact: null,
          impactHorizon: null,
          annualImpactMinor: null,
          confidence: 0.7,
          confidenceLabel: "medium",
          effort: "low",
          tone: "warning",
          score: this.score({ annualImpactMinor: null, confidence: 0.7, tone: "warning" }),
          href: item.explainRoute,
          evidence: [],
        });
      }
    }

    // ---- Rank --------------------------------------------------------------
    actions.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ai = a.annualImpactMinor ? BigInt(a.annualImpactMinor) : 0n;
      const bi = b.annualImpactMinor ? BigInt(b.annualImpactMinor) : 0n;
      if (ai !== bi) return ai > bi ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

    const totalAnnual = actions.reduce<bigint>((total, action) => {
      if (
        (action.source === "opportunity" || action.source === "debt") &&
        action.annualImpactMinor != null
      ) {
        const value = BigInt(action.annualImpactMinor);
        return total + (value > 0n ? value : 0n);
      }
      return total;
    }, 0n);

    const categoryCounts = new Map<DecisionActionCategory, number>();
    for (const action of actions) {
      categoryCounts.set(action.category, (categoryCounts.get(action.category) ?? 0) + 1);
    }

    const top = actions[0];
    const headline =
      actions.length === 0
        ? "Inget brådskande just nu — din ekonomi ser stabil ut."
        : `${actions.length} ${actions.length === 1 ? "sak" : "saker"} att göra${
            top ? ` — störst effekt: ${top.title}` : ""
          }`;

    const coverageWarning = brief?.findings.find(
      (f) => f.type === "DATA_COVERAGE_WARNING",
    );
    const coverageNote = coverageWarning
      ? "Bilden bygger på de konton och den historik som finns inne. Lägg till fler konton och importera mer historik för en mer komplett bild."
      : null;

    return {
      asOf,
      currency,
      headline,
      totalAnnualOpportunity: moneyToJson(money(totalAnnual, currency)),
      actions,
      categories: [...categoryCounts.entries()].map(([key, count]) => ({
        key,
        label: CATEGORY_LABELS[key],
        count,
      })),
      coverageNote,
    };
  }

  private score(input: {
    annualImpactMinor: bigint | null;
    confidence: number | null;
    tone: DecisionAction["tone"];
  }): number {
    const impactScore =
      input.annualImpactMinor != null
        ? Math.min(
            Number(input.annualImpactMinor < 0n ? -input.annualImpactMinor : input.annualImpactMinor) /
              Number(IMPACT_REFERENCE_MINOR),
            1,
          )
        : 0.15;
    const confidence = input.confidence ?? 0.5;
    const raw =
      0.55 * impactScore + 0.25 * confidence + 0.2 * TONE_WEIGHT[input.tone];
    return Math.max(0, Math.min(1, raw));
  }

  private annualImpactForOpportunity(opp: Opportunity): bigint | null {
    if (opp.estimatedAnnualSaving) return BigInt(opp.estimatedAnnualSaving.amountMinor);
    if (opp.estimatedMonthlyImpact)
      return BigInt(opp.estimatedMonthlyImpact.amountMinor) * 12n;
    return null;
  }

  private categoryForOpportunity(opp: Opportunity): DecisionActionCategory {
    switch (opp.type) {
      case "MORTGAGE_RATE":
        return "DEBT";
      case "SUBSCRIPTION_PRICE_INCREASE":
      case "RECURRING_COST_INCREASE":
        return "SUBSCRIPTIONS";
      case "CASH_SURPLUS":
        return "SAVINGS";
      case "BUDGET_OVERRUN":
        return "BUDGET";
      case "SPENDING_TREND":
        return "SPENDING";
      case "VEHICLE_COST":
      case "VEHICLE_REPLACEMENT":
        return "VEHICLE";
      case "CONTRACT_RENEWAL":
        return "SUBSCRIPTIONS";
      default:
        return "OTHER";
    }
  }

  private routeForCategory(category: DecisionActionCategory): string {
    switch (category) {
      case "DEBT":
        return "/debt";
      case "SUBSCRIPTIONS":
        return "/subscriptions";
      case "SPENDING":
        return "/what-changed";
      case "LIQUIDITY":
        return "/liquidity";
      case "SAVINGS":
        return "/savings";
      case "VEHICLE":
        return "/vehicles";
      case "BUDGET":
        return "/budget";
      default:
        return "/opportunities";
    }
  }

  private recommendationForOpportunity(
    opp: Opportunity,
    kr: (minor: bigint) => string,
    annual: bigint | null,
  ): string {
    const worth = annual && annual > 0n ? ` (~${kr(annual)}/år)` : "";
    switch (opp.type) {
      case "SUBSCRIPTION_PRICE_INCREASE":
      case "RECURRING_COST_INCREASE":
        return `Säg upp, byt eller omförhandla${worth}.`;
      case "MORTGAGE_RATE":
        return `Be banken om en bättre ränta eller jämför långivare${worth}.`;
      case "CASH_SURPLUS":
        return `Placera överskottet enligt din plan — mål, sparande eller amortering${worth}.`;
      case "BUDGET_OVERRUN":
        return `Bromsa i den här kategorin resten av månaden${worth}.`;
      case "SPENDING_TREND":
        return `Se vad som ökat och kapa det du inte saknar${worth}.`;
      case "VEHICLE_COST":
      case "VEHICLE_REPLACEMENT":
        return `Se över bilens ekonomi och alternativen${worth}.`;
      case "CONTRACT_RENEWAL":
        return `Se över avtalet innan det förnyas${worth}.`;
      default:
        return opp.description;
    }
  }
}
