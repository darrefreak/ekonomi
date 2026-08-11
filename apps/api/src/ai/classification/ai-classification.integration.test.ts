import assert from "node:assert/strict";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import type { AiClusterClassification } from "@ffos/schemas";
import { getDb } from "../../db/client";
import { households, householdMembers, users } from "../../db/schema";
import {
  accounts,
  categories,
  ledgerPostings,
  merchantClusters,
  sourceTransactions,
} from "../../db/schema-economic";
import { aiClassificationResults } from "../../db/schema-ai";
import { householdSettings } from "../../db/schema-ops";
import { requireTestDatabase } from "../../testing/require-test-database";
import { HouseholdAccessService } from "../../households/household-access.service";
import { ClassificationReviewService } from "../../intelligence/classification-review.service";
import { TransactionClusteringService } from "../../intelligence/transaction-clustering.service";
import { AiClassificationService } from "./ai-classification.service";
import {
  ClassificationProviderError,
  type ClassificationRequest,
  type ClassificationResponse,
  type TransactionClassificationProvider,
} from "./provider";

/**
 * The AI classification boundary against a real database (§52–§63).
 *
 * Every provider in this file is a fake: no request leaves the machine, which
 * is itself part of what is being proven — the pipeline's behaviour is fully
 * decided by what comes back through the provider interface, and every
 * failure mode of that interface leaves the deterministic product intact.
 */

requireTestDatabase();

const suffix = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const access = new HouseholdAccessService();
const clustering = new TransactionClusteringService(access);

/** A controllable provider: responds, refuses, or breaks on demand. */
class FakeProvider implements TransactionClassificationProvider {
  readonly name = "fake";
  readonly model = "fake-model-1";
  calls = 0;
  lastRequest: ClassificationRequest | null = null;
  failWith: ClassificationProviderError | null = null;
  respond: (request: ClassificationRequest) => AiClusterClassification[] = () => [];

  isConfigured(): boolean {
    return true;
  }

  async classify(request: ClassificationRequest): Promise<ClassificationResponse> {
    this.calls += 1;
    this.lastRequest = request;
    if (this.failWith) throw this.failWith;
    return {
      results: this.respond(request),
      provider: this.name,
      model: this.model,
      usage: { promptTokens: 100, completionTokens: 50 },
      latencyMs: 5,
    };
  }
}

function enabledConfig() {
  return {
    apiKey: "test-key",
    model: "fake-model-1",
    enabled: true,
    dryRun: false,
    maxClustersPerRun: 25,
    timeoutMs: 5_000,
  };
}

async function fixture(options: { aiEnabled?: boolean } = {}) {
  const db = getDb();
  const [household] = await db
    .insert(households)
    .values({ name: `AI ${suffix()}`, baseCurrency: "SEK" })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      email: `ai-${suffix()}@example.test`,
      passwordHash: "x".repeat(60),
      displayName: "AI-testare",
    })
    .returning();
  await db.insert(householdMembers).values({
    householdId: household.id,
    userId: user.id,
    role: "OWNER",
  });
  await db.insert(householdSettings).values({
    householdId: household.id,
    aiTransactionAnalysisEnabled: options.aiEnabled ?? true,
  });
  const [account] = await db
    .insert(accounts)
    .values({
      householdId: household.id,
      name: "Lönekonto",
      accountType: "CHECKING",
      currency: "SEK",
    })
    .returning();

  const provider = new FakeProvider();
  const service = new AiClassificationService(access);
  service.providerOverride = provider;
  service.configOverride = enabledConfig();
  const review = new ClassificationReviewService(access, service);

  return { db, household, user, account, provider, service, review };
}

/**
 * A monthly, stable-amount pattern with rich semantic text: exactly the kind
 * of cluster where local evidence can corroborate a confident model.
 */
async function insertMonthlyPattern(
  db: ReturnType<typeof getDb>,
  householdId: string,
  accountId: string,
  text: string,
  options: { count?: number; amountMinor?: bigint } = {},
) {
  const count = options.count ?? 12;
  const amountMinor = options.amountMinor ?? -16_900n;
  for (let index = 0; index < count; index += 1) {
    const month = (index % 12) + 1;
    await db.insert(sourceTransactions).values({
      householdId,
      accountId,
      bookingDate: `2025-${String(month).padStart(2, "0")}-15`,
      amountMinor,
      currency: "SEK",
      description: text,
      rawDescription: text,
    });
  }
}

