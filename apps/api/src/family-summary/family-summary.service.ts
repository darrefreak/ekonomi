import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { money, moneyFromJson, type CurrencyCode } from "@ffos/domain";
import { calculateNetSavingsRate, medianMinor } from "@ffos/financial-engine";
import { formatMoney } from "@ffos/utils";
import type {
  FamilySummaryResponse,
  FamilySummarySection,
  FamilySummaryStatus,
  FinancialBriefResponse,
} from "@ffos/schemas";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import { householdSettings } from "../db/schema-ops";
import { DecisionsService } from "../decisions/decisions.service";
import { FinancialBriefService } from "../intelligence/financial-brief.service";
import { FinancialIntelligenceInputService } from "../intelligence/financial-intelligence-input.service";
import { FinancialIntelligenceService } from "../intelligence/financial-intelligence.service";

/**
 * The family summary: it does not compute a single number of its own.
 *
 * It reads the deterministic engines — the brief's ranked findings, the
 * liquidity/savings targets and the opportunity detectors — and arranges the
 * results as three plain questions a household actually asks: where does the
 * money go, are we saving enough, and what should we do next. Each section is
 * judged against a benchmark drawn from the code's own research-based
 * thresholds, stated in plain Swedish so a family can see the standard.
 */

/** Research-based reserve band (months of essential spending). */
const RESERVE_MIN_MONTHS = 3;
const RESERVE_HEALTHY_MONTHS = 6;
const DEFAULT_SAVINGS_RATE_TARGET_PERCENT = 20;
/** A savings rate this far under target reads as "act", not just "watch". */
const SAVINGS_RATE_ACT_GAP = 5;

type BriefFinding = FinancialBriefResponse["findings"][number];

@Injectable()
export class FamilySummaryService {
  constructor(
    @Inject(FinancialBriefService) private readonly brief: FinancialBriefService,
    @Inject(FinancialIntelligenceService)
    private readonly intelligence: FinancialIntelligenceService,
    @Inject(FinancialIntelligenceInputService)
    private readonly input: FinancialIntelligenceInputService,
    @Inject(DecisionsService) private readonly decisions: DecisionsService,
  ) {}

