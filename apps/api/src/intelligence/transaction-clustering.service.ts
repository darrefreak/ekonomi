import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import {
  detectRecurrence,
  inferMerchantCandidate,
  matchMerchant,
  medianMinor,
  shouldAutoAccept,
  transactionSignature,
  type MerchantCandidate,
  type MerchantRecord,
} from "@ffos/financial-engine";
import { getDb } from "../db/client";
import { auditLogs } from "../db/schema";
import {
  categories,
  merchantClusters,
  merchants,
  sourceTransactions,
} from "../db/schema-economic";
import { HouseholdAccessService } from "../households/household-access.service";

/**
 * Groups a household's transactions and resolves what it can, deterministically.
 *
 * Until this existed the signature engine was a pure function nothing called: an
 * imported statement produced 8 184 transactions with no merchant, no category and
 * no grouping, and the previous acceptance run reported "100 % classified" only
 * because the probe itself had assigned categories with raw SQL.
 *
 * Nothing here is a guess dressed as an answer. A transaction whose merchant cannot
 * be resolved is recorded as UNKNOWN, and the coverage figures say so.
 */

/**
 * The signature algorithm's version.
 *
 * Bumped when the algorithm changes meaning. Stored per transaction and per
 * cluster so a stale signature is distinguishable from a current one, and so a
 * recomputation can be targeted rather than global.
 */
export const SIGNATURE_VERSION = "sig-1.0.0";

/** How many example descriptions a cluster keeps for the review surface. */
const REPRESENTATIVE_SAMPLE = 4;
/** Rows per write batch. Large enough to be quick, small enough to stay bounded. */
const WRITE_BATCH = 500;

export type ClusteringResult = {
  transactionsConsidered: number;
  uniqueSignatures: number;
  clusters: number;
  opaqueClusters: number;
  merchantResolved: number;
  coverage: ClassificationCoverage;
  durationMs: number;
};

/**
 * What "classified" actually means, broken out.
 *
 * Reported separately on purpose: a single percentage hides the difference between
 * a transaction the system understood and one it filed under a fallback.
 */
export type ClassificationCoverage = {
  total: number;
  userVerified: number;
  deterministicMatch: number;
  learnedRule: number;
  aiMatch: number;
  defaulted: number;
  unknown: number;
  /** Understood by some means, excluding defaults. */
  meaningfullyClassified: number;
  meaningfullyClassifiedPercent: number;
};