async function unresolvedClusters(db: ReturnType<typeof getDb>, householdId: string) {
  return db
    .select()
    .from(merchantClusters)
    .where(
      and(
        eq(merchantClusters.householdId, householdId),
        eq(merchantClusters.classificationSource, "UNKNOWN"),
      ),
    );
}

/** A high-evidence answer for whatever cluster the request carries. */
function confidentAnswer(
  request: ClassificationRequest,
  overrides: Partial<AiClusterClassification> = {},
): AiClusterClassification[] {
  return request.clusters.map((cluster) => ({
    clusterRef: cluster.clusterRef,
    merchantCandidate: "Zapstream Media",
    merchantConfidence: 0.98,
    categoryId: null,
    subcategoryId: null,
    transactionType: "PURCHASE",
    recurringTypeCandidate: "SUBSCRIPTION",
    classificationConfidence: 0.98,
    shortExplanation: "Streaming brand with a stable monthly charge.",
    signals: ["MERCHANT_NAME_IN_TEXT", "RECURRING_CADENCE"],
    ...overrides,
  }));
}

/* ------------------------------------------------------------ §52 dry run */

void test("dry-run reports the real eligibility maths and makes zero provider calls", async () => {
  const { db, household, user, account, provider, service } = await fixture();
  await insertMonthlyPattern(db, household.id, account.id, "ZAPSTREAM MEDIA TJANST");
  // An opaque, reference-only pattern: never eligible (§28).
  await insertMonthlyPattern(db, household.id, account.id, "90480938947529", {
    count: 4,
  });
  await clustering.analyse(user.id, household.id);

  const report = await service.dryRun(user.id, household.id);

  assert.equal(report.dryRun, true);
  assert.equal(report.providerCallsMade, 0);
  assert.equal(provider.calls, 0, "a dry-run never touches the provider");
  assert.ok(report.transactionsAnalyzed >= 16);
  assert.ok(report.unresolvedClusters >= 2);
  assert.equal(report.aiEligibleClusters, 1, "only the semantic cluster is eligible");
  assert.ok(report.opaqueExcluded >= 1, "the reference-only cluster is excluded");
  assert.equal(report.estimatedRequests, 1);
  assert.ok(report.estimatedPayloadBytes > 0);

  const aiRows = await db
    .select()
    .from(aiClassificationResults)
    .where(eq(aiClassificationResults.householdId, household.id));
  assert.equal(aiRows.length, 0, "dry-run persists nothing");
});

/* --------------------------------------------- §53 high confidence apply */

void test("high combined confidence applies merchant as AI_MATCH and never touches the ledger", async () => {
  const { db, household, user, account, provider, service } = await fixture();
  await insertMonthlyPattern(db, household.id, account.id, "ZAPSTREAM MEDIA TJANST");
  await clustering.analyse(user.id, household.id);

  const postingsBefore = await db
    .select()
    .from(ledgerPostings)
    .where(eq(ledgerPostings.householdId, household.id));

  provider.respond = (request) => confidentAnswer(request);
  const run = await service.classify(user.id, household.id);

  assert.equal(run.dryRun, false);
  assert.ok("applied" in run);
  assert.equal(run.applied, 1);
  assert.equal(provider.calls, 1);

  const [cluster] = await db
    .select()
    .from(merchantClusters)
    .where(eq(merchantClusters.householdId, household.id));
  assert.equal(cluster.classificationSource, "AI_MATCH", "labeled AI, not deterministic");
  assert.equal(cluster.merchantCandidate, "Zapstream Media");

  const rows = await db
    .select()
    .from(sourceTransactions)
    .where(eq(sourceTransactions.householdId, household.id));
  assert.ok(rows.every((row) => row.classificationSource === "AI_MATCH"));
  assert.ok(rows.every((row) => row.merchantId !== null));

  const postingsAfter = await db
    .select()
    .from(ledgerPostings)
    .where(eq(ledgerPostings.householdId, household.id));
  assert.equal(
    postingsAfter.length,
    postingsBefore.length,
    "financial oracle: AI classification writes no posting (§63)",
  );
});

/* ------------------------------------------------- §54 low confidence */

