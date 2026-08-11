import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  classifyRecurringKind,
  detectPriceChanges,
  detectRecurrence,
  isSubscriptionKind,
  normaliseRecurringCost,
  projectNextOccurrence,
  robustVolatilityBps,
  type RecurrenceDetection,
  type RecurrenceFrequency,
  type RecurringKind,
  type RecurringOccurrence,
} from "@ffos/financial-engine";
import { getDb } from "../db/client";
import { auditLogs, households } from "../db/schema";
import {
  categories,
  merchantClusters,
  merchants,
  sourceTransactions,
} from "../db/schema-economic";
import {
  expectedTransactions,
  recurringItems,
  type StoredPriceChange,
} from "../db/schema-planning";
import { HouseholdAccessService } from "../households/household-access.service";
import { resolveHouseholdAsOf } from "../common/as-of";
import { SIGNATURE_VERSION } from "./transaction-clustering.service";

/**
 * Recurring streams, subscriptions, price intelligence and expected
 * transactions — persisted from clusters, deterministically, with no AI.
 *
 * The recurrence engine (`packages/financial-engine/src/intelligence/recurring.ts`)
 * already knows how to detect cadence, classify a stream's kind, find price
 * regimes and project the next occurrence. This service is the wiring the
 * engine never had: clusters in, `recurring_items` and `expected_transactions`
 * rows out, and the household's own corrections respected on every rerun.
 *
 * Nothing here writes a financial event, a posting or a balance. Expected
 * transactions are forecasts; when the real transaction arrives it is matched,
 * never duplicated.
 */

/** Bumped when the detection semantics change meaning. */
export const RECURRING_DETECTION_VERSION = "rec-1.0.0";

/** Engine frequency → persisted cadence. EVERY_4_WEEKS is 13 payments a year, not 12. */
const CADENCE_BY_FREQUENCY: Partial<Record<RecurrenceFrequency, CadenceValue>> = {
  WEEKLY: "WEEKLY",
  BIWEEKLY: "BIWEEKLY",
  FOUR_WEEKLY: "EVERY_4_WEEKS",
  MONTHLY: "MONTHLY",
  QUARTERLY: "QUARTERLY",
  SEMIANNUAL: "SEMIANNUAL",
  ANNUAL: "ANNUAL",
  VARIABLE: "VARIABLE_RECURRING",
};

type CadenceValue =
  | "WEEKLY"
  | "BIWEEKLY"
  | "EVERY_4_WEEKS"
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMIANNUAL"
  | "ANNUAL"
  | "VARIABLE_RECURRING"
  | "YEARLY";

/** Persisted cadence → engine frequency, for annualisation and projection. */
export function frequencyOfCadence(cadence: string): RecurrenceFrequency {
  switch (cadence) {
    case "WEEKLY":
      return "WEEKLY";
    case "BIWEEKLY":
      return "BIWEEKLY";
    case "EVERY_4_WEEKS":
      return "FOUR_WEEKLY";
    case "MONTHLY":
      return "MONTHLY";
    case "QUARTERLY":
      return "QUARTERLY";
    case "SEMIANNUAL":
      return "SEMIANNUAL";
    case "ANNUAL":
    case "YEARLY":
      return "ANNUAL";
    case "VARIABLE_RECURRING":
      return "VARIABLE";
    default:
      return "NONE";
  }
}

/** Cadences with a dependable schedule, i.e. projectable. */
const FIXED_CADENCES = new Set<string>([
  "WEEKLY",
  "BIWEEKLY",
  "EVERY_4_WEEKS",
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "ANNUAL",
]);

/** Kinds whose amounts vary by nature — never a "price increase" alert (§16). */
const VARIABLE_PRICE_KINDS = new Set<string>(["UTILITY_BILL", "VARIABLE_RECURRING"]);

/** Below this the stream is a review question, not a fact. Engine scale 0–100. */
const AUTO_ACTIVE_CONFIDENCE = 60;
/** Streams weaker than this are not persisted at all. */
const MINIMUM_PERSIST_CONFIDENCE = 40;
/** Grace days after the expected window before an item counts as missing. */
const MISSING_GRACE_DAYS = 3;
/** How long after the window a late arrival can still fulfil the expectation. */
const LATE_MATCH_DAYS = 45;
/** Minimum confidence (0–1 stored scale) before a missing warning is raised. */
const MISSING_MIN_CONFIDENCE = 0.7;

export type RecurringPipelineResult = {
  clustersConsidered: number;
  recurringStreams: number;
  subscriptions: number;
  recurringExpense: number;
  recurringIncome: number;
  priceChangesDetected: number;
  expectedGenerated: number;
  expectedMatched: number;
  missingExpected: number;
  reviewItems: number;
};

type StreamComputation = {
  signature: string;
  clusterId: string;
  direction: "INFLOW" | "OUTFLOW";
  name: string;
  merchantId: string | null;
  categoryId: string | null;
  cadence: CadenceValue;
  recurringType: RecurringKind | "UNKNOWN_RECURRING";
  isSubscription: boolean;
  confidence: number;
  detection: RecurrenceDetection;
  minAmountMinor: bigint | null;
  maxAmountMinor: bigint | null;
  currentAmountMinor: bigint;
  priceChanges: StoredPriceChange[];
  originalAmountMinor: bigint | null;
  annualPriceImpactMinor: bigint | null;
  amountStable: boolean;
  evidence: string[];
};

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

