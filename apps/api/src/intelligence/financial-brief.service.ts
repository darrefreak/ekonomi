import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  buildFindings,
  calculateCategoryTrend,
  calculateLiquidityRequirement,
  calculateNetSavingsRate,
  calculateSpendingBaseline,
  composeHeadline,
  explainLabel,
  FINDINGS_VERSION,
  medianMinor,
  mergeAiTexts,
  renderTemplateText,
  selectBriefFindings,
  TEMPLATE_VERSION,
  type BriefFinding,
  type FindingsInput,
} from "@ffos/financial-engine";
import type { BriefItem, FinancialBriefResponse } from "@ffos/schemas";
import { AiClassificationService } from "../ai/classification/ai-classification.service";
import { readAiClassificationConfig } from "../ai/classification/ai-config";
import { OpenAIBriefLanguageProvider } from "../ai/classification/openai-provider";
import type { BriefLanguageProvider } from "../ai/classification/provider";
import { getDb } from "../db/client";
import { financialBriefSnapshots } from "../db/schema-ai";
import { categories, sourceTransactions } from "../db/schema-economic";
import { expectedTransactions, recurringItems } from "../db/schema-planning";
import { householdSettings } from "../db/schema-ops";
import { HouseholdAccessService } from "../households/household-access.service";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";
import { FinancialIntelligenceInputService } from "./financial-intelligence-input.service";

/**
 * Financial Brief V2 (§33): deterministic intelligence → ranked structured
 * findings → optional language generation → validated final brief.
 *
 * The template pipeline is mandatory and complete on its own (§37). AI is a
 * prose enhancement that receives ranked findings only, and whose output is
 * grounded number-by-number against those findings before anyone sees it
 * (§38–§40). A failed grounding check or a failed provider falls back to the
 * template — never to an error page (§50).
 */

const BRIEF_PROMPT_VERSION = "brief-writer-v1";

/** Data older than this cannot support a current-state claim (§43). */
const FRESH_DATA_MAX_AGE_DAYS = 45;

/** Obligations below 5 000 kr are routine, not brief-worthy. */
const LARGE_OBLIGATION_FLOOR_MINOR = 500_000n;

/**
 * The reserve floor a household is measured against, in months of essential
 * spending. Three months is the widely cited lower bound for an emergency
 * fund (commonly stated as 3–6 months of necessary expenses); the household's
 * own volatility-adjusted requirement lives in the liquidity engine and is
 * shown separately. This is only the trigger for the "buffert" finding.
 */
const RESERVE_TARGET_MONTHS = 3;

/** Default net savings-rate target when the household has not set its own. */
const DEFAULT_SAVINGS_RATE_TARGET_PERCENT = 20;

@Injectable()
export class FinancialBriefService {
  private readonly logger = new Logger(FinancialBriefService.name);