void test("moderate confidence becomes a review suggestion, never an application", async () => {
  const { db, household, user, account, provider, service, review } = await fixture();
  await insertMonthlyPattern(db, household.id, account.id, "ZAPSTREAM MEDIA TJANST");
  await clustering.analyse(user.id, household.id);

  provider.respond = (request) =>
    confidentAnswer(request, {
      // One of three name tokens is absent from the text and the model is
      // less sure: combined confidence lands in the suggest band.
      merchantCandidate: "Zapstream Media Group",
      classificationConfidence: 0.85,
    });
  const run = await service.classify(user.id, household.id);

  assert.ok("suggested" in run);
  assert.equal(run.suggested, 1);
  assert.equal(run.applied, 0);

  const [cluster] = await db
    .select()
    .from(merchantClusters)
    .where(eq(merchantClusters.householdId, household.id));
  assert.equal(cluster.classificationSource, "UNKNOWN", "the question stays open");

  // The review card carries the AI suggestion (§24).
  const queue = await review.list(user.id, household.id);
  assert.equal(queue.total, 1);
  const [item] = queue.items;
  assert.ok(item.aiSuggestion, "review item has the AI suggestion attached");
  assert.equal(item.aiSuggestion!.source, "AI_SUGGESTION");
  assert.equal(item.aiSuggestion!.merchantCandidate, "Zapstream Media Group");
  assert.ok(item.aiSuggestion!.confidence > 0 && item.aiSuggestion!.confidence < 0.95);
});

/* --------------------------------------------- §29 the ambiguous Apple */

void test("ambiguous Apple: a confident merchant with an uncertain category suggests, asserts no subscription", async () => {
  const { db, household, user, account, provider, service, review } = await fixture();
  // One descriptor, wildly different amounts: app purchase, subscription and
  // hardware all bill through the same text. The merchant is obvious; what the
  // money means is not.
  await insertMonthlyPattern(db, household.id, account.id, "APPLE COM BILL", {
    count: 4,
    amountMinor: -12_900n,
  });
  await insertMonthlyPattern(db, household.id, account.id, "APPLE COM BILL", {
    count: 2,
    amountMinor: -1_499_500n,
  });
  await clustering.analyse(user.id, household.id);
  const open = await unresolvedClusters(db, household.id);
  assert.ok(open.length >= 1, "Apple is a question, not an assertion");

  provider.respond = (request) =>
    confidentAnswer(request, {
      merchantCandidate: "Apple",
      merchantConfidence: 0.98,
      categoryId: null,
      recurringTypeCandidate: null,
      classificationConfidence: 0.55,
      shortExplanation: "Apple billing descriptor; purpose of charges unclear.",
    });
  const run = await service.classify(user.id, household.id);

  assert.ok("applied" in run);
  assert.equal(run.applied, 0, "an uncertain category never auto-applies");
  assert.ok(run.suggested >= 1);

  const queue = await review.list(user.id, household.id);
  const apple = queue.items.find(
    (item) => item.aiSuggestion?.merchantCandidate === "Apple",
  );
  assert.ok(apple, "the Apple suggestion reaches the review card");
  assert.equal(apple!.aiSuggestion!.categoryId, null, "no category was invented");
  assert.ok(
    apple!.aiSuggestion!.merchantConfidence! >= 0.9,
    "the merchant itself may be confident",
  );

  const clusters = await db
    .select()
    .from(merchantClusters)
    .where(eq(merchantClusters.householdId, household.id));
  assert.ok(
    clusters.every((cluster) => cluster.classificationSource === "UNKNOWN"),
    "nothing was asserted behind the person's back",
  );
});

/* --------------------------------------------------- §55 high-risk type */

void test("a high-risk type proposal goes to review even at maximal confidence", async () => {
  const { db, household, user, account, provider, service } = await fixture();
  await insertMonthlyPattern(db, household.id, account.id, "ZAPSTREAM MEDIA TJANST");
  await clustering.analyse(user.id, household.id);

  provider.respond = (request) =>
    confidentAnswer(request, { transactionType: "TRANSFER" });
  const run = await service.classify(user.id, household.id);

  assert.ok("applied" in run);
  assert.equal(run.applied, 0, "TRANSFER never auto-applies");
  assert.equal(run.suggested, 1);

  const [cluster] = await db
    .select()
    .from(merchantClusters)
    .where(eq(merchantClusters.householdId, household.id));
  assert.equal(cluster.classificationSource, "UNKNOWN");
  const rows = await db
    .select()
    .from(sourceTransactions)
    .where(eq(sourceTransactions.householdId, household.id));
  assert.ok(
    rows.every((row) => row.classificationSource !== "AI_MATCH"),
    "no transaction was rewritten",
  );
});