@Injectable()
export class TransactionClusteringService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
  ) {}

  /**
   * Assign signatures, build clusters, and resolve merchants where the evidence
   * allows.
   *
   * Idempotent: re-running updates the same clusters rather than creating a second
   * set, because the cluster identity is (household, signature, version).
   */
  async analyse(userId: string, householdId: string): Promise<ClusteringResult> {
    await this.access.requireMembership(userId, householdId);
    const started = Date.now();
    const db = getDb();

    // One query for the transactions, one for the merchants. Everything after this
    // is in memory, so the cost does not grow with a per-row lookup.
    const [transactions, merchantRows] = await Promise.all([
      db
        .select({
          id: sourceTransactions.id,
          rawDescription: sourceTransactions.rawDescription,
          description: sourceTransactions.description,
          amountMinor: sourceTransactions.amountMinor,
          bookingDate: sourceTransactions.bookingDate,
          merchantId: sourceTransactions.merchantId,
          categoryId: sourceTransactions.categoryId,
          classificationSource: sourceTransactions.classificationSource,
        })
        .from(sourceTransactions)
        .where(eq(sourceTransactions.householdId, householdId)),
      db
        .select({
          id: merchants.id,
          canonicalName: merchants.canonicalName,
          aliases: merchants.aliases,
          userVerified: merchants.userVerified,
        })
        .from(merchants)
        .where(eq(merchants.householdId, householdId)),
    ]);

    /*
     * The household's own taxonomy. A candidate proposes a category *key*; only an
     * id that already exists may be stored, so a rule can never invent a category.
     */
    const categoryRows = await db
      .select({ id: categories.id, key: categories.key })
      .from(categories)
      .where(
        sql`${categories.householdId} = ${householdId} or ${categories.householdId} is null`,
      );
    const categoryIdByKey = new Map(categoryRows.map((row) => [row.key, row.id]));

    const merchantRecords: MerchantRecord[] = merchantRows.map((row) => ({
      id: row.id,
      canonicalName: row.canonicalName,
      aliases: row.aliases ?? [],
      userVerified: row.userVerified,
    }));

    type Bucket = {
      signature: string;
      opaque: boolean;
      descriptions: string[];
      amounts: bigint[];
      dates: string[];
      transactionIds: string[];
      inflow: number;
      outflow: number;
    };

    /*
     * Direction is part of the grouping key.
     *
     * A refund from a shop and a purchase at the same shop share a description but
     * not an economic meaning, and averaging them would produce a cluster whose
     * median amount describes neither.
     */
    const buckets = new Map<string, Bucket>();
    const signatureByTransaction = new Map<string, string>();

    for (const transaction of transactions) {
      const raw = transaction.rawDescription ?? transaction.description ?? "";
      const signature = transactionSignature(raw);
      const direction = transaction.amountMinor >= 0n ? "IN" : "OUT";
      const key = `${signature.key}|${direction}`;
      signatureByTransaction.set(transaction.id, signature.key);

      const bucket =
        buckets.get(key) ??
        {
          signature: signature.key,
          opaque: signature.opaque,
          descriptions: [],
          amounts: [],
          dates: [],
          transactionIds: [],
          inflow: 0,
          outflow: 0,
        };
      if (bucket.descriptions.length < REPRESENTATIVE_SAMPLE && raw.trim()) {
        // Distinct examples only: four copies of one string teaches nobody anything.
        if (!bucket.descriptions.includes(raw.trim())) bucket.descriptions.push(raw.trim());
      }
      const magnitude =
        transaction.amountMinor < 0n ? -transaction.amountMinor : transaction.amountMinor;
      bucket.amounts.push(magnitude);
      bucket.dates.push(transaction.bookingDate);
      bucket.transactionIds.push(transaction.id);
      if (direction === "IN") bucket.inflow += 1;
      else bucket.outflow += 1;
      buckets.set(key, bucket);
    }

    // Write signatures back, in batches rather than per row.
    const signatureUpdates = [...signatureByTransaction.entries()];
    for (let start = 0; start < signatureUpdates.length; start += WRITE_BATCH) {
      const chunk = signatureUpdates.slice(start, start + WRITE_BATCH);
      await db.transaction(async (tx) => {
        for (const [transactionId, signature] of chunk) {
          await tx
            .update(sourceTransactions)
            .set({ signature, signatureVersion: SIGNATURE_VERSION })
            .where(eq(sourceTransactions.id, transactionId));
        }
      });
    }

    let merchantResolved = 0;
    let opaqueClusters = 0;

    for (const bucket of buckets.values()) {
      if (bucket.opaque) opaqueClusters += 1;

      const sortedDates = [...bucket.dates].sort();
      const recurrence = detectRecurrence(
        bucket.dates.map((date, index) => ({
          date,
          amountMinor: bucket.amounts[index]!,
        })),
      );

      /*
       * Merchant resolution reuses the existing matcher, which refuses to fuzzy
       * merge. An opaque cluster is never matched: a bare reference number carries
       * no evidence, and matching one to a merchant would be inventing a
       * relationship.
       */
      const example = bucket.descriptions[0] ?? "";
      const match =
        bucket.opaque || !example
          ? null
          : matchMerchant(example, merchantRecords).match;

      /*
       * When the household has no merchant to match against — which is every
       * freshly imported statement — fall back to the system rule catalogue. This
       * is the link whose absence made the last acceptance report 0 % classified:
       * clustering worked, but there was nothing to compare a cluster to.
       */
      const tokens = transactionSignature(example).tokens;
      const candidate: MerchantCandidate | null = match
        ? {
            merchant: match.canonicalName,
            categoryKey: null,
            confidence: match.confidence,
            source: "USER_VERIFIED",
            subscriptionLikely: false,
            evidence: "Matchar en merchant hushållet redan har.",
          }
        : inferMerchantCandidate({
            tokens,
            opaque: bucket.opaque,
            transactionCount: bucket.transactionIds.length,
          });

      /*
       * A candidate becomes a stored merchant only when it is confident enough to
       * apply without asking. Below that it stays a suggestion on the cluster and
       * the household is asked, which is the difference between classifying and
       * guessing.
       */
      let resolvedMerchantId: string | null = match?.merchantId ?? null;
      if (!resolvedMerchantId && candidate && shouldAutoAccept(candidate)) {
        resolvedMerchantId = await this.ensureMerchant(householdId, candidate.merchant);
      }
      if (resolvedMerchantId) merchantResolved += 1;

      const candidateCategoryId =
        candidate?.categoryKey && shouldAutoAccept(candidate)
          ? (categoryIdByKey.get(candidate.categoryKey) ?? null)
          : null;

      await db
        .insert(merchantClusters)
        .values({
          householdId,
          signature: bucket.signature,
          signatureVersion: SIGNATURE_VERSION,
          representativeDescriptions: bucket.descriptions,
          transactionCount: bucket.transactionIds.length,
          firstSeen: sortedDates[0] ?? null,
          lastSeen: sortedDates[sortedDates.length - 1] ?? null,
          medianAmountMinor: medianMinor(bucket.amounts),
          minAmountMinor: bucket.amounts.reduce((min, v) => (v < min ? v : min), bucket.amounts[0] ?? 0n),
          maxAmountMinor: bucket.amounts.reduce((max, v) => (v > max ? v : max), bucket.amounts[0] ?? 0n),
          direction: bucket.inflow > bucket.outflow ? "INFLOW" : "OUTFLOW",
          medianIntervalDays: recurrence.medianIntervalDays,
          intervalSpreadDays: recurrence.intervalSpreadDays,
          merchantId: resolvedMerchantId,
          merchantCandidate: candidate?.merchant ?? null,
          merchantConfidence: candidate ? String(candidate.confidence) : null,
          categoryId: candidateCategoryId,
          classificationSource: resolvedMerchantId ? "DETERMINISTIC_MATCH" : "UNKNOWN",
          opaque: bucket.opaque,
          updatedAt: new Date(),
        })
        // Same signature and version means the same cluster, so a re-run updates.
        .onConflictDoUpdate({
          target: [
            merchantClusters.householdId,
            merchantClusters.signature,
            merchantClusters.signatureVersion,
          ],
          set: {
            representativeDescriptions: bucket.descriptions,
            transactionCount: bucket.transactionIds.length,
            firstSeen: sortedDates[0] ?? null,
            lastSeen: sortedDates[sortedDates.length - 1] ?? null,
            medianAmountMinor: medianMinor(bucket.amounts),
            medianIntervalDays: recurrence.medianIntervalDays,
            intervalSpreadDays: recurrence.intervalSpreadDays,
            merchantId: resolvedMerchantId,
            merchantCandidate: candidate?.merchant ?? null,
            merchantConfidence: candidate ? String(candidate.confidence) : null,
            categoryId: candidateCategoryId,
            classificationSource: resolvedMerchantId ? "DETERMINISTIC_MATCH" : "UNKNOWN",
            updatedAt: new Date(),
          },
        });

      /*
       * Apply a resolved merchant to its transactions, but never over a
       * user-verified classification. Rule precedence starts with the household's
       * own decision, and a re-run must not quietly undo one.
       */
      if (resolvedMerchantId) {
        for (let start = 0; start < bucket.transactionIds.length; start += WRITE_BATCH) {
          const chunk = bucket.transactionIds.slice(start, start + WRITE_BATCH);
          await db
            .update(sourceTransactions)
            .set({
              merchantId: resolvedMerchantId,
              ...(candidateCategoryId ? { categoryId: candidateCategoryId } : {}),
              classificationSource: "DETERMINISTIC_MATCH",
            })
            .where(
              and(
                eq(sourceTransactions.householdId, householdId),
                sql`${sourceTransactions.id} = any(array[${sql.join(
                  chunk.map((id) => sql`${id}::uuid`),
                  sql`, `,
                )}])`,
                sql`${sourceTransactions.classificationSource} <> 'USER_VERIFIED'`,
              ),
            );
        }
      }
    }

    const coverage = await this.coverage(householdId);

    await db.insert(auditLogs).values({
      householdId,
      actorUserId: userId,
      action: "intelligence.clustering.run",
      entity: "household",
      entityId: householdId,
      // Counts only: a raw bank description must not reach the audit log.
      after: {
        signatureVersion: SIGNATURE_VERSION,
        transactions: transactions.length,
        clusters: buckets.size,
        merchantResolved,
      },
      source: "api",
    });

    return {
      transactionsConsidered: transactions.length,
      uniqueSignatures: new Set([...signatureByTransaction.values()]).size,
      clusters: buckets.size,
      opaqueClusters,
      merchantResolved,
      coverage,
      durationMs: Date.now() - started,
    };
  }

  /**
   * How much of the household's history the system actually understands.
   *
   * Deliberately not one percentage. A transaction filed under a fallback category
   * is counted as defaulted, not as classified, because the alternative is the
   * meaningless 100 % the previous acceptance reported.
   */
  async coverage(householdId: string): Promise<ClassificationCoverage> {
    const db = getDb();
    const rows = await db
      .select({
        source: sourceTransactions.classificationSource,
        count: sql<number>`count(*)::int`,
      })
      .from(sourceTransactions)
      .where(eq(sourceTransactions.householdId, householdId))
      .groupBy(sourceTransactions.classificationSource);

    const bySource = new Map(rows.map((row) => [row.source, row.count]));
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    const userVerified = bySource.get("USER_VERIFIED") ?? 0;
    const deterministicMatch = bySource.get("DETERMINISTIC_MATCH") ?? 0;
    const learnedRule = bySource.get("LEARNED_RULE") ?? 0;
    const aiMatch = bySource.get("AI_MATCH") ?? 0;
    const defaulted = bySource.get("DEFAULTED") ?? 0;
    const unknown = bySource.get("UNKNOWN") ?? 0;
    const meaningful = userVerified + deterministicMatch + learnedRule + aiMatch;

    return {
      total,
      userVerified,
      deterministicMatch,
      learnedRule,
      aiMatch,
      defaulted,
      unknown,
      meaningfullyClassified: meaningful,
      meaningfullyClassifiedPercent:
        total === 0 ? 0 : Math.round((meaningful / total) * 1000) / 10,
    };
  }

  /**
   * The merchant row for a canonical name, created once.
   *
   * Confidence is recorded as the rule's, not as certainty, and `userVerified`
   * stays false: the system proposed this, the household has not confirmed it.
   */
  private async ensureMerchant(householdId: string, canonicalName: string): Promise<string> {
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
        userVerified: false,
      })
      .returning({ id: merchants.id });
    return created.id;
  }

  /** Clusters a person still has to answer for, largest first. */
  async unresolvedClusters(userId: string, householdId: string, limit = 50) {
    await this.access.requireMembership(userId, householdId);
    const db = getDb();
    const rows = await db
      .select()
      .from(merchantClusters)
      .where(
        and(
          eq(merchantClusters.householdId, householdId),
          eq(merchantClusters.classificationSource, "UNKNOWN"),
        ),
      )
      .orderBy(sql`${merchantClusters.transactionCount} desc`)
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      signature: row.signature,
      descriptions: row.representativeDescriptions,
      transactionCount: row.transactionCount,
      firstSeen: row.firstSeen,
      lastSeen: row.lastSeen,
      medianAmountMinor: row.medianAmountMinor?.toString() ?? null,
      direction: row.direction,
      medianIntervalDays: row.medianIntervalDays,
      opaque: row.opaque,
    }));
  }
}