@Injectable()
export class RecurringIntelligenceService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
  ) {}

  /**
   * The full deterministic pipeline: detect → persist → subscriptions →
   * price intelligence → expected transactions → matching → missing.
   *
   * Idempotent end to end: identity is (household, signature, direction) for
   * streams and (stream, window start) for expectations, so a rerun updates
   * rather than duplicates.
   */
  async runPipeline(householdId: string, asOf?: string): Promise<RecurringPipelineResult> {
    const resolvedAsOf = await resolveHouseholdAsOf(householdId, asOf);
    const detect = await this.detectAndPersistStreams(householdId);
    const expected = await this.generateExpectedTransactions(householdId);
    const matched = await this.matchExpectedTransactions(householdId);
    const missing = await this.detectMissingExpected(householdId, resolvedAsOf);
    return {
      ...detect,
      expectedGenerated: expected.generated,
      expectedMatched: matched.matched,
      missingExpected: missing.missing,
    };
  }

  /**
   * Detect recurrence per cluster and persist the streams.
   *
   * Clusters are the input, not raw descriptions: a stream's evidence is the
   * cluster's dated amounts in one direction. An UNKNOWN cluster is still
   * eligible — an unnamed charge arriving every 28 days is a real stream, it
   * is just `UNKNOWN_RECURRING` until someone names it (§42).
   */
  async detectAndPersistStreams(
    householdId: string,
  ): Promise<Omit<RecurringPipelineResult, "expectedGenerated" | "expectedMatched" | "missingExpected">> {
    const db = getDb();

    const [clusters, transactions, categoryRows, [household]] = await Promise.all([
      db
        .select({
          id: merchantClusters.id,
          signature: merchantClusters.signature,
          direction: merchantClusters.direction,
          representativeDescriptions: merchantClusters.representativeDescriptions,
          merchantId: merchantClusters.merchantId,
          merchantCandidate: merchantClusters.merchantCandidate,
          categoryId: merchantClusters.categoryId,
          classificationSource: merchantClusters.classificationSource,
        })
        .from(merchantClusters)
        .where(
          and(
            eq(merchantClusters.householdId, householdId),
            eq(merchantClusters.signatureVersion, SIGNATURE_VERSION),
          ),
        ),
      db
        .select({
          id: sourceTransactions.id,
          signature: sourceTransactions.signature,
          amountMinor: sourceTransactions.amountMinor,
          bookingDate: sourceTransactions.bookingDate,
        })
        .from(sourceTransactions)
        .where(
          and(
            eq(sourceTransactions.householdId, householdId),
            isNotNull(sourceTransactions.signature),
            eq(sourceTransactions.isExcluded, false),
          ),
        ),
      db
        .select({ id: categories.id, key: categories.key })
        .from(categories)
        .where(
          sql`${categories.householdId} = ${householdId} or ${categories.householdId} is null`,
        ),
      db
        .select({ baseCurrency: households.baseCurrency })
        .from(households)
        .where(eq(households.id, householdId))
        .limit(1),
    ]);
    const currency = household?.baseCurrency ?? "SEK";
    const categoryKeyById = new Map(categoryRows.map((row) => [row.id, row.key]));

    const merchantIds = clusters
      .map((cluster) => cluster.merchantId)
      .filter((id): id is string => id !== null);
    const merchantRows = merchantIds.length
      ? await db
          .select({ id: merchants.id, canonicalName: merchants.canonicalName })
          .from(merchants)
          .where(inArray(merchants.id, merchantIds))
      : [];
    const merchantNameById = new Map(merchantRows.map((row) => [row.id, row.canonicalName]));

    // Occurrences per (signature, direction), sorted by date once.
    const occurrencesByKey = new Map<string, RecurringOccurrence[]>();
    for (const transaction of transactions) {
      if (!transaction.signature) continue;
      const direction = transaction.amountMinor >= 0n ? "INFLOW" : "OUTFLOW";
      const key = `${transaction.signature}|${direction}`;
      const list = occurrencesByKey.get(key) ?? [];
      list.push({ date: transaction.bookingDate, amountMinor: transaction.amountMinor });
      occurrencesByKey.set(key, list);
    }

    // Existing detected streams: the household's answers must survive the rerun.
    const existingRows = await db
      .select()
      .from(recurringItems)
      .where(
        and(
          eq(recurringItems.householdId, householdId),
          isNotNull(recurringItems.signature),
        ),
      );
    const existingByIdentity = new Map(
      existingRows.map((row) => [`${row.signature}|${row.direction}`, row]),
    );

    const computed: StreamComputation[] = [];
    for (const cluster of clusters) {
      const direction = cluster.direction === "INFLOW" ? "INFLOW" : "OUTFLOW";
      const occurrences = occurrencesByKey.get(`${cluster.signature}|${direction}`) ?? [];
      if (occurrences.length < 3) continue;

      const detection = detectRecurrence(occurrences);
      if (detection.frequency === "NONE") continue;
      if (detection.confidence < MINIMUM_PERSIST_CONFIDENCE) continue;

      const cadence = CADENCE_BY_FREQUENCY[detection.frequency];
      if (!cadence) continue;

      const merchantName = cluster.merchantId
        ? (merchantNameById.get(cluster.merchantId) ?? null)
        : null;
      const categoryKey = cluster.categoryId
        ? (categoryKeyById.get(cluster.categoryId) ?? null)
        : null;

      /*
       * The semantic haystack: everything deterministic the pipeline already
       * knows about this cluster. Merchant truth first, then the household's
       * category, then the raw examples. No AI (§9).
       */
      const label = [
        merchantName ?? cluster.merchantCandidate ?? "",
        categoryKey ?? "",
        ...(cluster.representativeDescriptions ?? []).slice(0, 2),
      ]
        .join(" ")
        .trim();

      /*
       * The current price regime matters more than the whole history: a stream
       * mid-transition (179 → 199 → 219) is volatile across its history but
       * perfectly stable at its current price, and it is the current price a
       * subscription surface describes.
       */
      const magnitudes = [...occurrences]
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map((occurrence) =>
          occurrence.amountMinor < 0n ? -occurrence.amountMinor : occurrence.amountMinor,
        );
      const recentVolatility = robustVolatilityBps(magnitudes.slice(-4));
      const amountStable =
        detection.amountStable || (recentVolatility !== null && recentVolatility <= 500);

      const classified = classifyRecurringKind({
        signatureLabel: label,
        frequency: detection.frequency,
        direction,
        amountStable,
      });
      /*
       * A guessed kind on an unclassified cluster is not knowledge. When no
       * keyword matched and nobody has named the merchant, the honest answer
       * is UNKNOWN_RECURRING: the cadence is real, the kind is not known (§42).
       */
      const recurringType: RecurringKind | "UNKNOWN_RECURRING" =
        classified.matched || cluster.classificationSource !== "UNKNOWN"
          ? classified.kind
          : "UNKNOWN_RECURRING";

      /*
       * Subscription = subscription-shaped kind + fixed schedule + stable
       * price. Utilities, mortgages and insurance are recurring bills, not
       * subscriptions (§10). VARIABLE and ANNUAL streams are never
       * subscriptions by detection — only a person can say otherwise.
       */
      const isSubscription =
        recurringType !== "UNKNOWN_RECURRING" &&
        isSubscriptionKind(classified.kind) &&
        amountStable &&
        FIXED_CADENCES.has(cadence) &&
        cadence !== "ANNUAL" &&
        cadence !== "SEMIANNUAL";

      /*
       * Price intelligence only for streams whose price is supposed to be a
       * price. A varying electricity bill produces no "price increase" — its
       * variation is seasonality, not a regime change (§16).
       */
      const priceEligible =
        detection.frequency !== "VARIABLE" && !VARIABLE_PRICE_KINDS.has(recurringType);
      const priceResult = priceEligible
        ? detectPriceChanges({ occurrences, frequency: detection.frequency })
        : null;
      const priceChanges: StoredPriceChange[] = (priceResult?.changes ?? []).map(
        (change) => ({
          fromMinor: change.fromMinor.toString(),
          toMinor: change.toMinor.toString(),
          changedOn: change.changedOn,
          differenceMinor: change.differenceMinor.toString(),
          percentChange: change.percentChange,
        }),
      );

      const currentAmountMinor =
        priceResult?.currentMinor ?? detection.medianAmountMinor ?? 0n;

      computed.push({
        signature: cluster.signature,
        clusterId: cluster.id,
        direction,
        name: (merchantName ??
          cluster.merchantCandidate ??
          cluster.representativeDescriptions?.[0] ??
          cluster.signature
        ).slice(0, 160),
        merchantId: cluster.merchantId,
        categoryId: cluster.categoryId,
        cadence,
        recurringType,
        isSubscription,
        confidence: detection.confidence,
        detection,
        minAmountMinor:
          magnitudes.length > 0
            ? magnitudes.reduce((min, v) => (v < min ? v : min))
            : null,
        maxAmountMinor:
          magnitudes.length > 0
            ? magnitudes.reduce((max, v) => (v > max ? v : max))
            : null,
        currentAmountMinor,
        priceChanges,
        originalAmountMinor: priceResult?.originalMinor ?? null,
        annualPriceImpactMinor:
          priceChanges.length > 0 ? (priceResult?.annualImpactMinor ?? null) : null,
        amountStable,
        evidence: detection.reasons,
      });
    }

    // Persist: update the same stream, never a duplicate (§12).
    let priceChangesDetected = 0;
    const detectedIdentities = new Set<string>();
    for (const stream of computed) {
      const identity = `${stream.signature}|${stream.direction}`;
      detectedIdentities.add(identity);
      priceChangesDetected += stream.priceChanges.length;
      const existing = existingByIdentity.get(identity);

      /*
       * The household's decision outranks the detector (§11, §36):
       * a DISMISSED stream stays dismissed, a CONFIRMED stream stays
       * confirmed, and an explicit subscription answer overrides detection.
       */
      const status = existing?.userVerified
        ? existing.status
        : stream.confidence >= AUTO_ACTIVE_CONFIDENCE
          ? (existing?.status === "CONFIRMED" ? "CONFIRMED" : "DETECTED")
          : "DETECTED";
      const isSubscription =
        existing?.userMarkedSubscription != null
          ? existing.userMarkedSubscription
          : stream.isSubscription;

      const detectorFields = {
        name: existing?.userVerified ? existing.name : stream.name,
        kind: stream.direction === "INFLOW" ? "income" : "expense",
        cadence: stream.cadence,
        amountMinor: stream.currentAmountMinor,
        currency,
        categoryId: stream.categoryId,
        merchantId: stream.merchantId,
        status,
        lastSeenOn: stream.detection.lastSeen,
        confidence: (stream.confidence / 100).toFixed(4),
        clusterId: stream.clusterId,
        signatureVersion: SIGNATURE_VERSION,
        recurringType: stream.recurringType,
        isSubscription,
        occurrenceCount: stream.detection.occurrences,
        firstSeenOn: stream.detection.firstSeen,
        medianAmountMinor: stream.detection.medianAmountMinor,
        minAmountMinor: stream.minAmountMinor,
        maxAmountMinor: stream.maxAmountMinor,
        amountVolatilityBps: stream.detection.amountVolatilityBps,
        medianIntervalDays: stream.detection.medianIntervalDays,
        intervalSpreadDays: stream.detection.intervalSpreadDays,
        amountStable: stream.amountStable,
        priceChanges: stream.priceChanges,
        originalAmountMinor: stream.originalAmountMinor,
        annualPriceImpactMinor: stream.annualPriceImpactMinor,
        evidence: stream.evidence,
        detectionVersion: RECURRING_DETECTION_VERSION,
        updatedAt: new Date(),
      };

      if (existing) {
        await db
          .update(recurringItems)
          .set(detectorFields)
          .where(eq(recurringItems.id, existing.id));
      } else {
        await db.insert(recurringItems).values({
          householdId,
          signature: stream.signature,
          direction: stream.direction,
          firstDetectedAt: new Date(),
          ...detectorFields,
        });
      }
    }

    /*
     * Streams the detector no longer finds: paused, not deleted, so the
     * history and any user verification survive. A user-confirmed stream is
     * left alone — absence of new data is not strong evidence against it.
     */
    const staleIds = existingRows
      .filter(
        (row) =>
          !detectedIdentities.has(`${row.signature}|${row.direction}`) &&
          !row.userVerified &&
          row.status !== "PAUSED",
      )
      .map((row) => row.id);
    if (staleIds.length > 0) {
      await db
        .update(recurringItems)
        .set({ status: "PAUSED", updatedAt: new Date() })
        .where(inArray(recurringItems.id, staleIds));
      await db
        .delete(expectedTransactions)
        .where(
          and(
            eq(expectedTransactions.householdId, householdId),
            inArray(expectedTransactions.recurringItemId, staleIds),
            eq(expectedTransactions.status, "PENDING"),
          ),
        );
    }

    /*
     * Mark the members of fixed-cadence streams as recurring on the
     * transaction row. Merchant/category/flag only — no financial event, no
     * posting, no balance is touched.
     */
    const fixedSignaturesBySign = computed.filter(
      (stream) => stream.detection.frequency !== "VARIABLE",
    );
    for (const stream of fixedSignaturesBySign) {
      const sign = stream.direction === "INFLOW" ? sql`>=` : sql`<`;
      await db
        .update(sourceTransactions)
        .set({ isRecurring: true })
        .where(
          and(
            eq(sourceTransactions.householdId, householdId),
            eq(sourceTransactions.signature, stream.signature),
            sql`${sourceTransactions.amountMinor} ${sign} 0`,
            eq(sourceTransactions.isRecurring, false),
          ),
        );
    }

    const active = computed.filter((stream) => {
      const existing = existingByIdentity.get(`${stream.signature}|${stream.direction}`);
      return !(existing?.userVerified && existing.status === "DISMISSED");
    });
    const subscriptions = active.filter((stream) => {
      const existing = existingByIdentity.get(`${stream.signature}|${stream.direction}`);
      return existing?.userMarkedSubscription != null
        ? existing.userMarkedSubscription
        : stream.isSubscription;
    }).length;

    return {
      clustersConsidered: clusters.length,
      recurringStreams: active.length,
      subscriptions,
      recurringExpense: active.filter((s) => s.direction === "OUTFLOW").length,
      recurringIncome: active.filter((s) => s.direction === "INFLOW").length,
      priceChangesDetected,
      reviewItems: active.filter(
        (s) =>
          s.confidence < AUTO_ACTIVE_CONFIDENCE &&
          !existingByIdentity.get(`${s.signature}|${s.direction}`)?.userVerified,
      ).length,
    };
  }

  /**
   * Re-derive semantic type and subscription flag for persisted streams.
   *
   * Exists as its own operation because merchant/category truth improves after
   * detection — a learned rule naming a merchant should upgrade
   * UNKNOWN_RECURRING without a full re-detection.
   */
  async refreshSubscriptions(householdId: string): Promise<{ updated: number }> {
    const db = getDb();
    const rows = await db
      .select({
        item: recurringItems,
        merchantName: merchants.canonicalName,
        categoryKey: categories.key,
      })
      .from(recurringItems)
      .leftJoin(merchants, eq(recurringItems.merchantId, merchants.id))
      .leftJoin(categories, eq(recurringItems.categoryId, categories.id))
      .where(
        and(
          eq(recurringItems.householdId, householdId),
          isNotNull(recurringItems.signature),
        ),
      );

    let updated = 0;
    for (const { item, merchantName, categoryKey } of rows) {
      const frequency = frequencyOfCadence(item.cadence);
      const direction = item.direction === "INFLOW" ? "INFLOW" : "OUTFLOW";
      const classified = classifyRecurringKind({
        signatureLabel: [merchantName ?? "", categoryKey ?? "", item.name].join(" "),
        frequency,
        direction,
        amountStable: item.amountStable,
      });
      const recurringType =
        classified.matched || merchantName ? classified.kind : "UNKNOWN_RECURRING";
      const isSubscription =
        item.userMarkedSubscription != null
          ? item.userMarkedSubscription
          : recurringType !== "UNKNOWN_RECURRING" &&
            isSubscriptionKind(classified.kind) &&
            item.amountStable &&
            FIXED_CADENCES.has(item.cadence) &&
            item.cadence !== "ANNUAL" &&
            item.cadence !== "SEMIANNUAL";

      if (item.recurringType === recurringType && item.isSubscription === isSubscription) {
        continue;
      }
      await db
        .update(recurringItems)
        .set({ recurringType, isSubscription, updatedAt: new Date() })
        .where(eq(recurringItems.id, item.id));
      updated += 1;
    }
    return { updated };
  }

  /**
   * Recompute price history for stable-price streams from their transactions.
   */
  async refreshPriceIntelligence(
    householdId: string,
  ): Promise<{ streams: number; changes: number }> {
    const db = getDb();
    const rows = await db
      .select()
      .from(recurringItems)
      .where(
        and(
          eq(recurringItems.householdId, householdId),
          isNotNull(recurringItems.signature),
        ),
      );

    let streams = 0;
    let changes = 0;
    for (const item of rows) {
      const frequency = frequencyOfCadence(item.cadence);
      if (frequency === "VARIABLE" || frequency === "NONE") continue;
      if (item.recurringType && VARIABLE_PRICE_KINDS.has(item.recurringType)) continue;

      const occurrences = await this.occurrencesForStream(householdId, item);
      if (occurrences.length < 2) continue;
      const result = detectPriceChanges({ occurrences, frequency });
      const stored: StoredPriceChange[] = result.changes.map((change) => ({
        fromMinor: change.fromMinor.toString(),
        toMinor: change.toMinor.toString(),
        changedOn: change.changedOn,
        differenceMinor: change.differenceMinor.toString(),
        percentChange: change.percentChange,
      }));
      streams += 1;
      changes += stored.length;
      await db
        .update(recurringItems)
        .set({
          priceChanges: stored,
          originalAmountMinor: result.originalMinor,
          annualPriceImpactMinor: stored.length > 0 ? result.annualImpactMinor : null,
          amountMinor: result.currentMinor ?? item.amountMinor,
          updatedAt: new Date(),
        })
        .where(eq(recurringItems.id, item.id));
    }
    return { streams, changes };
  }

  /**
   * Project the next occurrence per active confident stream (§17–§20).
   *
   * Windows, not points: the honest answer to "when is the next charge" is a
   * date range and an amount range. Identity (stream, window start) makes the
   * rerun an update; FULFILLED and MISSED rows are history and never touched.
   */
  async generateExpectedTransactions(
    householdId: string,
  ): Promise<{ generated: number; active: number }> {
    const db = getDb();
    const streams = await db
      .select()
      .from(recurringItems)
      .where(
        and(
          eq(recurringItems.householdId, householdId),
          isNotNull(recurringItems.signature),
          inArray(recurringItems.status, ["DETECTED", "CONFIRMED"]),
        ),
      );

    let generated = 0;
    let active = 0;
    for (const stream of streams) {
      if (!FIXED_CADENCES.has(stream.cadence)) continue;
      active += 1;

      const occurrences = await this.occurrencesForStream(householdId, stream);
      if (occurrences.length < 3) continue;
      const detection = detectRecurrence(occurrences);
      /*
       * A user-confirmed stream projects even when the detector's own score
       * is borderline: the household said it is real. Detection still has to
       * find a usable schedule, or there is nothing to project from.
       */
      const minimumConfidence = stream.userVerified && stream.status === "CONFIRMED" ? 40 : 60;
      const projection = projectNextOccurrence({
        detection,
        occurrences,
        minimumConfidence,
      });
      if (!projection) continue;

      /*
       * One open window per stream: a rerun with new data moves the window,
       * so any PENDING row at a different start date is superseded.
       */
      await db
        .delete(expectedTransactions)
        .where(
          and(
            eq(expectedTransactions.recurringItemId, stream.id),
            eq(expectedTransactions.status, "PENDING"),
            sql`${expectedTransactions.expectedFrom} <> ${projection.earliestDate}`,
          ),
        );

      await db
        .insert(expectedTransactions)
        .values({
          householdId,
          recurringItemId: stream.id,
          expectedFrom: projection.earliestDate,
          expectedTo: projection.latestDate,
          expectedAmountMinor: projection.expectedAmountMinor,
          expectedLowMinor: projection.lowAmountMinor,
          expectedHighMinor: projection.highAmountMinor,
          currency: stream.currency,
          direction: stream.direction,
          confidence: (projection.confidence / 100).toFixed(4),
          status: "PENDING",
          generatedAt: new Date(),
          modelVersion: RECURRING_DETECTION_VERSION,
        })
        .onConflictDoUpdate({
          target: [
            expectedTransactions.recurringItemId,
            expectedTransactions.expectedFrom,
          ],
          /*
           * Refresh a PENDING window in place. A FULFILLED or MISSED row at
           * the same start date keeps its status — matching owns those
           * transitions, not generation.
           */
          set: {
            expectedTo: projection.latestDate,
            expectedAmountMinor: projection.expectedAmountMinor,
            expectedLowMinor: projection.lowAmountMinor,
            expectedHighMinor: projection.highAmountMinor,
            confidence: (projection.confidence / 100).toFixed(4),
            generatedAt: new Date(),
            modelVersion: RECURRING_DETECTION_VERSION,
            updatedAt: new Date(),
          },
        });
      generated += 1;

      await db
        .update(recurringItems)
        .set({ nextExpectedOn: projection.earliestDate, updatedAt: new Date() })
        .where(eq(recurringItems.id, stream.id));
    }
    return { generated, active };
  }

  /**
   * Match actual imported transactions to open expectations (§22, §24).
   *
   * Evidence for a match: same signature cluster, right direction, inside the
   * date window (with grace), inside the amount range (±10 %). A late arrival
   * resolves a MISSED warning rather than leaving it stale. One transaction
   * fulfils at most one expectation, and the actual data is never duplicated.
   */
  async matchExpectedTransactions(
    householdId: string,
  ): Promise<{ matched: number; lateResolved: number }> {
    const db = getDb();
    const open = await db
      .select({
        expectation: expectedTransactions,
        signature: recurringItems.signature,
      })
      .from(expectedTransactions)
      .innerJoin(
        recurringItems,
        eq(expectedTransactions.recurringItemId, recurringItems.id),
      )
      .where(
        and(
          eq(expectedTransactions.householdId, householdId),
          inArray(expectedTransactions.status, ["PENDING", "MISSED"]),
        ),
      )
      .orderBy(asc(expectedTransactions.expectedFrom));
    if (open.length === 0) return { matched: 0, lateResolved: 0 };

    // Transactions already consumed by an expectation must not fulfil another.
    const used = new Set(
      (
        await db
          .select({ matchedTransactionId: expectedTransactions.matchedTransactionId })
          .from(expectedTransactions)
          .where(
            and(
              eq(expectedTransactions.householdId, householdId),
              isNotNull(expectedTransactions.matchedTransactionId),
            ),
          )
      ).map((row) => row.matchedTransactionId as string),
    );

    let matched = 0;
    let lateResolved = 0;
    for (const { expectation, signature } of open) {
      if (!signature) continue;
      const from = addDays(expectation.expectedFrom, -MISSING_GRACE_DAYS);
      const to = addDays(expectation.expectedTo, LATE_MATCH_DAYS);
      const sign = expectation.direction === "INFLOW" ? sql`>=` : sql`<`;
      const low = (expectation.expectedLowMinor * 90n) / 100n;
      const high = (expectation.expectedHighMinor * 110n) / 100n;

      const candidates = await db
        .select({
          id: sourceTransactions.id,
          bookingDate: sourceTransactions.bookingDate,
          amountMinor: sourceTransactions.amountMinor,
        })
        .from(sourceTransactions)
        .where(
          and(
            eq(sourceTransactions.householdId, householdId),
            eq(sourceTransactions.signature, signature),
            sql`${sourceTransactions.amountMinor} ${sign} 0`,
            sql`${sourceTransactions.bookingDate} >= ${from}`,
            sql`${sourceTransactions.bookingDate} <= ${to}`,
          ),
        )
        .orderBy(asc(sourceTransactions.bookingDate));

      const hit = candidates.find((candidate) => {
        if (used.has(candidate.id)) return false;
        const magnitude =
          candidate.amountMinor < 0n ? -candidate.amountMinor : candidate.amountMinor;
        return magnitude >= low && magnitude <= high;
      });
      if (!hit) continue;

      used.add(hit.id);
      if (expectation.status === "MISSED") lateResolved += 1;
      matched += 1;
      await db
        .update(expectedTransactions)
        .set({
          status: "FULFILLED",
          matchedTransactionId: hit.id,
          matchedOn: hit.bookingDate,
          updatedAt: new Date(),
        })
        .where(eq(expectedTransactions.id, expectation.id));
    }
    return { matched, lateResolved };
  }

  /**
   * Mark confidently-expected items whose window has fully passed (§23).
   *
   * Conservative on purpose: only after the window plus grace days, and only
   * for streams that were confident. No alarm on the due date itself.
   */
  async detectMissingExpected(
    householdId: string,
    asOf: string,
  ): Promise<{ missing: number }> {
    const db = getDb();
    const deadline = addDays(asOf, -MISSING_GRACE_DAYS);
    const rows = await db
      .update(expectedTransactions)
      .set({ status: "MISSED", missedNotedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(expectedTransactions.householdId, householdId),
          eq(expectedTransactions.status, "PENDING"),
          sql`${expectedTransactions.expectedTo} < ${deadline}`,
          sql`${expectedTransactions.confidence} >= ${MISSING_MIN_CONFIDENCE}`,
        ),
      )
      .returning({ id: expectedTransactions.id });
    return { missing: rows.length };
  }

  /* ---------------------------------------------------------------- reads */

  /**
   * The recurring overview: every stream grouped by what it is, with monthly
   * equivalents and annualised values, price-increase insights and the
   * stream-level review queue.
   */
  async overview(userId: string, householdId: string) {
    await this.access.requireMembership(userId, householdId);
    const db = getDb();
    const asOf = await resolveHouseholdAsOf(householdId);

    const rows = await db
      .select({
        item: recurringItems,
        merchantName: merchants.canonicalName,
      })
      .from(recurringItems)
      .leftJoin(merchants, eq(recurringItems.merchantId, merchants.id))
      .where(eq(recurringItems.householdId, householdId))
      .orderBy(asc(recurringItems.name));

    const streams = rows.map(({ item, merchantName }) => {
      const frequency = frequencyOfCadence(item.cadence);
      const normalised = normaliseRecurringCost({
        amountMinor: item.amountMinor,
        frequency,
      });
      const lastChange = item.priceChanges[item.priceChanges.length - 1] ?? null;
      return {
        id: item.id,
        name: item.name,
        merchantName: merchantName ?? null,
        detected: item.signature !== null,
        direction: item.direction === "INFLOW" ? ("INFLOW" as const) : ("OUTFLOW" as const),
        cadence: item.cadence,
        recurringType: item.recurringType ?? "UNKNOWN_RECURRING",
        isSubscription: item.isSubscription,
        userMarkedSubscription: item.userMarkedSubscription,
        status: item.status,
        userVerified: item.userVerified,
        confidence: item.confidence ? Number(item.confidence) : null,
        occurrenceCount: item.occurrenceCount,
        firstSeenOn: item.firstSeenOn,
        lastSeenOn: item.lastSeenOn,
        nextExpectedOn: item.nextExpectedOn,
        currentAmountMinor: item.amountMinor.toString(),
        medianAmountMinor: item.medianAmountMinor?.toString() ?? null,
        minAmountMinor: item.minAmountMinor?.toString() ?? null,
        maxAmountMinor: item.maxAmountMinor?.toString() ?? null,
        amountStable: item.amountStable,
        monthlyEquivalentMinor: normalised.monthlyMinor?.toString() ?? null,
        annualMinor: normalised.annualMinor?.toString() ?? null,
        currency: item.currency,
        priceChanges: item.priceChanges,
        originalAmountMinor: item.originalAmountMinor?.toString() ?? null,
        annualPriceImpactMinor: item.annualPriceImpactMinor?.toString() ?? null,
        evidence: item.evidence,
        medianIntervalDays: item.medianIntervalDays,
        intervalSpreadDays: item.intervalSpreadDays,
        group: groupOfStream({
          direction: item.direction,
          recurringType: item.recurringType,
          isSubscription: item.isSubscription,
        }),
      };
    });

    const activeStreams = streams.filter(
      (stream) => stream.status === "DETECTED" || stream.status === "CONFIRMED",
    );
    const sumMonthly = (list: typeof streams) =>
      list.reduce(
        (acc, stream) =>
          acc + (stream.monthlyEquivalentMinor ? BigInt(stream.monthlyEquivalentMinor) : 0n),
        0n,
      );
    const sumAnnual = (list: typeof streams) =>
      list.reduce(
        (acc, stream) => acc + (stream.annualMinor ? BigInt(stream.annualMinor) : 0n),
        0n,
      );

    const expenses = activeStreams.filter((stream) => stream.direction === "OUTFLOW");
    const income = activeStreams.filter((stream) => stream.direction === "INFLOW");
    const subscriptions = activeStreams.filter((stream) => stream.isSubscription);

    /*
     * Price-increase insights: material regime changes observed in the last
     * twelve months, stable-price streams only. The annualised sum uses each
     * change's own difference and the stream's own cadence — exact money.
     */
    let increasedStreams = 0;
    let annualIncreaseMinor = 0n;
    const priceInsightItems: Array<{
      id: string;
      name: string;
      fromMinor: string;
      toMinor: string;
      changedOn: string;
      annualImpactMinor: string;
      percentChange: number | null;
    }> = [];
    const twelveMonthsAgo = addDays(asOf, -365);
    for (const stream of activeStreams) {
      const recent = stream.priceChanges.filter(
        (change) => change.changedOn >= twelveMonthsAgo && BigInt(change.differenceMinor) > 0n,
      );
      if (recent.length === 0) continue;
      increasedStreams += 1;
      for (const change of recent) {
        const difference = BigInt(change.differenceMinor);
        const annualised = normaliseRecurringCost({
          amountMinor: difference,
          frequency: frequencyOfCadence(stream.cadence),
        }).annualMinor;
        if (annualised !== null) annualIncreaseMinor += annualised;
        priceInsightItems.push({
          id: stream.id,
          name: stream.name,
          fromMinor: change.fromMinor,
          toMinor: change.toMinor,
          changedOn: change.changedOn,
          annualImpactMinor: (annualised ?? 0n).toString(),
          percentChange: change.percentChange,
        });
      }
    }

    /*
     * Stream-level review (§35): uncertain recurrence is a question, not a
     * fact. Derived from stream state, so it inherits the stream's
     * idempotency — a rerun cannot duplicate a question.
     */
    type ReviewItem = {
      recurringId: string;
      reviewType:
        | "POSSIBLE_RECURRING"
        | "POSSIBLE_SUBSCRIPTION"
        | "UNCERTAIN_CADENCE"
        | "PRICE_CHANGE_UNCERTAIN";
      name: string;
      cadence: string;
      confidence: number;
      occurrenceCount: number;
      medianAmountMinor: string | null;
      currency: string;
      question: string;
    };
    const review = streams
      .filter(
        (stream) =>
          stream.detected &&
          !stream.userVerified &&
          (stream.status === "DETECTED" || stream.status === "PAUSED"),
      )
      .flatMap((stream): ReviewItem[] => {
        const confidence = stream.confidence ?? 0;
        if (stream.status === "DETECTED" && confidence < 0.6) {
          return [
            {
              recurringId: stream.id,
              reviewType:
                stream.cadence === "VARIABLE_RECURRING"
                  ? ("UNCERTAIN_CADENCE" as const)
                  : ("POSSIBLE_RECURRING" as const),
              name: stream.name,
              cadence: stream.cadence,
              confidence,
              occurrenceCount: stream.occurrenceCount,
              medianAmountMinor: stream.medianAmountMinor,
              currency: stream.currency,
              question:
                stream.cadence === "VARIABLE_RECURRING"
                  ? `${stream.name} återkommer ofta men utan fast schema. Är det en återkommande kostnad?`
                  : `${stream.name} ser ut att återkomma (${stream.occurrenceCount} förekomster). Stämmer det?`,
            },
          ];
        }
        if (
          stream.status === "DETECTED" &&
          confidence >= 0.6 &&
          !stream.isSubscription &&
          stream.userMarkedSubscription === null &&
          stream.recurringType === "SUBSCRIPTION"
        ) {
          return [
            {
              recurringId: stream.id,
              reviewType: "POSSIBLE_SUBSCRIPTION" as const,
              name: stream.name,
              cadence: stream.cadence,
              confidence,
              occurrenceCount: stream.occurrenceCount,
              medianAmountMinor: stream.medianAmountMinor,
              currency: stream.currency,
              question: `${stream.name} liknar ett abonnemang men beloppet varierar. Är det ett abonnemang?`,
            },
          ];
        }
        return [];
      });

    return {
      asOf,
      totals: {
        recurringExpensesMonthlyMinor: sumMonthly(expenses).toString(),
        recurringExpensesAnnualMinor: sumAnnual(expenses).toString(),
        recurringIncomeMonthlyMinor: sumMonthly(income).toString(),
        recurringIncomeAnnualMinor: sumAnnual(income).toString(),
        subscriptionsMonthlyMinor: sumMonthly(subscriptions).toString(),
        subscriptionsAnnualMinor: sumAnnual(subscriptions).toString(),
        /** Streams whose cadence has no fixed period; excluded from the sums above. */
        variableStreamsExcluded: activeStreams.filter(
          (stream) => stream.monthlyEquivalentMinor === null,
        ).length,
      },
      counts: {
        streams: activeStreams.length,
        subscriptions: subscriptions.length,
        expenseStreams: expenses.length,
        incomeStreams: income.length,
        reviewItems: review.length,
      },
      priceInsights: {
        increasedStreams,
        annualIncreaseMinor: annualIncreaseMinor.toString(),
        items: priceInsightItems,
      },
      groups: groupStreams(streams),
      review,
    };
  }

  /** Upcoming expected windows and unresolved missing-expected notices. */
  async expectedUpcoming(userId: string, householdId: string) {
    await this.access.requireMembership(userId, householdId);
    const db = getDb();
    const asOf = await resolveHouseholdAsOf(householdId);

    const rows = await db
      .select({
        expectation: expectedTransactions,
        name: recurringItems.name,
        recurringType: recurringItems.recurringType,
        isSubscription: recurringItems.isSubscription,
      })
      .from(expectedTransactions)
      .innerJoin(
        recurringItems,
        eq(expectedTransactions.recurringItemId, recurringItems.id),
      )
      .where(eq(expectedTransactions.householdId, householdId))
      .orderBy(asc(expectedTransactions.expectedFrom));

    const toItem = (row: (typeof rows)[number]) => ({
      id: row.expectation.id,
      recurringItemId: row.expectation.recurringItemId,
      name: row.name,
      recurringType: row.recurringType ?? "UNKNOWN_RECURRING",
      isSubscription: row.isSubscription,
      expectedFrom: row.expectation.expectedFrom,
      expectedTo: row.expectation.expectedTo,
      expectedAmountMinor: row.expectation.expectedAmountMinor.toString(),
      expectedLowMinor: row.expectation.expectedLowMinor.toString(),
      expectedHighMinor: row.expectation.expectedHighMinor.toString(),
      currency: row.expectation.currency,
      direction:
        row.expectation.direction === "INFLOW"
          ? ("INFLOW" as const)
          : ("OUTFLOW" as const),
      confidence: row.expectation.confidence ? Number(row.expectation.confidence) : null,
      status: row.expectation.status,
      matchedOn: row.expectation.matchedOn,
    });

    const upcoming = rows
      .filter(
        (row) => row.expectation.status === "PENDING" && row.expectation.expectedTo >= asOf,
      )
      .map(toItem)
      .slice(0, 30);
    const missing = rows
      .filter((row) => row.expectation.status === "MISSED")
      .map((row) => ({
        ...toItem(row),
        message:
          row.expectation.direction === "INFLOW"
            ? `Förväntad ${row.recurringType === "SALARY" ? "lön" : "inkomst"} (${row.name}) har inte identifierats ännu.`
            : `Förväntad betalning (${row.name}) har inte identifierats ännu.`,
      }));
    const recentlyFulfilled = rows
      .filter(
        (row) =>
          row.expectation.status === "FULFILLED" &&
          row.expectation.matchedOn !== null &&
          row.expectation.matchedOn >= addDays(asOf, -35),
      )
      .map(toItem)
      .slice(-10);

    return { asOf, upcoming, missing, recentlyFulfilled };
  }

  /**
   * The household's answer about a stream (§11): recurring or not, and
   * subscription or not. The answer is persisted, audited, and outranks the
   * detector on every later rerun.
   */
  async verify(
    userId: string,
    input: {
      householdId: string;
      recurringId: string;
      status?: "CONFIRMED" | "DISMISSED";
      isSubscription?: boolean;
    },
  ) {
    await this.access.requireCanWrite(userId, input.householdId);
    if (input.status === undefined && input.isSubscription === undefined) {
      throw new BadRequestException("Ange status eller abonnemangsmarkering.");
    }
    const db = getDb();
    const [existing] = await db
      .select()
      .from(recurringItems)
      .where(
        and(
          eq(recurringItems.id, input.recurringId),
          eq(recurringItems.householdId, input.householdId),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundException("Den återkommande posten finns inte.");

    await db
      .update(recurringItems)
      .set({
        userVerified: true,
        ...(input.status ? { status: input.status } : {}),
        ...(input.isSubscription !== undefined
          ? {
              userMarkedSubscription: input.isSubscription,
              isSubscription: input.isSubscription,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(recurringItems.id, existing.id));

    // A dismissed stream has no future: its open expectations go with it.
    if (input.status === "DISMISSED") {
      await db
        .delete(expectedTransactions)
        .where(
          and(
            eq(expectedTransactions.recurringItemId, existing.id),
            eq(expectedTransactions.status, "PENDING"),
          ),
        );
    }

    await db.insert(auditLogs).values({
      householdId: input.householdId,
      actorUserId: userId,
      action: "intelligence.recurring.verified",
      entity: "recurring_item",
      entityId: existing.id,
      after: {
        status: input.status ?? existing.status,
        isSubscription: input.isSubscription ?? existing.isSubscription,
      },
      source: "api",
    });

    return this.overview(userId, input.householdId);
  }

  /* -------------------------------------------------------------- helpers */

  private async occurrencesForStream(
    householdId: string,
    stream: { signature: string | null; direction: string },
  ): Promise<RecurringOccurrence[]> {
    if (!stream.signature) return [];
    const db = getDb();
    const sign = stream.direction === "INFLOW" ? sql`>=` : sql`<`;
    const rows = await db
      .select({
        bookingDate: sourceTransactions.bookingDate,
        amountMinor: sourceTransactions.amountMinor,
      })
      .from(sourceTransactions)
      .where(
        and(
          eq(sourceTransactions.householdId, householdId),
          eq(sourceTransactions.signature, stream.signature),
          sql`${sourceTransactions.amountMinor} ${sign} 0`,
          eq(sourceTransactions.isExcluded, false),
        ),
      )
      .orderBy(asc(sourceTransactions.bookingDate));
    return rows.map((row) => ({ date: row.bookingDate, amountMinor: row.amountMinor }));
  }
}

export type RecurringGroupKey =
  | "subscriptions"
  | "housing_debt"
  | "utilities"
  | "insurance"
  | "income"
  | "other";

function groupOfStream(stream: {
  direction: string;
  recurringType: string | null;
  isSubscription: boolean;
}): RecurringGroupKey {
  if (stream.direction === "INFLOW") return "income";
  if (stream.isSubscription) return "subscriptions";
  switch (stream.recurringType) {
    case "MORTGAGE":
    case "LOAN_PAYMENT":
      return "housing_debt";
    case "UTILITY_BILL":
    case "VARIABLE_RECURRING":
      return "utilities";
    case "INSURANCE":
      return "insurance";
    default:
      return "other";
  }
}

const GROUP_LABELS: Record<RecurringGroupKey, string> = {
  subscriptions: "Abonnemang",
  housing_debt: "Boende & lån",
  utilities: "El & drift",
  insurance: "Försäkringar",
  income: "Inkomster",
  other: "Övrigt återkommande",
};

function groupStreams<T extends { group: RecurringGroupKey }>(
  streams: T[],
): Array<{ key: RecurringGroupKey; label: string; streams: T[] }> {
  const order: RecurringGroupKey[] = [
    "subscriptions",
    "housing_debt",
    "utilities",
    "insurance",
    "income",
    "other",
  ];
  return order
    .map((key) => ({
      key,
      label: GROUP_LABELS[key],
      streams: streams.filter((stream) => stream.group === key),
    }))
    .filter((group) => group.streams.length > 0);
}