/* ------------------------------------------------ §56 invalid results */

void test("an invented category id rejects the result; the cluster stays reviewable", async () => {
  const { db, household, user, account, provider, service, review } = await fixture();
  await insertMonthlyPattern(db, household.id, account.id, "ZAPSTREAM MEDIA TJANST");
  await clustering.analyse(user.id, household.id);

  provider.respond = (request) =>
    confidentAnswer(request, {
      categoryId: "00000000-0000-4000-8000-000000000000",
    });
  const run = await service.classify(user.id, household.id);

  assert.ok("rejected" in run);
  assert.equal(run.rejected, 1);
  assert.equal(run.applied, 0);

  const [row] = await db
    .select()
    .from(aiClassificationResults)
    .where(eq(aiClassificationResults.householdId, household.id));
  assert.equal(row.status, "REJECTED");
  assert.equal(row.failureReason, "UNKNOWN_CATEGORY_ID");

  const queue = await review.list(user.id, household.id);
  assert.equal(queue.total, 1, "still one open review question");
});

void test("a malformed provider response fails the batch and the pipeline continues", async () => {
  const { db, household, user, account, provider, service, review } = await fixture();
  await insertMonthlyPattern(db, household.id, account.id, "ZAPSTREAM MEDIA TJANST");
  await clustering.analyse(user.id, household.id);

  provider.failWith = new ClassificationProviderError(
    "INVALID_RESPONSE",
    "schema validation failed",
  );
  const run = await service.classify(user.id, household.id);

  assert.ok("failed" in run);
  assert.equal(run.failed, 1);
  assert.equal(run.applied, 0);

  const queue = await review.list(user.id, household.id);
  assert.equal(queue.total, 1, "review is unaffected by the failure");
});

/* ------------------------------------------------------- §57 unknown */

void test("an explicit UNKNOWN fabricates nothing", async () => {
  const { db, household, user, account, provider, service, review } = await fixture();
  await insertMonthlyPattern(db, household.id, account.id, "ZAPSTREAM MEDIA TJANST");
  await clustering.analyse(user.id, household.id);

  provider.respond = (request) =>
    request.clusters.map((cluster) => ({
      clusterRef: cluster.clusterRef,
      merchantCandidate: null,
      merchantConfidence: 0,
      categoryId: null,
      subcategoryId: null,
      transactionType: "UNKNOWN" as const,
      recurringTypeCandidate: null,
      classificationConfidence: 0.2,
      shortExplanation: "Insufficient evidence.",
      signals: ["AMBIGUOUS_TEXT" as const],
    }));
  const run = await service.classify(user.id, household.id);

  assert.ok("unknown" in run);
  assert.equal(run.unknown, 1);
  assert.equal(run.applied, 0);
  assert.equal(run.suggested, 0);

  const [cluster] = await db
    .select()
    .from(merchantClusters)
    .where(eq(merchantClusters.householdId, household.id));
  assert.equal(cluster.classificationSource, "UNKNOWN");
  assert.equal(cluster.merchantCandidate, null, "no merchant was invented");
  assert.equal((await review.list(user.id, household.id)).total, 1);
});

/* --------------------------------------------------------- §58 cache */

void test("an unchanged cluster is answered from cache, not re-sent (§58) — and reruns are idempotent (§23)", async () => {
  const { db, household, user, account, provider, service } = await fixture();
  await insertMonthlyPattern(db, household.id, account.id, "ZAPSTREAM MEDIA TJANST");
  await clustering.analyse(user.id, household.id);

  provider.respond = (request) =>
    confidentAnswer(request, {
      merchantCandidate: "Zapstream Media Group",
      classificationConfidence: 0.85,
    });

  const first = await service.classify(user.id, household.id);
  assert.ok("suggested" in first);
  assert.equal(provider.calls, 1);

  const second = await service.classify(user.id, household.id);
  assert.ok("cacheHits" in second);
  assert.equal(second.cacheHits, 1);
  assert.equal(provider.calls, 1, "no second external call for the same cluster");

  const aiRows = await db
    .select()
    .from(aiClassificationResults)
    .where(eq(aiClassificationResults.householdId, household.id));
  assert.equal(aiRows.length, 1, "one result row, not one per run");
  assert.equal(aiRows[0]!.hitCount, 1);
});

