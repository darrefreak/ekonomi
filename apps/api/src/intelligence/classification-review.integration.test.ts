import assert from "node:assert/strict";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { households, householdMembers, users } from "../db/schema";
import {
  accounts,
  classificationRules,
  ledgerPostings,
  merchantClusters,
  merchants,
  sourceTransactions,
} from "../db/schema-economic";
import { requireTestDatabase } from "../testing/require-test-database";
import { AiClassificationService } from "../ai/classification/ai-classification.service";
import { HouseholdAccessService } from "../households/household-access.service";
import { ClassificationReviewService } from "./classification-review.service";
import { TransactionClusteringService } from "./transaction-clustering.service";

/**
 * Needs Review and learned rules against a real database.
 *
 * What is proven here is the loop the product depends on: an unresolved cluster
 * becomes exactly one review item, a person answers it once, the answer becomes
 * a rule, and from then on the pattern — including newly imported rows — is
 * classified by that rule instead of asked again. And through all of it, no
 * ledger posting is written, because merchant and category are opinion about a
 * transaction, not financial truth.
 */

requireTestDatabase();

const suffix = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const access = new HouseholdAccessService();
const clustering = new TransactionClusteringService(access);
const review = new ClassificationReviewService(access, new AiClassificationService(access));

async function fixture() {
  const db = getDb();
  const [household] = await db
    .insert(households)
    .values({ name: `Review ${suffix()}`, baseCurrency: "SEK" })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      email: `review-${suffix()}@example.test`,
      passwordHash: "x".repeat(60),
      displayName: "Granskare",
    })
    .returning();
  await db.insert(householdMembers).values({
    householdId: household.id,
    userId: user.id,
    role: "OWNER",
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
  return { db, household, user, account };
}

/**
 * A synthetic, deliberately unrecognisable pattern: no system rule and no
 * merchant matches it, so it must land in Needs Review.
 */
async function insertUnknownPattern(
  db: ReturnType<typeof getDb>,
  householdId: string,
  accountId: string,
  count: number,
  text = "ZZWORKSHOP HANDELSBOLAG",
) {
  for (let index = 0; index < count; index += 1) {
    await db.insert(sourceTransactions).values({
      householdId,
      accountId,
      bookingDate: `2026-0${1 + (index % 6)}-1${index % 9}`,
      amountMinor: BigInt(-10_000 - index * 100),
      currency: "SEK",
      description: text,
      rawDescription: text,
    });
  }
}

void test("an unresolved cluster is one review item, however many transactions it has", async () => {
  const { db, household, user, account } = await fixture();
  await insertUnknownPattern(db, household.id, account.id, 12);

  await clustering.analyse(user.id, household.id);
  const queue = await review.list(user.id, household.id);

  assert.equal(queue.total, 1, "12 transactions in one pattern are one question");
  const [item] = queue.items;
  assert.equal(item.transactionCount, 12);
  assert.equal(item.reviewType, "UNKNOWN_MERCHANT");
  assert.equal(item.status, "OPEN");
  assert.ok(item.representativeDescription.includes("ZZWORKSHOP"));
  assert.ok(item.explanation.length > 10, "the card says why the system is unsure");
});

void test("re-running analysis does not duplicate the review item", async () => {
  const { db, household, user, account } = await fixture();
  await insertUnknownPattern(db, household.id, account.id, 5);

  await clustering.analyse(user.id, household.id);
  await clustering.analyse(user.id, household.id);
  await clustering.analyse(user.id, household.id);

  const queue = await review.list(user.id, household.id);
  assert.equal(queue.total, 1);

  const clusters = await db
    .select()
    .from(merchantClusters)
    .where(eq(merchantClusters.householdId, household.id));
  assert.equal(clusters.length, 1, "three runs, still one cluster row");
});

void test("correcting a cluster classifies its transactions as USER_VERIFIED and writes no posting", async () => {
  const { db, household, user, account } = await fixture();
  await insertUnknownPattern(db, household.id, account.id, 8);
  await clustering.analyse(user.id, household.id);

  const before = await db
    .select()
    .from(ledgerPostings)
    .where(eq(ledgerPostings.householdId, household.id));

  const [item] = (await review.list(user.id, household.id)).items;
  const result = await review.resolve(user.id, {
    householdId: household.id,
    clusterId: item.id,
    action: "correct",
    merchantName: "Verkstan i Handen",
    rememberRule: false,
  });

  assert.equal(result.status, "RESOLVED");
  assert.equal(result.transactionsUpdated, 8);
  assert.equal(result.remainingReviewCount, 0);

  const rows = await db
    .select()
    .from(sourceTransactions)
    .where(eq(sourceTransactions.householdId, household.id));
  assert.ok(rows.every((row) => row.classificationSource === "USER_VERIFIED"));
  assert.ok(rows.every((row) => row.merchantId !== null));

  const after = await db
    .select()
    .from(ledgerPostings)
    .where(eq(ledgerPostings.householdId, household.id));
  assert.equal(
    after.length,
    before.length,
    "classification is opinion, not financial truth: no posting was written",
  );
});

void test("a category-only correction works and still writes no financial truth", async () => {
  const { db, household, user, account } = await fixture();
  await insertUnknownPattern(db, household.id, account.id, 5);
  await clustering.analyse(user.id, household.id);

  const { categories } = await import("../db/schema-economic");
  const [category] = await db
    .insert(categories)
    .values({
      householdId: household.id,
      key: `verkstad-${suffix()}`,
      name: "Verkstad",
      kind: "expense",
      isSystem: false,
    })
    .returning();

  const before = await db
    .select()
    .from(ledgerPostings)
    .where(eq(ledgerPostings.householdId, household.id));

  const [item] = (await review.list(user.id, household.id)).items;
  const result = await review.resolve(user.id, {
    householdId: household.id,
    clusterId: item.id,
    action: "correct",
    categoryId: category.id,
    rememberRule: true,
  });
  assert.equal(result.status, "RESOLVED");
  assert.equal(result.transactionsUpdated, 5);

  const rows = await db
    .select()
    .from(sourceTransactions)
    .where(eq(sourceTransactions.householdId, household.id));
  assert.ok(rows.every((row) => row.categoryId === category.id));
  assert.ok(rows.every((row) => row.classificationSource === "USER_VERIFIED"));

  const after = await db
    .select()
    .from(ledgerPostings)
    .where(eq(ledgerPostings.householdId, household.id));
  assert.equal(after.length, before.length);

  // The rule carries the category, so a new matching row inherits it.
  await insertUnknownPattern(db, household.id, account.id, 1);
  await clustering.analyse(user.id, household.id);
  const learned = await db
    .select()
    .from(sourceTransactions)
    .where(
      and(
        eq(sourceTransactions.householdId, household.id),
        eq(sourceTransactions.classificationSource, "LEARNED_RULE"),
      ),
    );
  assert.equal(learned.length, 1);
  assert.equal(learned[0].categoryId, category.id);
});

void test("a resolved cluster stays resolved across re-runs, even without a rule", async () => {
  const { db, household, user, account } = await fixture();
  await insertUnknownPattern(db, household.id, account.id, 4);
  await clustering.analyse(user.id, household.id);

  const [item] = (await review.list(user.id, household.id)).items;
  await review.resolve(user.id, {
    householdId: household.id,
    clusterId: item.id,
    action: "correct",
    merchantName: "Verkstan",
    rememberRule: false,
  });

  await clustering.analyse(user.id, household.id);
  const queue = await review.list(user.id, household.id);
  assert.equal(queue.total, 0, "the answered question is not asked again");

  const [cluster] = await db
    .select()
    .from(merchantClusters)
    .where(eq(merchantClusters.householdId, household.id));
  assert.equal(cluster.classificationSource, "USER_VERIFIED");
});

void test("remember-for-future: the rule persists, applies on rerun as LEARNED_RULE, and covers new transactions", async () => {
  const { db, household, user, account } = await fixture();
  await insertUnknownPattern(db, household.id, account.id, 6);
  await clustering.analyse(user.id, household.id);

  const [item] = (await review.list(user.id, household.id)).items;
  const result = await review.resolve(user.id, {
    householdId: household.id,
    clusterId: item.id,
    action: "correct",
    merchantName: "Verkstan i Handen",
    rememberRule: true,
  });
  assert.equal(result.ruleCreated, true);

  const rules = await db
    .select()
    .from(classificationRules)
    .where(eq(classificationRules.householdId, household.id));
  assert.equal(rules.length, 1);
  assert.equal(rules[0].ruleType, "EXACT_SIGNATURE");
  assert.equal(rules[0].userVerified, true);

  // A new transaction with the same pattern arrives — a later import.
  await insertUnknownPattern(db, household.id, account.id, 1);
  const rerun = await clustering.analyse(user.id, household.id);
  assert.equal(rerun.learnedRulesApplied, 1);

  const rows = await db
    .select()
    .from(sourceTransactions)
    .where(
      and(
        eq(sourceTransactions.householdId, household.id),
        eq(sourceTransactions.classificationSource, "LEARNED_RULE"),
      ),
    );
  assert.equal(rows.length, 1, "the new row was classified by the rule, not asked about");

  const queue = await review.list(user.id, household.id);
  assert.equal(queue.total, 0, "nothing returned to Needs Review");

  // Truthful metrics: the rule's work is LEARNED_RULE, the person's is USER_VERIFIED.
  assert.equal(rerun.coverage.learnedRule, 1);
  assert.equal(rerun.coverage.userVerified, 6);
  assert.equal(rerun.coverage.unknown, 0);
  assert.equal(rerun.coverage.meaningfullyClassified, 7);

  const [rule] = await db
    .select()
    .from(classificationRules)
    .where(eq(classificationRules.householdId, household.id));
  assert.equal(rule.matchCount >= 1, true, "the rule records that it matched");
});

void test("resolving the same cluster twice updates the rule rather than duplicating it", async () => {
  const { db, household, user, account } = await fixture();
  await insertUnknownPattern(db, household.id, account.id, 3);
  await clustering.analyse(user.id, household.id);
  const [item] = (await review.list(user.id, household.id)).items;

  await review.resolve(user.id, {
    householdId: household.id,
    clusterId: item.id,
    action: "correct",
    merchantName: "Första svaret",
    rememberRule: true,
  });
  await review.resolve(user.id, {
    householdId: household.id,
    clusterId: item.id,
    action: "correct",
    merchantName: "Andra svaret",
    rememberRule: true,
  });

  const rules = await db
    .select()
    .from(classificationRules)
    .where(eq(classificationRules.householdId, household.id));
  assert.equal(rules.length, 1, "same signature, same rule — updated, not duplicated");
  assert.equal(rules[0].version, 2);
});

void test("a user-verified rule outranks the system catalogue", async () => {
  const { db, household, user, account } = await fixture();
  // NETFLIX is in the system merchant catalogue and would resolve deterministically.
  await insertUnknownPattern(db, household.id, account.id, 3, "NETFLIX.COM");
  await clustering.analyse(user.id, household.id);

  // The household disagrees: this is a shared account with a friend, call it that.
  const [cluster] = await db
    .select()
    .from(merchantClusters)
    .where(eq(merchantClusters.householdId, household.id));
  const [myMerchant] = await db
    .insert(merchants)
    .values({
      householdId: household.id,
      canonicalName: "Delat konto med Alex",
      userVerified: true,
    })
    .returning();
  await db.insert(classificationRules).values({
    householdId: household.id,
    ruleType: "EXACT_SIGNATURE",
    matchValue: cluster.signature,
    merchantId: myMerchant.id,
    userVerified: true,
    enabled: true,
  });

  const rerun = await clustering.analyse(user.id, household.id);
  assert.equal(rerun.learnedRulesApplied, 1);

  const [updated] = await db
    .select()
    .from(merchantClusters)
    .where(eq(merchantClusters.householdId, household.id));
  assert.equal(updated.merchantId, myMerchant.id, "the household's rule won");
  assert.equal(updated.classificationSource, "LEARNED_RULE");
});

void test("a disabled rule stops applying", async () => {
  const { db, household, user, account } = await fixture();
  await insertUnknownPattern(db, household.id, account.id, 2);
  await clustering.analyse(user.id, household.id);
  const [item] = (await review.list(user.id, household.id)).items;
  await review.resolve(user.id, {
    householdId: household.id,
    clusterId: item.id,
    action: "correct",
    merchantName: "Verkstan",
    rememberRule: true,
  });

  const rules = await review.listRules(user.id, household.id);
  assert.equal(rules.total, 1);
  await review.setRuleEnabled(user.id, household.id, rules.items[0].id, false);

  // A new matching transaction with the rule off: it stays unknown and is asked about.
  await insertUnknownPattern(db, household.id, account.id, 1);
  const rerun = await clustering.analyse(user.id, household.id);
  assert.equal(rerun.learnedRulesApplied, 0);

  const unknownRows = await db
    .select()
    .from(sourceTransactions)
    .where(
      and(
        eq(sourceTransactions.householdId, household.id),
        eq(sourceTransactions.classificationSource, "UNKNOWN"),
      ),
    );
  assert.equal(unknownRows.length, 1);

  // Deleting removes it from the list entirely.
  const afterDelete = await review.deleteRule(user.id, household.id, rules.items[0].id);
  assert.equal(afterDelete.total, 0);
});

void test("skip dismisses the cluster and it stays dismissed across re-runs", async () => {
  const { db, household, user, account } = await fixture();
  await insertUnknownPattern(db, household.id, account.id, 3);
  await clustering.analyse(user.id, household.id);
  const [item] = (await review.list(user.id, household.id)).items;

  const result = await review.resolve(user.id, {
    householdId: household.id,
    clusterId: item.id,
    action: "skip",
    rememberRule: false,
  });
  assert.equal(result.status, "DISMISSED");
  assert.equal(result.remainingReviewCount, 0);

  await clustering.analyse(user.id, household.id);
  const queue = await review.list(user.id, household.id);
  assert.equal(queue.total, 0, "a skipped question does not nag on every run");
});

void test("another household can neither read, resolve, nor teach rules against the victim's clusters", async () => {
  const victim = await fixture();
  const attacker = await fixture();
  await insertUnknownPattern(victim.db, victim.household.id, victim.account.id, 3);
  await clustering.analyse(victim.user.id, victim.household.id);
  const [item] = (await review.list(victim.user.id, victim.household.id)).items;

  // Reading the victim's queue under the attacker's own household id: empty.
  const attackerQueue = await review.list(attacker.user.id, attacker.household.id);
  assert.equal(attackerQueue.total, 0);

  // Reading the victim's queue directly: refused.
  await assert.rejects(() => review.list(attacker.user.id, victim.household.id));

  // Resolving the victim's cluster via the attacker's household: not found.
  await assert.rejects(() =>
    review.resolve(attacker.user.id, {
      householdId: attacker.household.id,
      clusterId: item.id,
      action: "correct",
      merchantName: "Kapning",
      rememberRule: true,
    }),
  );

  // And no rule leaked into either household.
  const victimRules = await review.listRules(victim.user.id, victim.household.id);
  const attackerRules = await review.listRules(attacker.user.id, attacker.household.id);
  assert.equal(victimRules.total, 0);
  assert.equal(attackerRules.total, 0);

  // Rule tampering across households: not found.
  await insertUnknownPattern(victim.db, victim.household.id, victim.account.id, 1);
  await clustering.analyse(victim.user.id, victim.household.id);
  const [victimItem] = (await review.list(victim.user.id, victim.household.id)).items;
  await review.resolve(victim.user.id, {
    householdId: victim.household.id,
    clusterId: victimItem.id,
    action: "correct",
    merchantName: "Verkstan",
    rememberRule: true,
  });
  const created = await review.listRules(victim.user.id, victim.household.id);
  await assert.rejects(() =>
    review.setRuleEnabled(attacker.user.id, attacker.household.id, created.items[0].id, false),
  );
  await assert.rejects(() =>
    review.deleteRule(attacker.user.id, attacker.household.id, created.items[0].id),
  );
});

void test("accepting the system's candidate resolves with the suggested merchant", async () => {
  const { db, household, user, account } = await fixture();
  // A pattern the candidate engine names but does not auto-accept is hard to
  // fabricate deterministically, so stage the candidate directly on the cluster.
  await insertUnknownPattern(db, household.id, account.id, 4, "ZZCAFE STOCKHOLM");
  await clustering.analyse(user.id, household.id);
  const [clusterRow] = await db
    .select()
    .from(merchantClusters)
    .where(eq(merchantClusters.householdId, household.id));
  await db
    .update(merchantClusters)
    .set({ merchantCandidate: "Zz Café", merchantConfidence: "0.72" })
    .where(eq(merchantClusters.id, clusterRow.id));

  const [item] = (await review.list(user.id, household.id)).items;
  assert.equal(item.merchantCandidate, "Zz Café");
  assert.equal(item.reviewType, "LOW_CLASSIFICATION_CONFIDENCE");

  const result = await review.resolve(user.id, {
    householdId: household.id,
    clusterId: item.id,
    action: "accept",
    rememberRule: true,
  });
  assert.equal(result.status, "RESOLVED");
  assert.equal(result.transactionsUpdated, 4);

  const [merchant] = await db
    .select()
    .from(merchants)
    .where(eq(merchants.householdId, household.id));
  assert.equal(merchant.canonicalName, "Zz Café");
  assert.equal(merchant.userVerified, true, "a person accepted it, so it is verified");
});