  /** Test seam, mirroring AiClassificationService. */
  briefProviderOverride: BriefLanguageProvider | null = null;

  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(FinancialIntelligenceInputService)
    private readonly input: FinancialIntelligenceInputService,
    @Inject(HouseholdMetricsService)
    private readonly metrics: HouseholdMetricsService,
    @Inject(AiClassificationService)
    private readonly aiClassification: AiClassificationService,
  ) {}

  async getBrief(userId: string, householdId: string): Promise<FinancialBriefResponse> {
    await this.access.requireMembership(userId, householdId);
    const findings = await this.collectFindings(userId, householdId);
    const selected = selectBriefFindings(findings);

    const config = this.aiClassification.configOverride ?? readAiClassificationConfig();
    const householdEnabled = await this.householdAiEnabled(householdId);
    const provider =
      this.briefProviderOverride ?? new OpenAIBriefLanguageProvider(config);
    const aiAllowed =
      config.enabled && !config.dryRun && householdEnabled && provider.isConfigured();

    /*
     * Snapshot identity (§45): the findings themselves, hashed. Same inputs,
     * same brief — no regeneration on every render, and no second AI call
     * for a brief whose facts have not changed.
     */
    const inputHash = sha256(
      JSON.stringify(
        selected.map((finding) => ({
          key: finding.key,
          type: finding.type,
          severity: finding.severity,
          fragments: finding.fragments,
          values: finding.values,
        })),
      ),
    );
    const generator = aiAllowed ? "AI" : "TEMPLATE";

    const db = getDb();
    const [snapshot] = await db
      .select()
      .from(financialBriefSnapshots)
      .where(
        and(
          eq(financialBriefSnapshots.householdId, householdId),
          eq(financialBriefSnapshots.inputHash, inputHash),
          eq(financialBriefSnapshots.findingsVersion, FINDINGS_VERSION),
          eq(financialBriefSnapshots.templateVersion, TEMPLATE_VERSION),
          eq(financialBriefSnapshots.generator, generator),
        ),
      )
      .orderBy(desc(financialBriefSnapshots.createdAt))
      .limit(1);

    if (snapshot) {
      const body = snapshot.brief as unknown as Pick<
        FinancialBriefResponse,
        "headline" | "items" | "findings" | "findingsConsidered" | "model"
      >;
      return this.respond(householdId, snapshot.id, snapshot.asOf, body, {
        generator: snapshot.generator as "TEMPLATE" | "AI",
        model: snapshot.model,
        promptVersion: snapshot.promptVersion,
        inputHash,
        fromCache: true,
        aiAllowed,
        providerConfigured: provider.isConfigured(),
        createdAt: snapshot.createdAt,
      });
    }

    // Render: template first — it is the floor AI can only stand on (§37).
    let headline = composeHeadline(selected);
    const texts = new Map(
      selected.map((finding) => [finding.key, renderTemplateText(finding)]),
    );
    let model: string | null = null;
    let usedAi = false;

    if (aiAllowed && selected.length > 0) {
      try {
        const response = await provider.render({
          findings: selected.map((finding) => ({
            key: finding.key,
            type: finding.type,
            severity: finding.severity,
            fragments: finding.fragments,
            templateText: renderTemplateText(finding),
          })),
          promptVersion: BRIEF_PROMPT_VERSION,
        });
        const merged = mergeAiTexts(selected, response.texts);
        for (const [key, text] of merged.texts) texts.set(key, text);
        if (merged.rejectedKeys.length > 0) {
          this.logger.warn(
            `Brief AI texts rejected by numeric grounding: ${merged.rejectedKeys.join(", ")}`,
          );
        }
        // The headline may carry no numbers at all (§40): a digit-free AI
        // headline is accepted, anything else keeps the template headline.
        if (response.headline && !/\d/.test(response.headline)) {
          headline = response.headline;
        }
        model = response.model;
        usedAi = true;
      } catch (error) {
        // Provider down → template brief, not a broken page (§50, §62).
        this.logger.warn(
          `Brief AI generation failed, falling back to template: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const items: BriefItem[] = selected.map((finding) => ({
      findingKey: finding.key,
      type: finding.type,
      severity: finding.severity,
      text: texts.get(finding.key) ?? renderTemplateText(finding),
      explainRoute: finding.explainRoute,
      explainLabel: explainLabel(finding.type),
    }));

    const asOf = selected[0]?.asOf ?? new Date().toISOString().slice(0, 10);
    const body = {
      headline,
      items,
      findings: selected.map(serializeFinding),
      findingsConsidered: findings.length,
      model,
    };

    const [stored] = await db
      .insert(financialBriefSnapshots)
      .values({
        householdId,
        asOf,
        inputHash,
        findingsVersion: FINDINGS_VERSION,
        templateVersion: TEMPLATE_VERSION,
        generator: usedAi ? "AI" : "TEMPLATE",
        promptVersion: usedAi ? BRIEF_PROMPT_VERSION : null,
        model,
        headline,
        brief: body as unknown as Record<string, unknown>,
      })
      .onConflictDoUpdate({
        target: [
          financialBriefSnapshots.householdId,
          financialBriefSnapshots.inputHash,
          financialBriefSnapshots.findingsVersion,
          financialBriefSnapshots.templateVersion,
          financialBriefSnapshots.generator,
        ],
        set: { brief: body as unknown as Record<string, unknown>, headline },
      })
      .returning();

    return this.respond(householdId, stored.id, asOf, body, {
      generator: usedAi ? "AI" : "TEMPLATE",
      model,
      promptVersion: usedAi ? BRIEF_PROMPT_VERSION : null,
      inputHash,
      fromCache: false,
      aiAllowed,
      providerConfigured: provider.isConfigured(),
      createdAt: stored.createdAt,
    });
  }

  private respond(
    householdId: string,
    briefId: string,
    asOf: string,
    body: Pick<
      FinancialBriefResponse,
      "headline" | "items" | "findings" | "findingsConsidered" | "model"
    >,
    meta: {
      generator: "TEMPLATE" | "AI";
      model: string | null;
      promptVersion: string | null;
      inputHash: string;
      fromCache: boolean;
      aiAllowed: boolean;
      providerConfigured: boolean;
      createdAt: Date;
    },
  ): FinancialBriefResponse {
    /*
     * AI status the user can actually read (§50). Disabled is a normal state
     * with a normal sentence, not an error; and the deterministic analysis is
     * explicitly said to keep working.
     */
    const message = meta.aiAllowed
      ? meta.generator === "AI"
        ? "Formulerad med AI utifrån systemets beräknade värden."
        : "AI-tjänsten kunde inte nås — texten nedan är systemets egna formuleringar."
      : "Extern AI-analys är avstängd. Systemets automatiska analys fungerar fortfarande.";

    return {
      briefId,
      householdId,
      asOf,
      headline: body.headline,
      items: body.items,
      findings: body.findings,
      findingsConsidered: body.findingsConsidered,
      generator: meta.generator,
      model: meta.model,
      templateVersion: TEMPLATE_VERSION,
      findingsVersion: FINDINGS_VERSION,
      promptVersion: meta.promptVersion,
      inputHash: meta.inputHash,
      fromCache: meta.fromCache,
      aiStatus: { enabled: meta.aiAllowed, message },
      createdAt: meta.createdAt.toISOString(),
    };
  }

  /** The household's configured savings-rate target, or the default. */
  private savingsRateTarget(configured: string | null): number {
    if (configured == null) return DEFAULT_SAVINGS_RATE_TARGET_PERCENT;
    const parsed = Number(configured);
    return Number.isFinite(parsed) && parsed > 0
      ? Math.round(parsed)
      : DEFAULT_SAVINGS_RATE_TARGET_PERCENT;
  }

  private async householdAiEnabled(householdId: string): Promise<boolean> {
    const db = getDb();
    const [row] = await db
      .select({ enabled: householdSettings.aiTransactionAnalysisEnabled })
      .from(householdSettings)
      .where(eq(householdSettings.householdId, householdId))
      .limit(1);
    return row?.enabled ?? false;
  }

  /**
   * Assemble the findings input from the deterministic services and hand it
   * to the pure engine (§34). Nothing here invents a number: every value is
   * an engine result or a stored deterministic figure.
   */
  private async collectFindings(
    userId: string,
    householdId: string,
  ): Promise<BriefFinding[]> {
    const input = await this.input.build(userId, householdId);
    const db = getDb();
    const asOf = input.asOf;
    const fresh = input.dataAgeDays <= FRESH_DATA_MAX_AGE_DAYS;
    const currentMonth = asOf.slice(0, 7);

    const [settingsRow] = await db
      .select({ savingsRateTargetPercent: householdSettings.savingsRateTargetPercent })
      .from(householdSettings)
      .where(eq(householdSettings.householdId, householdId))
      .limit(1);
    const settingsTargetPercent = settingsRow?.savingsRateTargetPercent ?? null;

    const findingsInput: FindingsInput = { asOf };

    /* Total spending vs 12-month baseline (§34: SPENDING_ABOVE/BELOW_BASELINE). */
    const populatedTotals = input.series.costs
      .map((month) => ({
        month: month.month,
        amountMinor:
          month.essentialMinor + month.semiDiscretionaryMinor + month.discretionaryMinor,
      }))
      .filter((month) => month.amountMinor > 0n);
    // The month in progress is not a normal month yet: compare the last
    // *completed* month against the 12 months before it.
    const completed = populatedTotals.filter((month) => month.month < currentMonth);
    const currentEntry = completed[completed.length - 1];
    if (currentEntry) {
      const baseline = calculateSpendingBaseline({
        monthlyTotals: completed.slice(0, -1),
        window: "12m",
      });
      if (!baseline.insufficient && baseline.medianMinor != null) {
        findingsInput.spendingBaseline = {
          currentMonthMinor: currentEntry.amountMinor,
          baselineMedianMinor: baseline.medianMinor,
          monthsObserved: baseline.monthsObserved,
          fresh,
        };
      }
    }

    /* Category trends vs their own 12-month baselines (§34: CATEGORY_*). */
    if (currentEntry) {
      const categoryPoints = await db
        .select({
          month: sql<string>`to_char(${sourceTransactions.bookingDate}, 'YYYY-MM')`,
          categoryKey: categories.key,
          categoryName: categories.name,
          amountMinor: sql<string>`sum(abs(${sourceTransactions.amountMinor}))::text`,
        })
        .from(sourceTransactions)
        .innerJoin(categories, eq(sourceTransactions.categoryId, categories.id))
        .where(
          and(
            eq(sourceTransactions.householdId, householdId),
            sql`${sourceTransactions.amountMinor} < 0`,
            sql`${sourceTransactions.bookingDate} >= (${asOf}::date - interval '14 months')`,
          ),
        )
        .groupBy(
          sql`to_char(${sourceTransactions.bookingDate}, 'YYYY-MM')`,
          categories.key,
          categories.name,
        );

      const nameByKey = new Map(categoryPoints.map((p) => [p.categoryKey, p.categoryName]));
      const points = categoryPoints.map((p) => ({
        month: p.month,
        categoryKey: p.categoryKey,
        amountMinor: BigInt(p.amountMinor),
      }));
      const keys = [...new Set(points.map((p) => p.categoryKey))];
      const trends: NonNullable<FindingsInput["categoryTrends"]> = [];
      for (const key of keys) {
        const trend = calculateCategoryTrend({
          categoryKey: key,
          points,
          currentMonth: currentEntry.month,
        });
        if (
          trend.changeVsBaselinePercent == null ||
          trend.changeVsBaselineMinor == null ||
          trend.average12mMinor == null
        ) {
          continue;
        }
        // A trend on a trivial category is noise: require a real base level.
        if (trend.average12mMinor < 50_000n) continue;
        trends.push({
          categoryKey: key,
          categoryName: nameByKey.get(key) ?? key,
          changeVsBaselinePercent: trend.changeVsBaselinePercent,
          changeVsBaselineMinor: trend.changeVsBaselineMinor,
          fresh,
        });
      }
      // Strongest deviations first; the ranking engine takes it from there.
      trends.sort(
        (a, b) =>
          Math.abs(b.changeVsBaselinePercent) - Math.abs(a.changeVsBaselinePercent),
      );
      findingsInput.categoryTrends = trends.slice(0, 5);
    }

    /* Subscription price increases + new subscriptions (§34). */
    const recurringRows = await db
      .select()
      .from(recurringItems)
      .where(eq(recurringItems.householdId, householdId));
    const priceChanges: NonNullable<FindingsInput["subscriptionPriceChanges"]> = [];
    const newSubscriptions: NonNullable<FindingsInput["newSubscriptions"]> = [];
    for (const item of recurringRows) {
      const changes = item.priceChanges ?? [];
      const latest = changes[changes.length - 1];
      if (latest && withinDays(latest.changedOn, asOf, 120)) {
        const from = BigInt(latest.fromMinor);
        const to = BigInt(latest.toMinor);
        if (to > from) {
          priceChanges.push({
            merchantName: item.name,
            previousAmountMinor: from,
            newAmountMinor: to,
            annualImpactMinor: item.annualPriceImpactMinor ?? (to - from) * 12n,
            recurringId: item.id,
          });
        }
      }
      if (
        item.isSubscription &&
        item.firstSeenOn &&
        withinDays(item.firstSeenOn, asOf, 60) &&
        !latest
      ) {
        newSubscriptions.push({
          merchantName: item.name,
          monthlyAmountMinor: item.medianAmountMinor ?? item.amountMinor,
          recurringId: item.id,
        });
      }
    }
    findingsInput.subscriptionPriceChanges = priceChanges;
    findingsInput.newSubscriptions = newSubscriptions;

    /* Missing expected income (§34: MISSING_EXPECTED_INCOME). */
    const missedIncome = await db
      .select({
        expectation: expectedTransactions,
        name: recurringItems.name,
      })
      .from(expectedTransactions)
      .innerJoin(
        recurringItems,
        eq(expectedTransactions.recurringItemId, recurringItems.id),
      )
      .where(
        and(
          eq(expectedTransactions.householdId, householdId),
          eq(expectedTransactions.status, "MISSED"),
          eq(expectedTransactions.direction, "INFLOW"),
        ),
      )
      .orderBy(desc(expectedTransactions.expectedTo))
      .limit(3);
    findingsInput.missingExpectedIncome = missedIncome.map((row) => ({
      label: row.name,
      expectedAmountMinor: row.expectation.expectedAmountMinor,
      expectedDate: row.expectation.expectedTo,
    }));

    /* Liquidity vs requirement (§34: LIQUIDITY_*). Same engine, not a new formula. */
    const populated = input.series.costs.filter(
      (month, index) =>
        month.essentialMinor > 0n ||
        month.semiDiscretionaryMinor > 0n ||
        month.discretionaryMinor > 0n ||
        (input.series.income[index]?.amountMinor ?? 0n) > 0n,
    );
    const populatedIncome = input.series.income.filter((_, index) => {
      const cost = input.series.costs[index];
      if (!cost) return false;
      return (
        cost.essentialMinor > 0n ||
        cost.semiDiscretionaryMinor > 0n ||
        cost.discretionaryMinor > 0n ||
        input.series.income[index]!.amountMinor > 0n
      );
    });
    if (populated.length >= 3) {
      const requirement = calculateLiquidityRequirement({
        monthlyCosts: populated,
        monthlyIncome: populatedIncome,
        upcomingObligations: input.upcomingObligations,
        sinkingFunds: input.sinkingFunds,
        liquidCashMinor: input.liquidCashMinor,
        coveragePercent: input.coveragePercent,
        dataAgeDays: input.dataAgeDays,
        policy: input.policy,
      });
      findingsInput.liquidity = {
        availableMinor: input.liquidCashMinor,
        requiredMinor: requirement.recommendedMinor,
        fresh,
      };
    }

    /*
     * Savings rate vs the household's target, and reserve months vs the
     * research floor. Both were defined in the findings engine but never wired
     * in — a family's two most important questions ("sparar vi för lite?",
     * "har vi en buffert?") were silently missing from the brief.
     *
     * Both are read off the household's *normal* month (medians of completed
     * months), not the month in progress, and both come from existing engine
     * functions. No number is invented here.
     */
    if (populated.length >= 3) {
      const totals = populated.map(
        (month) =>
          month.essentialMinor + month.semiDiscretionaryMinor + month.discretionaryMinor,
      );
      const incomes = populatedIncome
        .map((month) => month.amountMinor)
        .filter((amount) => amount > 0n);
      const essentials = populated
        .map((month) => month.essentialMinor)
        .filter((amount) => amount > 0n);
      const medianIncome = medianMinor(incomes);
      const medianCost = medianMinor(totals.filter((amount) => amount > 0n));
      const medianEssential = medianMinor(essentials);

      if (medianIncome != null && medianIncome > 0n) {
        const currentPercent = calculateNetSavingsRate({
          incomeMinor: medianIncome,
          spendingMinor: medianCost ?? 0n,
        });
        findingsInput.savingsRate = {
          currentPercent,
          targetPercent: this.savingsRateTarget(settingsTargetPercent),
          fresh,
        };
      }

      if (medianEssential != null && medianEssential > 0n) {
        // One-decimal months of essential-only coverage from liquid cash.
        const coverageMonths =
          Number((input.liquidCashMinor * 10n) / medianEssential) / 10;
        findingsInput.reserve = {
          coverageMonths,
          targetMonths: RESERVE_TARGET_MONTHS,
          fresh,
        };
      }
    }

    /* Upcoming large obligations (§34). */
    findingsInput.upcomingLargeObligations = input.upcomingObligations
      .filter((obligation) => obligation.amountMinor >= LARGE_OBLIGATION_FLOOR_MINOR)
      .slice(0, 3)
      .map((obligation) => ({
        label: obligation.label,
        amountMinor: obligation.amountMinor,
        dueDate: obligation.dueDate,
      }));

    /* Coverage gaps (§42): missing areas lower the brief's claim to completeness. */
    const coverage = await this.metrics.coverage(householdId, asOf);
    const missingAreas = (coverage.areas as Array<{ label: string; status: string }>)
      .filter((area) => area.status === "missing")
      .map((area) => area.label);
    findingsInput.coverage = { missingAreas };

    return buildFindings(findingsInput);
  }
}

function serializeFinding(finding: BriefFinding) {
  return {
    key: finding.key,
    type: finding.type,
    severity: finding.severity,
    impactMinor: finding.impactMinor.toString(),
    confidence: finding.confidence,
    fragments: finding.fragments,
    values: finding.values,
    explainRoute: finding.explainRoute,
    dedupeGroup: finding.dedupeGroup,
    asOf: finding.asOf,
    fresh: finding.fresh,
  };
}

function withinDays(date: string, asOf: string, days: number): boolean {
  const then = new Date(`${date}T00:00:00Z`).getTime();
  const now = new Date(`${asOf}T00:00:00Z`).getTime();
  const diff = (now - then) / 86_400_000;
  return diff >= 0 && diff <= days;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
