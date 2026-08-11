import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type {
  AiTransactionType,
  ClusterReviewItem,
  ClusterReviewResponse,
  ResolveClusterInput,
  ResolveClusterResponse,
} from "@ffos/schemas";
import { AiClassificationService } from "../ai/classification/ai-classification.service";
import { getDb } from "../db/client";
import { auditLogs, households } from "../db/schema";
import {
  categories,
  classificationRules,
  merchantClusters,
  merchants,
  sourceTransactions,
} from "../db/schema-economic";
import { HouseholdAccessService } from "../households/household-access.service";

/**
 * Needs Review at the cluster level, and the rules a household teaches the
 * system by answering.
 *
 * A review item here is not a row in a queue table: it *is* an unresolved
 * cluster. That inherits the cluster's idempotency — re-running analysis
 * updates the cluster in place, so it cannot duplicate a review item — and it
 * keeps the count honest: 217 unknown transactions in 6 clusters are 6
 * questions, not 217.
 *
 * Resolving a review touches merchant and category only. It never writes a
 * financial event or a ledger posting, so the ledger, net worth and every
 * accounting invariant are exactly as before.
 */
@Injectable()
export class ClassificationReviewService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(AiClassificationService)
    private readonly aiClassification: AiClassificationService,
  ) {}

  /** The open questions: unresolved clusters, largest first. */
  async list(userId: string, householdId: string): Promise<ClusterReviewResponse> {
    await this.access.requireMembership(userId, householdId);
    const db = getDb();

    const [rows, [household]] = await Promise.all([
      db
        .select()
        .from(merchantClusters)
        .where(
          and(
            eq(merchantClusters.householdId, householdId),
            eq(merchantClusters.classificationSource, "UNKNOWN"),
            isNull(merchantClusters.dismissedAt),
          ),
        )
        .orderBy(desc(merchantClusters.transactionCount)),
      db
        .select({ baseCurrency: households.baseCurrency })
        .from(households)
        .where(eq(households.id, householdId))
        .limit(1),
    ]);
    const currency = household?.baseCurrency ?? "SEK";

    // Total spend/income per cluster, one grouped query rather than one per row.
    const signatures = rows.map((row) => row.signature);
    const totals = signatures.length
      ? await db
          .select({
            signature: sourceTransactions.signature,
            isInflow: sql<boolean>`${sourceTransactions.amountMinor} >= 0`,
            total: sql<string>`sum(abs(${sourceTransactions.amountMinor}))::text`,
          })
          .from(sourceTransactions)
          .where(
            and(
              eq(sourceTransactions.householdId, householdId),
              inArray(sourceTransactions.signature, signatures),
            ),
          )
          .groupBy(
            sourceTransactions.signature,
            sql`${sourceTransactions.amountMinor} >= 0`,
          )
      : [];
    const totalByKey = new Map(
      totals.map((row) => [`${row.signature}|${row.isInflow ? "INFLOW" : "OUTFLOW"}`, row.total]),
    );

    /*
     * AI suggestions for these clusters (§24): a SUGGESTED result attaches to
     * the review card so a person sees "Vi tror att detta är …" with the AI
     * label — never applied silently, always theirs to accept or correct.
     */
    const aiSuggestions = await this.aiClassification.suggestionsBySignature(
      householdId,
      signatures,
    );

    const aiCategoryIds = [...aiSuggestions.values()]
      .map((row) => (row.result as { categoryId?: string | null } | null)?.categoryId)
      .filter((id): id is string => !!id);
    const categoryIds = [
      ...rows.map((row) => row.categoryId).filter((id): id is string => id !== null),
      ...aiCategoryIds,
    ];
    const categoryRows = categoryIds.length
      ? await db
          .select({ id: categories.id, name: categories.name })
          .from(categories)
          .where(inArray(categories.id, categoryIds))
      : [];
    const categoryNameById = new Map(categoryRows.map((row) => [row.id, row.name]));

    const items: ClusterReviewItem[] = rows.map((row) => {
      const confidence = row.merchantConfidence
        ? Number(row.merchantConfidence)
        : null;
      const aiRow = aiSuggestions.get(`${row.signature}|${row.direction}`);
      const aiResult = aiRow?.result as
        | {
            merchantCandidate?: string | null;
            merchantConfidence?: number;
            categoryId?: string | null;
            transactionType?: string;
            shortExplanation?: string;
          }
        | null
        | undefined;
      const aiSuggestion =
        aiRow && aiResult
          ? {
              merchantCandidate: aiResult.merchantCandidate ?? null,
              merchantConfidence: aiResult.merchantConfidence ?? null,
              categoryId: aiResult.categoryId ?? null,
              categoryName: aiResult.categoryId
                ? (categoryNameById.get(aiResult.categoryId) ?? null)
                : null,
              transactionType: (aiResult.transactionType ?? null) as
                | AiTransactionType
                | null,
              confidence: Number(aiRow.combinedConfidence ?? 0),
              shortExplanation: aiResult.shortExplanation ?? "",
              source: "AI_SUGGESTION" as const,
              createdAt: aiRow.updatedAt.toISOString(),
            }
          : null;
      const reviewType = !row.merchantCandidate
        ? ("UNKNOWN_MERCHANT" as const)
        : row.categoryId
          ? ("LOW_CLASSIFICATION_CONFIDENCE" as const)
          : confidence !== null && confidence >= 0.8
            ? ("UNKNOWN_CATEGORY" as const)
            : ("LOW_CLASSIFICATION_CONFIDENCE" as const);

      const explanation = row.opaque
        ? "Beskrivningen är bara ett referensnummer, så det finns inget som identifierar mottagaren. Systemet gissar aldrig i det läget."
        : row.merchantCandidate
          ? `Vi tror att detta är ${row.merchantCandidate}, men bevisen räcker inte för att tillämpa det automatiskt.`
          : "Ingen känd merchant eller regel matchar texten i det här mönstret.";

      return {
        id: row.id,
        reviewType,
        status: "OPEN" as const,
        representativeDescription: row.representativeDescriptions[0] ?? row.signature,
        exampleDescriptions: row.representativeDescriptions.slice(0, 5),
        transactionCount: row.transactionCount,
        firstSeen: row.firstSeen,
        lastSeen: row.lastSeen,
        direction: row.direction === "INFLOW" ? ("INFLOW" as const) : ("OUTFLOW" as const),
        medianAmountMinor: row.medianAmountMinor?.toString() ?? null,
        minAmountMinor: row.minAmountMinor?.toString() ?? null,
        maxAmountMinor: row.maxAmountMinor?.toString() ?? null,
        totalAmountMinor: totalByKey.get(`${row.signature}|${row.direction}`) ?? null,
        currency,
        merchantCandidate: row.merchantCandidate,
        categoryCandidateId: row.categoryId,
        categoryCandidateName: row.categoryId
          ? (categoryNameById.get(row.categoryId) ?? null)
          : null,
        confidence,
        classificationSource: row.classificationSource,
        explanation,
        aiSuggestion,
      };
    });

    return { total: items.length, items };
  }

  /**
   * Answer one cluster's question.
   *
   * `accept` takes the system's candidate as-is, `correct` takes the user's
   * merchant/category, `skip` dismisses. Accept and correct apply to every
   * compatible transaction in the cluster — that is "Använd på liknande"; the
   * affected count is shown to the user beforehand as `transactionCount`.
   */
  async resolve(
    userId: string,
    input: ResolveClusterInput,
  ): Promise<ResolveClusterResponse> {
    await this.access.requireCanWrite(userId, input.householdId);
    const db = getDb();

    const [cluster] = await db
      .select()
      .from(merchantClusters)
      .where(
        and(
          eq(merchantClusters.id, input.clusterId),
          eq(merchantClusters.householdId, input.householdId),
        ),
      )
      .limit(1);
    if (!cluster) throw new NotFoundException("Klustret finns inte i hushållet.");

    if (input.action === "skip") {
      await db
        .update(merchantClusters)
        .set({ dismissedAt: new Date(), updatedAt: new Date() })
        .where(eq(merchantClusters.id, cluster.id));
      await this.audit(userId, input.householdId, "intelligence.review.skipped", {
        clusterId: cluster.id,
        transactionCount: cluster.transactionCount,
      });
      return {
        status: "DISMISSED",
        transactionsUpdated: 0,
        ruleCreated: false,
        remainingReviewCount: await this.openCount(input.householdId),
      };
    }

    // What the resolution actually is: candidate on accept, user's answer on correct.
    const merchantName =
      input.action === "accept"
        ? (cluster.merchantCandidate ?? undefined)
        : input.merchantName;
    const categoryId =
      input.action === "accept"
        ? (input.categoryId ?? cluster.categoryId ?? undefined)
        : input.categoryId;

    let merchantId = input.action === "correct" ? input.merchantId : undefined;
    if (!merchantId && !merchantName && !categoryId) {
      throw new BadRequestException(
        "Ange en merchant eller en kategori för att lösa granskningen.",
      );
    }

    if (merchantId) {
      const [existing] = await db
        .select({ id: merchants.id })
        .from(merchants)
        .where(
          and(
            eq(merchants.id, merchantId),
            eq(merchants.householdId, input.householdId),
          ),
        )
        .limit(1);
      if (!existing) throw new NotFoundException("Merchanten finns inte i hushållet.");
    } else if (merchantName) {
      merchantId = await this.ensureVerifiedMerchant(input.householdId, merchantName);
    }

    if (categoryId) {
      const [category] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.id, categoryId),
            sql`(${categories.householdId} = ${input.householdId} or ${categories.householdId} is null)`,
          ),
        )
        .limit(1);
      if (!category) throw new NotFoundException("Kategorin finns inte.");
    }

    /*
     * Apply to the cluster's transactions: same signature, same direction,
     * never over an existing user-verified row. Merchant and category only —
     * this writes no financial event and no posting.
     */
    const direction = cluster.direction === "INFLOW" ? sql`>=` : sql`<`;
    const updated = await db
      .update(sourceTransactions)
      .set({
        ...(merchantId ? { merchantId } : {}),
        ...(categoryId ? { categoryId } : {}),
        classificationSource: "USER_VERIFIED",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sourceTransactions.householdId, input.householdId),
          eq(sourceTransactions.signature, cluster.signature),
          sql`${sourceTransactions.amountMinor} ${direction} 0`,
        ),
      )
      .returning({ id: sourceTransactions.id });

    await db
      .update(merchantClusters)
      .set({
        ...(merchantId ? { merchantId } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(merchantName ? { merchantCandidate: merchantName } : {}),
        merchantConfidence: "1",
        classificationSource: "USER_VERIFIED",
        resolvedAt: new Date(),
        dismissedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(merchantClusters.id, cluster.id));

    /*
     * "Kom ihåg detta för framtiden": persist the answer as a household rule so
     * the next analysis — and the next import — resolves this signature without
     * asking again. One rule per (household, type, signature); saving the same
     * correction twice updates rather than duplicates.
     */
    let ruleCreated = false;
    if (input.rememberRule) {
      await db
        .insert(classificationRules)
        .values({
          householdId: input.householdId,
          ruleType: "EXACT_SIGNATURE",
          matchValue: cluster.signature,
          merchantId: merchantId ?? null,
          categoryId: categoryId ?? null,
          createdByUserId: userId,
          userVerified: true,
          enabled: true,
        })
        .onConflictDoUpdate({
          target: [
            classificationRules.householdId,
            classificationRules.ruleType,
            classificationRules.matchValue,
          ],
          set: {
            merchantId: merchantId ?? null,
            categoryId: categoryId ?? null,
            enabled: true,
            userVerified: true,
            version: sql`${classificationRules.version} + 1`,
            updatedAt: new Date(),
          },
        });
      ruleCreated = true;
    }

    await this.audit(
      userId,
      input.householdId,
      input.action === "accept"
        ? "intelligence.review.accepted"
        : "intelligence.review.corrected",
      {
        clusterId: cluster.id,
        merchantId: merchantId ?? null,
        categoryId: categoryId ?? null,
        transactionsUpdated: updated.length,
        ruleCreated,
      },
    );

    return {
      status: "RESOLVED",
      transactionsUpdated: updated.length,
      ruleCreated,
      remainingReviewCount: await this.openCount(input.householdId),
    };
  }

  /** The rules this household has taught the system. */
  async listRules(userId: string, householdId: string) {
    await this.access.requireMembership(userId, householdId);
    const db = getDb();
    const rows = await db
      .select({
        rule: classificationRules,
        merchantName: merchants.canonicalName,
        categoryName: categories.name,
      })
      .from(classificationRules)
      .leftJoin(merchants, eq(classificationRules.merchantId, merchants.id))
      .leftJoin(categories, eq(classificationRules.categoryId, categories.id))
      .where(eq(classificationRules.householdId, householdId))
      .orderBy(desc(classificationRules.createdAt));

    return {
      total: rows.length,
      items: rows.map(({ rule, merchantName, categoryName }) => ({
        id: rule.id,
        ruleType: rule.ruleType,
        matchValue: rule.matchValue,
        merchantId: rule.merchantId,
        merchantName: merchantName ?? null,
        categoryId: rule.categoryId,
        categoryName: categoryName ?? null,
        userVerified: rule.userVerified,
        enabled: rule.enabled,
        matchCount: rule.matchCount,
        lastMatchedAt: rule.lastMatchedAt?.toISOString() ?? null,
        createdAt: rule.createdAt.toISOString(),
      })),
    };
  }

  /** Turn a rule off (or on again) without losing its history. */
  async setRuleEnabled(
    userId: string,
    householdId: string,
    ruleId: string,
    enabled: boolean,
  ) {
    await this.access.requireCanWrite(userId, householdId);
    const db = getDb();
    const [updated] = await db
      .update(classificationRules)
      .set({ enabled, updatedAt: new Date() })
      .where(
        and(
          eq(classificationRules.id, ruleId),
          eq(classificationRules.householdId, householdId),
        ),
      )
      .returning({ id: classificationRules.id });
    if (!updated) throw new NotFoundException("Regeln finns inte i hushållet.");
    await this.audit(
      userId,
      householdId,
      enabled ? "intelligence.rule.enabled" : "intelligence.rule.disabled",
      { ruleId },
    );
    return this.listRules(userId, householdId);
  }

  /** Remove a rule the household no longer wants. */
  async deleteRule(userId: string, householdId: string, ruleId: string) {
    await this.access.requireCanWrite(userId, householdId);
    const db = getDb();
    const [deleted] = await db
      .delete(classificationRules)
      .where(
        and(
          eq(classificationRules.id, ruleId),
          eq(classificationRules.householdId, householdId),
        ),
      )
      .returning({ id: classificationRules.id });
    if (!deleted) throw new NotFoundException("Regeln finns inte i hushållet.");
    await this.audit(userId, householdId, "intelligence.rule.deleted", { ruleId });
    return this.listRules(userId, householdId);
  }

  private async openCount(householdId: string): Promise<number> {
    const db = getDb();
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(merchantClusters)
      .where(
        and(
          eq(merchantClusters.householdId, householdId),
          eq(merchantClusters.classificationSource, "UNKNOWN"),
          isNull(merchantClusters.dismissedAt),
        ),
      );
    return row?.count ?? 0;
  }

  /**
   * The merchant the user named, reused case-insensitively or created verified.
   * Verified because a person chose it — unlike the candidate engine's rows.
   */
  private async ensureVerifiedMerchant(
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
    if (existing) {
      await db
        .update(merchants)
        .set({ userVerified: true, updatedAt: new Date() })
        .where(eq(merchants.id, existing.id));
      return existing.id;
    }
    const [created] = await db
      .insert(merchants)
      .values({
        householdId,
        canonicalName,
        confidence: "1",
        userVerified: true,
      })
      .returning({ id: merchants.id });
    return created.id;
  }

  /** Counts and ids only: raw bank text must not reach the audit log. */
  private async audit(
    userId: string,
    householdId: string,
    action: string,
    after: Record<string, unknown>,
  ) {
    const db = getDb();
    await db.insert(auditLogs).values({
      householdId,
      actorUserId: userId,
      action,
      entity: "merchant_cluster",
      entityId: (after.clusterId as string) ?? (after.ruleId as string) ?? householdId,
      after,
      source: "api",
    });
  }
}
