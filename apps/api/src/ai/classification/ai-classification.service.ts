import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  AI_CLASSIFICATION_SCHEMA_VERSION,
  HIGH_RISK_TRANSACTION_TYPES,
  TRANSACTION_CLASSIFIER_PROMPT_VERSION,
  type AiClassificationRunReport,
  type AiClusterClassification,
  type AiDryRunReport,
  type AiStatusResponse,
} from "@ffos/schemas";
import { getDb } from "../../db/client";
import { auditLogs, households } from "../../db/schema";
import { aiClassificationResults } from "../../db/schema-ai";
import {
  accounts,
  categories,
  merchantClusters,
  merchants,
  sourceTransactions,
} from "../../db/schema-economic";
import { householdSettings } from "../../db/schema-ops";
import { HouseholdAccessService } from "../../households/household-access.service";
import { readAiClassificationConfig, type AiClassificationConfig } from "./ai-config";
import {
  AUTO_APPLY_THRESHOLD,
  combineConfidence,
  SUGGEST_THRESHOLD,
} from "./confidence";
import { OpenAITransactionClassificationProvider } from "./openai-provider";
import {
  ClassificationProviderError,
  type AllowedTaxonomyEntry,
  type MinimizedClusterPayload,
  type TransactionClassificationProvider,
} from "./provider";
import { hasSemanticText, redactDescription } from "./redaction";

/**
 * AI classification of unresolved clusters only (§7).
 *
 * This service owns the whole boundary: which clusters may be asked about,
 * what leaves the machine, what comes back in, and what is allowed to change
 * because of it. The deterministic pipeline neither knows nor cares whether
 * this service exists — with AI off, everything else works identically (§5).
 *
 * It never writes a financial event, a posting or a balance. Application
 * means merchant/category on transactions that are not USER_VERIFIED, labeled
 * AI_MATCH so the coverage metrics stay truthful (§14).
 */

/** Clusters per provider request. Small enough to keep responses focused. */
const BATCH_SIZE = 10;

type EligibleCluster = {
  row: typeof merchantClusters.$inferSelect;
  payload: MinimizedClusterPayload;
};

type EligibilityReport = {
  transactionsAnalyzed: number;
  clustersTotal: number;
  resolvedDeterministic: number;
  resolvedLearnedRule: number;
  resolvedUserVerified: number;
  resolvedAi: number;
  unresolvedClusters: number;
  opaqueExcluded: number;
  eligible: EligibleCluster[];
  taxonomy: AllowedTaxonomyEntry[];
  taxonomyVersion: string;
};

@Injectable()
export class AiClassificationService {
  private readonly logger = new Logger(AiClassificationService.name);