/* ------------------------------------------------ §59 taxonomy version */

void test("changing the taxonomy invalidates the cached answer", async () => {
  const { db, household, user, account, provider, service } = await fixture();
  await insertMonthlyPattern(db, household.id, account.id, "ZAPSTREAM MEDIA TJANST");
  await clustering.analyse(user.id, household.id);

  provider.respond = (request) =>
    confidentAnswer(request, {
      merchantCandidate: "Zapstream Media Group",
      classificationConfidence: 0.85,
    });
  await service.classify(user.id, household.id);
  assert.equal(provider.calls, 1);

  // A new category changes the answer space, so the cache identity changes.
  await db.insert(categories).values({
    householdId: household.id,
    key: `streaming-${suffix()}`,
    name: "Streaming",
    kind: "expense",
    isSystem: false,
  });

  const rerun = await service.classify(user.id, household.id);
  assert.ok("cacheHits" in rerun);
  assert.equal(rerun.cacheHits, 0, "old answer no longer matches");
  assert.equal(provider.calls, 2, "the cluster is reconsidered under the new taxonomy");
});

/* --------------------------------------- §26/§27 learned rule + user win */

void test("learned rule > AI: a corrected pattern is resolved deterministically and AI is not called", async () => {
  const { db, household, user, account, provider, service, review } = await fixture();
  await insertMonthlyPattern(db, household.id, account.id, "ZAPSTREAM MEDIA TJANST");
  await clustering.analyse(user.id, household.id);

  // AI suggests category A (as a suggestion).
  const [categoryA] = await db
    .insert(categories)
    .values({
      householdId: household.id,
      key: `nöje-${suffix()}`,
      name: "Nöje",
      kind: "expense",
      isSystem: false,
    })
    .returning();
  const [categoryB] = await db
    .insert(categories)
    .values({
      householdId: household.id,
      key: `medier-${suffix()}`,
      name: "Medier",
      kind: "expense",
      isSystem: false,
    })
    .returning();

  provider.respond = (request) =>
    confidentAnswer(request, {
      merchantCandidate: "Zapstream Media Group",
      categoryId: categoryA.id,
      classificationConfidence: 0.85,
    });
  await service.classify(user.id, household.id);

  // The user corrects to category B and remembers the rule (§26).
  const [item] = (await review.list(user.id, household.id)).items;
  await review.resolve(user.id, {
    householdId: household.id,
    clusterId: item.id,
    action: "correct",
    merchantName: "Zapstream",
    categoryId: categoryB.id,
    rememberRule: true,
  });

  // A new matching transaction arrives and analysis reruns.
  await insertMonthlyPattern(db, household.id, account.id, "ZAPSTREAM MEDIA TJANST", {
    count: 1,
  });
  await clustering.analyse(user.id, household.id);

  const callsBefore = provider.calls;
  const report = await service.classify(user.id, household.id);
  assert.equal(provider.calls, callsBefore, "nothing eligible: AI is not called");
  assert.ok("eligibleClusters" in report);
  assert.equal(report.eligibleClusters, 0);

  const rows = await db
    .select()
    .from(sourceTransactions)
    .where(eq(sourceTransactions.householdId, household.id));
  assert.ok(
    rows.every(
      (row) =>
        row.classificationSource === "USER_VERIFIED" ||
        row.classificationSource === "LEARNED_RULE",
    ),
    "the household's answer governs every row; AI never re-enters",
  );
  assert.ok(rows.every((row) => row.categoryId === categoryB.id));
});