  async get(userId: string, householdId: string): Promise<FamilySummaryResponse> {
    const input = await this.input.build(userId, householdId);
    const currency = (input.currency || "SEK") as CurrencyCode;

    const [brief, liquidity, opportunities, household, settings] =
      await Promise.all([
        this.brief.getBrief(userId, householdId),
        this.intelligence.liquidity(userId, householdId).catch(() => null),
        this.decisions.opportunities(userId, householdId).catch(() => null),
        this.householdName(householdId),
        this.savingsRateTarget(householdId),
      ]);

    const kr = (minor: bigint) => formatMoney(money(minor, currency), "sv-SE");
    const findingsByType = new Map<string, BriefFinding[]>();
    for (const finding of brief.findings) {
      const list = findingsByType.get(finding.type) ?? [];
      list.push(finding);
      findingsByType.set(finding.type, list);
    }

    /* Normal-month medians for the savings rate and reserve coverage. */
    const populated = input.series.costs
      .map((month, index) => ({
        total:
          month.essentialMinor +
          month.semiDiscretionaryMinor +
          month.discretionaryMinor,
        essential: month.essentialMinor,
        income: input.series.income[index]?.amountMinor ?? 0n,
      }))
      .filter((m) => m.total > 0n || m.income > 0n);
    const medianIncome = medianMinor(
      populated.map((m) => m.income).filter((a) => a > 0n),
    );
    const medianCost = medianMinor(populated.map((m) => m.total).filter((a) => a > 0n));
    const medianEssential = medianMinor(
      populated.map((m) => m.essential).filter((a) => a > 0n),
    );
    const savingsRate =
      medianIncome != null && medianIncome > 0n
        ? Math.round(
            calculateNetSavingsRate({
              incomeMinor: medianIncome,
              spendingMinor: medianCost ?? 0n,
            }),
          )
        : null;
    const reserveMonths =
      medianEssential != null && medianEssential > 0n
        ? Number((input.liquidCashMinor * 10n) / medianEssential) / 10
        : null;

    const lowData = input.provenance.monthsOfHistory < 3;

    const waste = this.buildWaste(findingsByType);
    const saving = this.buildSaving({
      savingsRate,
      targetRate: settings,
      reserveMonths,
      shortfallMinor: liquidity ? BigInt(liquidity.requirement.shortfallMinor) : 0n,
      kr,
    });
    const action = this.buildAction({
      opportunities: opportunities?.items ?? [],
      waste,
      saving,
      currency,
    });

    return {
      householdId,
      asOf: input.asOf,
      greeting: household ? `Hej, ${household}` : "Hej",
      headline: brief.headline,
      narrative:
        brief.items.length > 0
          ? brief.items.map((item) => item.text)
          : ["Vi hittade inga tydliga avvikelser den här perioden."],
      aiStatus: brief.aiStatus,
      sections: { waste, saving, action },
      lowData,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Where does the money go?                                          */
  /* ---------------------------------------------------------------- */

  private buildWaste(
    byType: Map<string, BriefFinding[]>,
  ): FamilySummarySection {
    const above = byType.get("SPENDING_ABOVE_BASELINE")?.[0];
    const below = byType.get("SPENDING_BELOW_BASELINE")?.[0];
    const categoryUp = byType.get("CATEGORY_INCREASE") ?? [];
    const priceUp = byType.get("SUBSCRIPTION_PRICE_INCREASE") ?? [];
    const newSubs = byType.get("NEW_SUBSCRIPTION") ?? [];

    const rows: FamilySummarySection["rows"] = [];
    for (const finding of categoryUp.slice(0, 2)) {
      rows.push({
        label: finding.fragments.categoryName ?? "Kategori",
        amountText: finding.fragments.amount ?? null,
        tone: "negative",
        href: finding.explainRoute,
      });
    }
    for (const finding of priceUp.slice(0, 2)) {
      rows.push({
        label: `${finding.fragments.merchant ?? "Abonnemang"} – prishöjning`,
        amountText: finding.fragments.annualImpact
          ? `${finding.fragments.annualImpact}/år`
          : null,
        tone: "negative",
        href: finding.explainRoute,
      });
    }
    for (const finding of newSubs.slice(0, 1)) {
      rows.push({
        label: `${finding.fragments.merchant ?? "Abonnemang"} – nytt`,
        amountText: finding.fragments.monthlyPrice
          ? `${finding.fragments.monthlyPrice}/mån`
          : null,
        tone: "neutral",
        href: finding.explainRoute,
      });
    }

    let status: FamilySummaryStatus = "good";
    if (above || categoryUp.length >= 2) status = "act";
    else if (categoryUp.length > 0 || priceUp.length > 0) status = "watch";

    const topCategory = categoryUp[0]?.fragments.categoryName;
    let summary: string;
    if (above) {
      summary = topCategory
        ? `Ni spenderar ${above.fragments.amount} mer än er normala månad, mest på ${topCategory}.`
        : `Ni spenderar ${above.fragments.amount} mer än er normala månad.`;
    } else if (below) {
      summary = `Utgifterna ligger ${below.fragments.amount} under er normala månad – fint jobbat.`;
    } else if (rows.length > 0) {
      summary = "Några kostnader sticker ut mot er normala nivå.";
    } else {
      summary = "Utgifterna ligger i linje med er normala nivå.";
    }

    return {
      key: "waste",
      title: "Vart tar pengarna vägen?",
      status,
      summary,
      metricLabel: above ? "Mer än normalt" : below ? "Mindre än normalt" : null,
      metricValue: above?.fragments.amount ?? below?.fragments.amount ?? null,
      benchmark:
        "Riktvärde: jämför mot er egen 12-månadersnivå. Poster som avviker mer än 10 % lyfts fram.",
      rows: rows.slice(0, 3),
      ctaLabel: "Se vad som förändrats",
      ctaHref: "/what-changed",
    };
  }

  /* ---------------------------------------------------------------- */
  /* Are we saving enough?                                             */
  /* ---------------------------------------------------------------- */

  private buildSaving(args: {
    savingsRate: number | null;
    targetRate: number;
    reserveMonths: number | null;
    shortfallMinor: bigint;
    kr: (minor: bigint) => string;
  }): FamilySummarySection {
    const { savingsRate, targetRate, reserveMonths, shortfallMinor, kr } = args;

    // One source of truth: a normal month spends more than it earns only when
    // the (median-based) savings rate is at or below zero. Everything in this
    // section is judged from the same figure, so the metric and the sentence
    // can never disagree.
    const cashflowNegative = savingsRate != null && savingsRate <= 0;

    const rateBelowTarget = savingsRate != null && savingsRate < targetRate;
    const rateFarBelow =
      savingsRate != null && savingsRate < targetRate - SAVINGS_RATE_ACT_GAP;
    const reserveThin = reserveMonths != null && reserveMonths < RESERVE_MIN_MONTHS;
    const reserveModest =
      reserveMonths != null && reserveMonths < RESERVE_HEALTHY_MONTHS;

    let status: FamilySummaryStatus = "good";
    if (cashflowNegative || rateFarBelow || reserveThin) status = "act";
    else if (rateBelowTarget || reserveModest) status = "watch";

    const rows: FamilySummarySection["rows"] = [];
    if (savingsRate != null) {
      rows.push({
        label: `Sparkvot (mål ${targetRate} %)`,
        amountText: `${savingsRate} %`,
        tone: rateBelowTarget ? "negative" : "positive",
        href: "/cashflow",
      });
    }
    if (reserveMonths != null) {
      rows.push({
        label: "Buffert",
        amountText: `${reserveMonths.toLocaleString("sv-SE")} mån`,
        tone: reserveThin ? "negative" : reserveModest ? "neutral" : "positive",
        href: "/liquidity",
      });
    }
    if (shortfallMinor > 0n) {
      rows.push({
        label: "Saknas till rekommenderad buffert",
        amountText: kr(shortfallMinor),
        tone: "negative",
        href: "/liquidity",
      });
    }

    let summary: string;
    if (cashflowNegative) {
      summary =
        "En normal månad är utgifterna större än inkomsterna, så sparande är svårt just nu.";
    } else if (savingsRate != null && reserveMonths != null) {
      summary = `Ni sparar ${savingsRate} % av inkomsten (mål ${targetRate} %) och har ${reserveMonths.toLocaleString(
        "sv-SE",
      )} månaders buffert.`;
    } else if (savingsRate != null) {
      summary = `Ni sparar ${savingsRate} % av inkomsten (mål ${targetRate} %).`;
    } else {
      summary = "Det finns för lite historik för att bedöma sparandet ännu.";
    }

    return {
      key: "saving",
      title: "Sparar vi tillräckligt?",
      status,
      summary,
      metricLabel: "Sparkvot",
      metricValue: savingsRate != null ? `${savingsRate} %` : null,
      benchmark: `Riktvärde: spara minst ${targetRate} % av inkomsten och håll ${RESERVE_MIN_MONTHS}–${RESERVE_HEALTHY_MONTHS} månaders nödvändiga utgifter i buffert.`,
      rows: rows.slice(0, 4),
      ctaLabel: "Se sparande och buffert",
      ctaHref: "/savings",
    };
  }

  /* ---------------------------------------------------------------- */
  /* What should we do next?                                           */
  /* ---------------------------------------------------------------- */

  private buildAction(args: {
    opportunities: NonNullable<
      Awaited<ReturnType<DecisionsService["opportunities"]>>
    >["items"];
    waste: FamilySummarySection;
    saving: FamilySummarySection;
    currency: CurrencyCode;
  }): FamilySummarySection {
    const { opportunities, waste, saving } = args;
    const rows: FamilySummarySection["rows"] = [];

    // Lead with the most urgent household fix, then the ranked opportunities.
    if (saving.status === "act") {
      rows.push({
        label: "Stärk sparande och buffert",
        amountText: null,
        tone: "negative",
        href: "/savings",
      });
    } else if (waste.status === "act") {
      rows.push({
        label: "Se över det som ökat mest",
        amountText: null,
        tone: "negative",
        href: waste.ctaHref ?? "/what-changed",
      });
    }

    for (const opportunity of opportunities.slice(0, 3)) {
      const annual = opportunity.estimatedAnnualSaving
        ? formatMoney(moneyFromJson(opportunity.estimatedAnnualSaving), "sv-SE")
        : null;
      const evidenceHref = opportunity.evidence?.[0]?.href ?? "/opportunities";
      rows.push({
        label: opportunity.title,
        amountText: annual ? `${annual}/år` : null,
        tone: "positive",
        href: evidenceHref,
      });
    }

    const topOpportunity = opportunities[0];
    let status: FamilySummaryStatus = "good";
    if (saving.status === "act" || waste.status === "act") status = "act";
    else if (opportunities.length > 0 || saving.status === "watch") status = "watch";

    let summary: string;
    if (topOpportunity) {
      const annual = topOpportunity.estimatedAnnualSaving
        ? formatMoney(moneyFromJson(topOpportunity.estimatedAnnualSaving), "sv-SE")
        : null;
      summary = annual
        ? `Största möjligheten: ${topOpportunity.title} (~${annual}/år).`
        : `Största möjligheten: ${topOpportunity.title}.`;
    } else if (saving.status === "act") {
      summary = "Prioritera att öka sparandet och bygga bufferten.";
    } else if (waste.status === "act") {
      summary = "Se över de kostnader som ökat mest mot er normala nivå.";
    } else {
      summary = "Inget brådskande just nu – fortsätt som ni gör.";
    }

    return {
      key: "action",
      title: "Vad bör vi göra härnäst?",
      status,
      summary,
      metricLabel: null,
      metricValue: null,
      benchmark: "Prioriterat efter störst ekonomisk effekt först.",
      rows: rows.slice(0, 4),
      ctaLabel: "Alla möjligheter",
      ctaHref: "/opportunities",
    };
  }

  private async householdName(householdId: string): Promise<string | null> {
    const db = getDb();
    const [row] = await db
      .select({ name: households.name })
      .from(households)
      .where(eq(households.id, householdId))
      .limit(1);
    return row?.name ?? null;
  }

  private async savingsRateTarget(householdId: string): Promise<number> {
    const db = getDb();
    const [row] = await db
      .select({ target: householdSettings.savingsRateTargetPercent })
      .from(householdSettings)
      .where(eq(householdSettings.householdId, householdId))
      .limit(1);
    const parsed = row?.target != null ? Number(row.target) : NaN;
    return Number.isFinite(parsed) && parsed > 0
      ? Math.round(parsed)
      : DEFAULT_SAVINGS_RATE_TARGET_PERCENT;
  }
}