  /**
   * Test seams: acceptance and integration tests replace the provider and the
   * config reader; production code never touches these.
   */
  providerOverride: TransactionClassificationProvider | null = null;
  configOverride: AiClassificationConfig | null = null;

  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
  ) {}

  private config(): AiClassificationConfig {
    return this.configOverride ?? readAiClassificationConfig();
  }

  private provider(): TransactionClassificationProvider {
    return this.providerOverride ?? new OpenAITransactionClassificationProvider(this.config());
  }

  /** Household opt-in (§21). Missing row means the default: off. */
  private async householdEnabled(householdId: string): Promise<boolean> {
    const db = getDb();
    const [row] = await db
      .select({ enabled: householdSettings.aiTransactionAnalysisEnabled })
      .from(householdSettings)
      .where(eq(householdSettings.householdId, householdId))
      .limit(1);
    return row?.enabled ?? false;
  }

  /**
   * Eligibility (§7): unresolved clusters only, after every deterministic
   * mechanism has had its chance, with enough semantic text to be worth
   * asking about. Used identically by dry-run and real mode (§6).
   */
  private async eligibility(householdId: string): Promise<EligibilityReport> {
    const db = getDb();
    const [clusterRows, [txCount], taxonomyRows, [household]] = await Promise.all([
      db
        .select()
        .from(merchantClusters)
        .where(eq(merchantClusters.householdId, householdId))
        .orderBy(sql`${merchantClusters.transactionCount} desc`),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(sourceTransactions)
        .where(eq(sourceTransactions.householdId, householdId)),
      db
        .select({
          id: categories.id,
          key: categories.key,
          name: categories.name,
          parentId: categories.parentId,
        })
        .from(categories)
        .where(
          sql`(${categories.householdId} = ${householdId} or ${categories.householdId} is null) and ${categories.archivedAt} is null`,
        ),
      db
        .select({ baseCurrency: households.baseCurrency })
        .from(households)
        .where(eq(households.id, householdId))
        .limit(1),
    ]);

    const currency = household?.baseCurrency ?? "SEK";
    const taxonomy: AllowedTaxonomyEntry[] = taxonomyRows.map((row) => ({
      id: row.id,
      key: row.key,
      name: row.name,
      parentId: row.parentId,
    }));
    /*
     * Taxonomy version = hash of the allowed id set (§15, §59). Add or remove
     * a category and every cached answer is reconsidered, because the answer
     * space itself changed.
     */
    const taxonomyVersion = sha256(
      taxonomy
        .map((entry) => entry.id)
        .sort()
        .join(","),
    ).slice(0, 16);

    let resolvedDeterministic = 0;
    let resolvedLearnedRule = 0;
    let resolvedUserVerified = 0;
    let resolvedAi = 0;
    let opaqueExcluded = 0;
    const unresolved: Array<typeof merchantClusters.$inferSelect> = [];

    for (const row of clusterRows) {
      switch (row.classificationSource) {
        case "DETERMINISTIC_MATCH":
          resolvedDeterministic += 1;
          break;
        case "LEARNED_RULE":
          resolvedLearnedRule += 1;
          break;
        case "USER_VERIFIED":
          resolvedUserVerified += 1;
          break;
        case "AI_MATCH":
          resolvedAi += 1;
          break;
        default:
          if (row.dismissedAt == null) unresolved.push(row);
      }
    }

    // Dominant account type per signature, one grouped query for all of them.
    const signatures = unresolved.map((row) => row.signature);
    const accountTypeRows = signatures.length
      ? await db
          .select({
            signature: sourceTransactions.signature,
            accountType: accounts.accountType,
            count: sql<number>`count(*)::int`,
          })
          .from(sourceTransactions)
          .innerJoin(accounts, eq(sourceTransactions.accountId, accounts.id))
          .where(
            and(
              eq(sourceTransactions.householdId, householdId),
              inArray(sourceTransactions.signature, signatures),
            ),
          )
          .groupBy(sourceTransactions.signature, accounts.accountType)
      : [];
    const accountTypeBySignature = new Map<string, string>();
    const bestCount = new Map<string, number>();
    for (const row of accountTypeRows) {
      if (row.signature == null) continue;
      if ((bestCount.get(row.signature) ?? -1) < row.count) {
        bestCount.set(row.signature, row.count);
        accountTypeBySignature.set(row.signature, row.accountType);
      }
    }

    const eligible: EligibleCluster[] = [];
    for (const row of unresolved) {
      /*
       * Redact first, then judge (§9 before §7): eligibility is decided on
       * the text that would actually leave the system, so a description that
       * is nothing but a payment reference redacts down to placeholders and
       * fails the semantic-text test.
       */
      const redactedSamples = (row.representativeDescriptions ?? [])
        .map((description) => redactDescription(description).text)
        .filter((text) => text.length > 0)
        .slice(0, 5);
      const normalized = redactedSamples[0] ?? "";
      if (row.opaque || !normalized || !hasSemanticText(normalized)) {
        opaqueExcluded += 1;
        continue;
      }

      eligible.push({
        row,
        payload: {
          // Opaque reference for the provider: a hash, never a database id.
          clusterRef: sha256(`${row.signature}|${row.direction}`).slice(0, 16),
          normalizedDescription: normalized,
          sampleDescriptions: redactedSamples,
          direction: row.direction === "INFLOW" ? "INFLOW" : "OUTFLOW",
          accountType: accountTypeBySignature.get(row.signature) ?? null,
          currency,
          medianAmountMinor: (row.medianAmountMinor ?? 0n).toString(),
          minAmountMinor: (row.minAmountMinor ?? row.medianAmountMinor ?? 0n).toString(),
          maxAmountMinor: (row.maxAmountMinor ?? row.medianAmountMinor ?? 0n).toString(),
          occurrenceCount: row.transactionCount,
          medianIntervalDays: row.medianIntervalDays,
          existingMerchantCandidate: row.merchantCandidate,
        },
      });
    }

    return {
      transactionsAnalyzed: txCount?.count ?? 0,
      clustersTotal: clusterRows.length,
      resolvedDeterministic,
      resolvedLearnedRule,
      resolvedUserVerified,
      resolvedAi,
      unresolvedClusters: unresolved.length,
      opaqueExcluded,
      eligible,
      taxonomy,
      taxonomyVersion,
    };
  }

  /** Cache rows matching the current identity for a set of eligible clusters (§15). */
  private async cachedRows(
    householdId: string,
    eligible: EligibleCluster[],
    taxonomyVersion: string,
    model: string,
  ) {
    if (eligible.length === 0) return new Map<string, typeof aiClassificationResults.$inferSelect>();
    const db = getDb();
    const rows = await db
      .select()
      .from(aiClassificationResults)
      .where(
        and(
          eq(aiClassificationResults.householdId, householdId),
          inArray(
            aiClassificationResults.signature,
            eligible.map((entry) => entry.row.signature),
          ),
          eq(aiClassificationResults.taxonomyVersion, taxonomyVersion),
          eq(aiClassificationResults.promptVersion, TRANSACTION_CLASSIFIER_PROMPT_VERSION),
          eq(aiClassificationResults.model, model),
        ),
      );
    return new Map(
      rows
        .filter((row) => row.status !== "ERROR")
        .map((row) => [`${row.signature}|${row.direction}|${row.signatureVersion}`, row]),
    );
  }

  /** Dry-run (§6): the same eligibility maths, zero external effects. */
  async dryRun(userId: string, householdId: string): Promise<AiDryRunReport> {
    await this.access.requireMembership(userId, householdId);
    return this.dryRunForHousehold(householdId);
  }

  async dryRunForHousehold(householdId: string): Promise<AiDryRunReport> {
    const config = this.config();
    const report = await this.eligibility(householdId);
    const limited = report.eligible.slice(0, config.maxClustersPerRun);
    const cached = await this.cachedRows(
      householdId,
      limited,
      report.taxonomyVersion,
      this.provider().model,
    );
    const uncached = limited.filter(
      (entry) =>
        !cached.has(
          `${entry.row.signature}|${entry.row.direction}|${entry.row.signatureVersion}`,
        ),
    );
    const estimatedPayloadBytes = Buffer.byteLength(
      JSON.stringify({
        clusters: uncached.map((entry) => entry.payload),
        allowedTaxonomy: report.taxonomy,
      }),
      "utf8",
    );

    return {
      householdId,
      transactionsAnalyzed: report.transactionsAnalyzed,
      clustersTotal: report.clustersTotal,
      resolvedDeterministic: report.resolvedDeterministic,
      resolvedLearnedRule: report.resolvedLearnedRule,
      resolvedUserVerified: report.resolvedUserVerified,
      resolvedAi: report.resolvedAi,
      unresolvedClusters: report.unresolvedClusters,
      aiEligibleClusters: report.eligible.length,
      opaqueExcluded: report.opaqueExcluded,
      cachedResults: cached.size,
      estimatedRequests: Math.ceil(uncached.length / BATCH_SIZE),
      estimatedPayloadBytes,
      providerCallsMade: 0,
      dryRun: true,
    };
  }

  /** HTTP entry: member-checked, then the same run the job performs. */
  async classify(
    userId: string,
    householdId: string,
  ): Promise<AiClassificationRunReport | AiDryRunReport> {
    await this.access.requireCanWrite(userId, householdId);
    return this.classifyForHousehold(householdId, userId);
  }

  /**
   * The AI classification run (§22). Used by the HTTP route and the
   * AI_CLASSIFY_TRANSACTION_CLUSTERS job. Reruns are idempotent: the cache
   * identity absorbs repeats, application only touches still-unresolved
   * clusters, and a rerun of an applied cluster is simply not eligible (§23).
   */
  async classifyForHousehold(
    householdId: string,
    actorUserId: string | null = null,
  ): Promise<AiClassificationRunReport | AiDryRunReport> {
    const config = this.config();
    const householdEnabled = await this.householdEnabled(householdId);

    /*
     * The gate (§5, §32): every switch must be on before a byte leaves the
     * machine. Anything less falls back to the dry-run report, which is a
     * complete, honest answer rather than an error.
     */
    const provider = this.provider();
    if (
      !config.enabled ||
      config.dryRun ||
      !householdEnabled ||
      !provider.isConfigured()
    ) {
      return this.dryRunForHousehold(householdId);
    }

    const db = getDb();
    const report = await this.eligibility(householdId);
    const limited = report.eligible.slice(0, config.maxClustersPerRun);
    const cached = await this.cachedRows(
      householdId,
      limited,
      report.taxonomyVersion,
      provider.model,
    );

    const run: AiClassificationRunReport = {
      householdId,
      eligibleClusters: report.eligible.length,
      cacheHits: 0,
      providerCalls: 0,
      applied: 0,
      suggested: 0,
      unknown: 0,
      rejected: 0,
      failed: 0,
      dryRun: false,
      promptVersion: TRANSACTION_CLASSIFIER_PROMPT_VERSION,
    };

    const uncached: EligibleCluster[] = [];
    for (const entry of limited) {
      const key = `${entry.row.signature}|${entry.row.direction}|${entry.row.signatureVersion}`;
      const hit = cached.get(key);
      if (hit) {
        /*
         * Cache hit (§58): the stored decision is replayed, not recomputed.
         * An APPLIED answer re-applies only if the cluster somehow regressed
         * to UNKNOWN; a SUGGESTED answer refreshes the suggestion.
         */
        run.cacheHits += 1;
        await db
          .update(aiClassificationResults)
          .set({ hitCount: sql`${aiClassificationResults.hitCount} + 1`, updatedAt: new Date() })
          .where(eq(aiClassificationResults.id, hit.id));
        if (hit.status === "APPLIED" || hit.status === "SUGGESTED") {
          const result = hit.result as AiClusterClassification | null;
          if (result) {
            const outcome = await this.route(
              householdId,
              entry,
              result,
              report.taxonomy,
              Number(hit.combinedConfidence ?? 0),
            );
            bump(run, outcome);
            continue;
          }
        }
        run.unknown += hit.status === "UNKNOWN" ? 1 : 0;
        run.rejected += hit.status === "REJECTED" ? 1 : 0;
        continue;
      }
      uncached.push(entry);
    }

    for (let start = 0; start < uncached.length; start += BATCH_SIZE) {
      const batch = uncached.slice(start, start + BATCH_SIZE);
      const inputHash = sha256(
        JSON.stringify({
          clusters: batch.map((entry) => entry.payload),
          taxonomyVersion: report.taxonomyVersion,
          promptVersion: TRANSACTION_CLASSIFIER_PROMPT_VERSION,
        }),
      );

      let results: AiClusterClassification[] = [];
      let usage: Record<string, number> | null = null;
      let latencyMs: number | null = null;
      try {
        const response = await provider.classify({
          clusters: batch.map((entry) => entry.payload),
          taxonomy: report.taxonomy,
          promptVersion: TRANSACTION_CLASSIFIER_PROMPT_VERSION,
          schemaVersion: AI_CLASSIFICATION_SCHEMA_VERSION,
        });
        run.providerCalls += 1;
        results = response.results;
        usage = response.usage
          ? {
              promptTokens: response.usage.promptTokens,
              completionTokens: response.usage.completionTokens,
            }
          : null;
        latencyMs = response.latencyMs;
        await this.auditProviderCall(householdId, actorUserId, {
          clusters: batch.length,
          model: provider.model,
          promptVersion: TRANSACTION_CLASSIFIER_PROMPT_VERSION,
          usage,
          latencyMs,
        });
      } catch (error) {
        /*
         * Failure fallback (§18): the batch is recorded as ERROR, the
         * clusters stay unresolved and reviewable, and the run continues
         * with the next batch. Nothing financial happened, so nothing
         * financial needs undoing.
         */
        const kind =
          error instanceof ClassificationProviderError ? error.kind : "UNAVAILABLE";
        this.logger.warn(
          `AI provider batch failed (${kind}) for household ${householdId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        run.failed += batch.length;
        run.providerCalls += 1;
        for (const entry of batch) {
          await this.persistResult(householdId, entry, {
            taxonomyVersion: report.taxonomyVersion,
            provider: provider.name,
            model: provider.model,
            inputHash,
            status: "ERROR",
            result: null,
            combinedConfidence: null,
            failureReason: kind,
            usage: null,
            latencyMs: null,
          });
        }
        continue;
      }

      const byRef = new Map(results.map((result) => [result.clusterRef, result]));
      for (const entry of batch) {
        const result = byRef.get(entry.payload.clusterRef);
        if (!result) {
          // The model skipped a cluster: treated as UNKNOWN, never invented.
          run.unknown += 1;
          await this.persistResult(householdId, entry, {
            taxonomyVersion: report.taxonomyVersion,
            provider: provider.name,
            model: provider.model,
            inputHash,
            status: "UNKNOWN",
            result: null,
            combinedConfidence: null,
            failureReason: "MISSING_FROM_RESPONSE",
            usage,
            latencyMs,
          });
          continue;
        }

        const validation = this.validateResult(result, report.taxonomy);
        if (!validation.ok) {
          run.rejected += 1;
          await this.persistResult(householdId, entry, {
            taxonomyVersion: report.taxonomyVersion,
            provider: provider.name,
            model: provider.model,
            inputHash,
            status: "REJECTED",
            result: result as unknown as Record<string, unknown>,
            combinedConfidence: null,
            failureReason: validation.reason,
            usage,
            latencyMs,
          });
          continue;
        }

        const confidence = combineConfidence(result, entry.payload);
        const outcome = await this.route(
          householdId,
          entry,
          result,
          report.taxonomy,
          confidence.combined,
        );
        bump(run, outcome);
        await this.persistResult(householdId, entry, {
          taxonomyVersion: report.taxonomyVersion,
          provider: provider.name,
          model: provider.model,
          inputHash,
          status: outcome,
          result: result as unknown as Record<string, unknown>,
          combinedConfidence: confidence.combined,
          failureReason: null,
          usage,
          latencyMs,
        });
      }
    }

    await this.auditRun(householdId, actorUserId, run);
    return run;
  }

  /**
   * Semantic validation the JSON schema cannot do (§11): every id must exist
   * in the allowed taxonomy. An unknown id rejects the whole result — no
   * silent category creation, no partial trust.
   */
  private validateResult(
    result: AiClusterClassification,
    taxonomy: AllowedTaxonomyEntry[],
  ): { ok: true } | { ok: false; reason: string } {
    const allowedIds = new Set(taxonomy.map((entry) => entry.id));
    if (result.categoryId && !allowedIds.has(result.categoryId)) {
      return { ok: false, reason: "UNKNOWN_CATEGORY_ID" };
    }
    if (result.subcategoryId && !allowedIds.has(result.subcategoryId)) {
      return { ok: false, reason: "UNKNOWN_SUBCATEGORY_ID" };
    }
    return { ok: true };
  }

  /**
   * Confidence routing (§12, §13): apply, suggest, or leave unknown.
   *
   * High-risk transaction types never auto-apply, whatever the confidence:
   * a proposal that changes economic meaning is a question for a person.
   */
  private async route(
    householdId: string,
    entry: EligibleCluster,
    result: AiClusterClassification,
    taxonomy: AllowedTaxonomyEntry[],
    combined: number,
  ): Promise<"APPLIED" | "SUGGESTED" | "UNKNOWN"> {
    const saysUnknown =
      result.transactionType === "UNKNOWN" &&
      !result.merchantCandidate &&
      !result.categoryId;
    if (saysUnknown || combined < SUGGEST_THRESHOLD) return "UNKNOWN";

    const highRisk = HIGH_RISK_TRANSACTION_TYPES.includes(result.transactionType);
    const hasSomethingToApply = !!result.merchantCandidate || !!result.categoryId;
    if (!hasSomethingToApply) return "UNKNOWN";

    if (combined >= AUTO_APPLY_THRESHOLD && !highRisk) {
      await this.apply(householdId, entry, result, taxonomy, combined);
      return "APPLIED";
    }

    await this.suggest(householdId, entry, result, combined);
    return "SUGGESTED";
  }

  /**
   * Auto-apply merchant/category as AI_MATCH (§14, §53). Merchant and
   * category only — never a financial event, never a USER_VERIFIED row, and
   * only while the cluster is still unresolved (idempotency, §23).
   */
  private async apply(
    householdId: string,
    entry: EligibleCluster,
    result: AiClusterClassification,
    taxonomy: AllowedTaxonomyEntry[],
    combined: number,
  ): Promise<void> {
    const db = getDb();
    const [current] = await db
      .select({ classificationSource: merchantClusters.classificationSource })
      .from(merchantClusters)
      .where(eq(merchantClusters.id, entry.row.id))
      .limit(1);
    if (!current || current.classificationSource !== "UNKNOWN") return;

    const categoryId =
      result.subcategoryId && taxonomy.some((c) => c.id === result.subcategoryId)
        ? result.subcategoryId
        : result.categoryId;
    const merchantId = result.merchantCandidate
      ? await this.ensureMerchant(householdId, result.merchantCandidate)
      : null;

    await db
      .update(merchantClusters)
      .set({
        ...(merchantId ? { merchantId } : {}),
        ...(categoryId ? { categoryId } : {}),
        merchantCandidate: result.merchantCandidate ?? entry.row.merchantCandidate,
        merchantConfidence: String(combined),
        classificationSource: "AI_MATCH",
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(merchantClusters.id, entry.row.id));

    const direction = entry.row.direction === "INFLOW" ? sql`>=` : sql`<`;
    await db
      .update(sourceTransactions)
      .set({
        ...(merchantId ? { merchantId } : {}),
        ...(categoryId ? { categoryId } : {}),
        classificationSource: "AI_MATCH",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sourceTransactions.householdId, householdId),
          eq(sourceTransactions.signature, entry.row.signature),
          sql`${sourceTransactions.amountMinor} ${direction} 0`,
          sql`${sourceTransactions.classificationSource} <> 'USER_VERIFIED'`,
        ),
      );
  }

  /**
   * Review suggestion (§24, §54): the cluster keeps its UNKNOWN source — the
   * question stays open — but the review card gains the AI's proposal via the
   * candidate fields and the persisted result row.
   */
  private async suggest(
    householdId: string,
    entry: EligibleCluster,
    result: AiClusterClassification,
    combined: number,
  ): Promise<void> {
    const db = getDb();
    if (!result.merchantCandidate) return;
    const existingConfidence = entry.row.merchantConfidence
      ? Number(entry.row.merchantConfidence)
      : 0;
    // Never downgrade a better deterministic candidate.
    if (entry.row.merchantCandidate && existingConfidence >= combined) return;
    await db
      .update(merchantClusters)
      .set({
        merchantCandidate: result.merchantCandidate,
        merchantConfidence: String(combined),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(merchantClusters.id, entry.row.id),
          eq(merchantClusters.classificationSource, "UNKNOWN"),
        ),
      );
  }

  /** Upsert one result row on the cache identity (§15, §23). */
  private async persistResult(
    householdId: string,
    entry: EligibleCluster,
    data: {
      taxonomyVersion: string;
      provider: string;
      model: string;
      inputHash: string;
      status: "APPLIED" | "SUGGESTED" | "UNKNOWN" | "REJECTED" | "ERROR";
      result: Record<string, unknown> | null;
      combinedConfidence: number | null;
      failureReason: string | null;
      usage: Record<string, number> | null;
      latencyMs: number | null;
    },
  ): Promise<void> {
    const db = getDb();
    const resultHash = sha256(JSON.stringify(data.result ?? {}));
    await db
      .insert(aiClassificationResults)
      .values({
        householdId,
        signature: entry.row.signature,
        signatureVersion: entry.row.signatureVersion,
        direction: entry.row.direction,
        taxonomyVersion: data.taxonomyVersion,
        promptVersion: TRANSACTION_CLASSIFIER_PROMPT_VERSION,
        schemaVersion: AI_CLASSIFICATION_SCHEMA_VERSION,
        provider: data.provider,
        model: data.model,
        inputHash: data.inputHash,
        resultHash,
        status: data.status,
        result: data.result,
        combinedConfidence:
          data.combinedConfidence != null ? String(data.combinedConfidence) : null,
        failureReason: data.failureReason,
        usage: data.usage,
        latencyMs: data.latencyMs,
      })
      .onConflictDoUpdate({
        target: [
          aiClassificationResults.householdId,
          aiClassificationResults.signature,
          aiClassificationResults.direction,
          aiClassificationResults.signatureVersion,
          aiClassificationResults.taxonomyVersion,
          aiClassificationResults.promptVersion,
          aiClassificationResults.model,
        ],
        set: {
          inputHash: data.inputHash,
          resultHash,
          status: data.status,
          result: data.result,
          combinedConfidence:
            data.combinedConfidence != null ? String(data.combinedConfidence) : null,
          failureReason: data.failureReason,
          usage: data.usage,
          latencyMs: data.latencyMs,
          updatedAt: new Date(),
        },
      });
  }

  /** Enablement + cost observability (§20, §50). */
  async status(userId: string, householdId: string): Promise<AiStatusResponse> {
    await this.access.requireMembership(userId, householdId);
    const config = this.config();
    const provider = this.provider();
    const householdEnabled = await this.householdEnabled(householdId);
    const db = getDb();

    const [metrics] = await db
      .select({
        clustersSent: sql<number>`count(*) filter (where ${aiClassificationResults.latencyMs} is not null)::int`,
        cacheHits: sql<number>`coalesce(sum(${aiClassificationResults.hitCount}), 0)::int`,
        failures: sql<number>`count(*) filter (where ${aiClassificationResults.status} = 'ERROR')::int`,
        promptTokens: sql<number>`coalesce(sum((${aiClassificationResults.usage}->>'promptTokens')::int), 0)::int`,
        completionTokens: sql<number>`coalesce(sum((${aiClassificationResults.usage}->>'completionTokens')::int), 0)::int`,
      })
      .from(aiClassificationResults)
      .where(eq(aiClassificationResults.householdId, householdId));

    const [requests] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.householdId, householdId),
          eq(auditLogs.action, "intelligence.ai.provider_call"),
        ),
      );

    const promptTokens = metrics?.promptTokens ?? 0;
    const completionTokens = metrics?.completionTokens ?? 0;

    return {
      householdId,
      envEnabled: config.enabled,
      householdEnabled,
      dryRunForced: config.dryRun,
      providerConfigured: provider.isConfigured(),
      externalCallsAllowed:
        config.enabled && !config.dryRun && householdEnabled && provider.isConfigured(),
      model: provider.isConfigured() ? provider.model : null,
      promptVersion: TRANSACTION_CLASSIFIER_PROMPT_VERSION,
      metrics: {
        clustersSent: metrics?.clustersSent ?? 0,
        requests: requests?.count ?? 0,
        cacheHits: metrics?.cacheHits ?? 0,
        failures: metrics?.failures ?? 0,
        promptTokens,
        completionTokens,
        estimatedCostText: estimateCostText(provider.model, promptTokens, completionTokens),
      },
    };
  }

  /** Latest suggestion rows for a set of signatures, for the review surface (§24). */
  async suggestionsBySignature(
    householdId: string,
    signatures: string[],
  ): Promise<Map<string, typeof aiClassificationResults.$inferSelect>> {
    if (signatures.length === 0) return new Map();
    const db = getDb();
    const rows = await db
      .select()
      .from(aiClassificationResults)
      .where(
        and(
          eq(aiClassificationResults.householdId, householdId),
          inArray(aiClassificationResults.signature, signatures),
          inArray(aiClassificationResults.status, ["SUGGESTED"]),
        ),
      )
      .orderBy(sql`${aiClassificationResults.updatedAt} desc`);
    const map = new Map<string, typeof aiClassificationResults.$inferSelect>();
    for (const row of rows) {
      const key = `${row.signature}|${row.direction}`;
      if (!map.has(key)) map.set(key, row);
    }
    return map;
  }

  private async ensureMerchant(
    householdId: string,
    canonicalName: string,
  ): Promise<string> {
    const db = getDb();
    const [existing] = await db
      .select({ id: merchants.id })
      .from(merchants)
      .where(
        and(
          eq(merchants.householdId, householdId),
          sql`lower(${merchants.canonicalName}) = lower(${canonicalName})`,
        ),
      )
      .limit(1);
    if (existing) return existing.id;
    const [created] = await db
      .insert(merchants)
      .values({
        householdId,
        canonicalName,
        confidence: "0.9",
        // AI proposed this; no person has confirmed it.
        userVerified: false,
      })
      .returning({ id: merchants.id });
    return created.id;
  }

  /** Counts, hashes and versions only — no cluster text in the audit log (§17). */
  private async auditProviderCall(
    householdId: string,
    actorUserId: string | null,
    after: Record<string, unknown>,
  ): Promise<void> {
    const db = getDb();
    await db.insert(auditLogs).values({
      householdId,
      actorUserId,
      action: "intelligence.ai.provider_call",
      entity: "household",
      entityId: householdId,
      after,
      source: "api",
    });
  }

  private async auditRun(
    householdId: string,
    actorUserId: string | null,
    run: AiClassificationRunReport,
  ): Promise<void> {
    const db = getDb();
    await db.insert(auditLogs).values({
      householdId,
      actorUserId,
      action: "intelligence.ai.classification_run",
      entity: "household",
      entityId: householdId,
      after: { ...run },
      source: "api",
    });
  }
}

function bump(
  run: AiClassificationRunReport,
  outcome: "APPLIED" | "SUGGESTED" | "UNKNOWN",
): void {
  if (outcome === "APPLIED") run.applied += 1;
  else if (outcome === "SUGGESTED") run.suggested += 1;
  else run.unknown += 1;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Rough cost estimate for the admin surface (§20). Prices drift; this is a
 * label, not a ledger entry, and unknown models return null rather than a
 * made-up figure.
 */
function estimateCostText(
  model: string,
  promptTokens: number,
  completionTokens: number,
): string | null {
  const pricesPerMillion: Record<string, { input: number; output: number }> = {
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "gpt-4o": { input: 2.5, output: 10 },
  };
  const price = pricesPerMillion[model];
  if (!price || (promptTokens === 0 && completionTokens === 0)) return null;
  const usd =
    (promptTokens / 1_000_000) * price.input +
    (completionTokens / 1_000_000) * price.output;
  return `~$${usd.toFixed(4)} (${model}, uppskattning)`;
}