void test("user verified > AI: an applied AI answer is overridden by the person, permanently", async () => {
  const { db, household, user, account, provider, service, review } = await fixture();
  await insertMonthlyPattern(db, household.id, account.id, "ZAPSTREAM MEDIA TJANST");
  await clustering.analyse(user.id, household.id);

  provider.respond = (request) => confidentAnswer(request);
  const first = await service.classify(user.id, household.id);
  assert.ok("applied" in first);
  assert.equal(first.applied, 1, "AI applied its answer");

  // The person disagrees. AI_MATCH clusters are re-reviewable via correct().
  const [cluster] = await db
    .select()
    .from(merchantClusters)
    .where(eq(merchantClusters.householdId, household.id));
  await review.resolve(user.id, {
    householdId: household.id,
    clusterId: cluster.id,
    action: "correct",
    merchantName: "Riktiga Firman",
    rememberRule: false,
  });

  const rows = await db
    .select()
    .from(sourceTransactions)
    .where(eq(sourceTransactions.householdId, household.id));
  assert.ok(rows.every((row) => row.classificationSource === "USER_VERIFIED"));

  // Rerunning AI must not undo the person's answer (§27).
  const rerun = await service.classify(user.id, household.id);
  assert.ok("eligibleClusters" in rerun);
  assert.equal(rerun.eligibleClusters, 0);
  const after = await db
    .select()
    .from(sourceTransactions)
    .where(eq(sourceTransactions.householdId, household.id));
  assert.ok(after.every((row) => row.classificationSource === "USER_VERIFIED"));
});

/* ---------------------------------------------------- §61 AI off / §62 down */

void test("AI off: classify degrades to the dry-run report and everything else works", async () => {
  const { db, household, user, account, provider, service, review } = await fixture({
    aiEnabled: false, // household said no
  });
  await insertMonthlyPattern(db, household.id, account.id, "ZAPSTREAM MEDIA TJANST");
  await clustering.analyse(user.id, household.id);

  const run = await service.classify(user.id, household.id);
  assert.equal(run.dryRun, true, "no household consent, no real run");
  assert.equal(provider.calls, 0);

  // Environment off behaves the same even with household consent.
  const withHousehold = await fixture({ aiEnabled: true });
  withHousehold.service.configOverride = { ...enabledConfig(), enabled: false };
  await insertMonthlyPattern(
    withHousehold.db,
    withHousehold.household.id,
    withHousehold.account.id,
    "ZAPSTREAM MEDIA TJANST",
  );
  await clustering.analyse(withHousehold.user.id, withHousehold.household.id);
  const envOff = await withHousehold.service.classify(
    withHousehold.user.id,
    withHousehold.household.id,
  );
  assert.equal(envOff.dryRun, true);
  assert.equal(withHousehold.provider.calls, 0);

  // Review keeps working with AI off (§61).
  const queue = await review.list(user.id, household.id);
  assert.equal(queue.total, 1);
  assert.equal(queue.items[0]!.aiSuggestion ?? null, null);
});

void test("provider down: timeouts and rate limits leave everything standing", async () => {
  const { db, household, user, account, provider, service, review } = await fixture();
  await insertMonthlyPattern(db, household.id, account.id, "ZAPSTREAM MEDIA TJANST");
  await clustering.analyse(user.id, household.id);

  for (const kind of ["TIMEOUT", "UNAVAILABLE", "RATE_LIMIT"] as const) {
    provider.failWith = new ClassificationProviderError(kind, kind.toLowerCase());
    const run = await service.classify(user.id, household.id);
    assert.ok("failed" in run, `${kind}: run completes`);
    assert.equal(run.applied, 0);
    // ERROR rows are not reusable answers: the next run may retry.
  }

  const queue = await review.list(user.id, household.id);
  assert.equal(queue.total, 1, "the cluster is still reviewable");
  const clusters = await unresolvedClusters(db, household.id);
  assert.equal(clusters.length, 1, "still unresolved, never mangled");
});

/* -------------------------------------------- §8 privacy in the payload */

void test("what leaves the system is the minimized payload, with redaction applied", async () => {
  const { db, household, user, account, provider, service } = await fixture();
  await insertMonthlyPattern(
    db,
    household.id,
    account.id,
    "ZAPSTREAM MEDIA TJANST 4501****1234 OCR 12345678901",
  );
  await clustering.analyse(user.id, household.id);

  provider.respond = (request) => confidentAnswer(request);
  await service.classify(user.id, household.id);

  const request = provider.lastRequest!;
  const serialized = JSON.stringify(request);
  assert.ok(!serialized.includes("4501"), "card fragment never leaves");
  assert.ok(!serialized.includes("12345678901"), "OCR reference never leaves");
  assert.ok(serialized.includes("ZAPSTREAM"), "merchant text survives");
  assert.ok(
    !serialized.includes(household.id) && !serialized.includes(account.id),
    "no database ids in the payload",
  );
  const [cluster] = request.clusters;
  assert.ok(cluster.sampleDescriptions.length <= 5, "samples, not full history");
});
