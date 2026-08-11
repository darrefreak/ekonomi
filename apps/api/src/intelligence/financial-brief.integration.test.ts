import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { households, householdMembers, users } from "../db/schema";
import { financialBriefSnapshots } from "../db/schema-ai";
import { accounts, sourceTransactions } from "../db/schema-economic";
import { householdSettings } from "../db/schema-ops";
import { requireTestDatabase } from "../testing/require-test-database";
import { AiClassificationService } from "../ai/classification/ai-classification.service";
import type {
  BriefLanguageProvider,
  BriefLanguageRequest,
  BriefLanguageResponse,
} from "../ai/classification/provider";
import { HouseholdAccessService } from "../households/household-access.service";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";
import { FinancialBriefService } from "./financial-brief.service";
import { FinancialIntelligenceInputService } from "./financial-intelligence-input.service";

/**
 * Financial Brief V2 against a real database (§37–§45, §60–§62).
 *
 * The provider is always a fake. What is proven: the template brief is
 * complete on its own, AI is an optional prose layer whose numbers are
 * checked against the findings, and a lying or dying provider degrades to
 * the template — never to an error.
 */

requireTestDatabase();

const suffix = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const access = new HouseholdAccessService();
const metrics = new HouseholdMetricsService();

class FakeBriefProvider implements BriefLanguageProvider {
  readonly name = "fake";
  readonly model = "fake-brief-model";
  calls = 0;
  fail = false;
  /** Builds the per-finding texts from the request itself. */
  rewrite: (finding: { key: string; templateText: string }) => string = (f) =>
    f.templateText;
  headline: string | null = null;

  isConfigured(): boolean {
    return true;
  }

  async render(request: BriefLanguageRequest): Promise<BriefLanguageResponse> {
    this.calls += 1;
    if (this.fail) throw new Error("brief provider unavailable");
    const texts: Record<string, string> = {};
    for (const finding of request.findings) {
      texts[finding.key] = this.rewrite(finding);
    }
    return {
      texts,
      headline: this.headline,
      provider: this.name,
      model: this.model,
      usage: { promptTokens: 10, completionTokens: 10 },
    };
  }
}

async function fixture(options: { aiEnabled?: boolean } = {}) {
  const db = getDb();
  const [household] = await db
    .insert(households)
    .values({ name: `Brief ${suffix()}`, baseCurrency: "SEK" })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      email: `brief-${suffix()}@example.test`,
      passwordHash: "x".repeat(60),
      displayName: "Briefläsare",
    })
    .returning();
  await db.insert(householdMembers).values({
    householdId: household.id,
    userId: user.id,
    role: "OWNER",
  });
  await db.insert(householdSettings).values({
    householdId: household.id,
    aiTransactionAnalysisEnabled: options.aiEnabled ?? false,
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

  // A little real spending so the input pipeline has something to chew on.
  for (let month = 1; month <= 3; month += 1) {
    await db.insert(sourceTransactions).values({
      householdId: household.id,
      accountId: account.id,
      bookingDate: `2026-0${month}-10`,
      amountMinor: -250_000n,
      currency: "SEK",
      description: "ICA MAXI",
      rawDescription: "ICA MAXI",
    });
  }

  const aiClassification = new AiClassificationService(access);
  const inputService = new FinancialIntelligenceInputService(access, metrics);
  const service = new FinancialBriefService(
    access,
    inputService,
    metrics,
    aiClassification,
  );
  const provider = new FakeBriefProvider();
  service.briefProviderOverride = provider;

  return { db, household, user, account, service, aiClassification, provider };
}

function aiOnConfig() {
  return {
    apiKey: "test-key",
    model: "fake-brief-model",
    enabled: true,
    dryRun: false,
    maxClustersPerRun: 25,
    timeoutMs: 5_000,
  };
}

/* ------------------------------------------------------- §37 template brief */

void test("the template brief is complete with AI off, and says so calmly (§37, §50, §61)", async () => {
  const { user, household, service, provider } = await fixture({ aiEnabled: false });

  const brief = await service.getBrief(user.id, household.id);

  assert.equal(brief.generator, "TEMPLATE");
  assert.equal(brief.model, null);
  assert.equal(provider.calls, 0, "AI off means the provider is never asked");
  assert.equal(brief.aiStatus.enabled, false);
  assert.equal(
    brief.aiStatus.message,
    "Extern AI-analys är avstängd. Systemets automatiska analys fungerar fortfarande.",
  );
  assert.ok(brief.headline.length > 0);
  assert.ok(brief.items.length <= 5, "the brief shows at most five items (§36)");
  for (const item of brief.items) {
    assert.ok(item.text.length > 10, "every item has a rendered Swedish sentence");
    assert.ok(item.explainRoute.startsWith("/"), "every item explains itself (§41)");
    assert.ok(item.explainLabel.length > 0);
  }
  // Incomplete coverage is visible, not hidden (§42): this household has one
  // account and no credit card/mortgage data, so the brief must carry the
  // coverage warning rather than declare the finances risk-free.
  assert.ok(
    brief.items.some((item) => item.type === "DATA_COVERAGE_WARNING"),
    "missing coverage is a finding",
  );
});

/* ---------------------------------------------------------- §45 snapshots */

void test("unchanged inputs reuse the persisted snapshot instead of regenerating (§45)", async () => {
  const { db, user, household, service } = await fixture();

  const first = await service.getBrief(user.id, household.id);
  assert.equal(first.fromCache, false);

  const second = await service.getBrief(user.id, household.id);
  assert.equal(second.fromCache, true);
  assert.equal(second.briefId, first.briefId);
  assert.equal(second.inputHash, first.inputHash);
  assert.deepEqual(
    second.items.map((item) => item.text),
    first.items.map((item) => item.text),
  );

  const snapshots = await db
    .select()
    .from(financialBriefSnapshots)
    .where(eq(financialBriefSnapshots.householdId, household.id));
  assert.equal(snapshots.length, 1, "one snapshot, not one per render");
});

/* -------------------------------------------------- §38–§40 AI + grounding */

void test("grounded AI prose is accepted; the numbers are the engine's (§38)", async () => {
  const { user, household, service, aiClassification, provider } = await fixture({
    aiEnabled: true,
  });
  aiClassification.configOverride = aiOnConfig();

  provider.rewrite = (finding) => `Kort sagt: ${finding.templateText}`;
  provider.headline = "Din ekonomi i korthet.";

  const brief = await service.getBrief(user.id, household.id);

  assert.equal(brief.generator, "AI");
  assert.equal(brief.model, "fake-brief-model");
  assert.equal(provider.calls, 1);
  assert.equal(brief.headline, "Din ekonomi i korthet.");
  assert.ok(brief.items.every((item) => item.text.startsWith("Kort sagt:")));
  assert.equal(
    brief.aiStatus.message,
    "Formulerad med AI utifrån systemets beräknade värden.",
  );
});

void test("§60 regression: altered numbers never reach the rendered brief", async () => {
  const { user, household, service, aiClassification, provider } = await fixture({
    aiEnabled: true,
  });
  aiClassification.configOverride = aiOnConfig();

  // The provider lies: same sentence plus an invented figure.
  provider.rewrite = (finding) => `${finding.templateText} Du sparar 9 999 kr på detta.`;
  // A headline with a number is also refused.
  provider.headline = "Du har 42 000 kr över.";

  const brief = await service.getBrief(user.id, household.id);

  assert.equal(brief.generator, "AI", "the AI pass ran");
  for (const item of brief.items) {
    assert.ok(
      !item.text.includes("9\u00a0999") && !item.text.includes("9 999"),
      "the invented number was rejected with its sentence",
    );
  }
  assert.ok(
    !brief.headline.includes("42"),
    "a numeric AI headline is refused; the template headline stands",
  );
});

/* ------------------------------------------------------- §62 provider down */

void test("a dying brief provider degrades to the template, not to an error (§50, §62)", async () => {
  const { user, household, service, aiClassification, provider } = await fixture({
    aiEnabled: true,
  });
  aiClassification.configOverride = aiOnConfig();
  provider.fail = true;

  const brief = await service.getBrief(user.id, household.id);

  assert.equal(brief.generator, "TEMPLATE", "fallback to the mandatory template");
  assert.ok(brief.items.every((item) => item.text.length > 10));
  assert.equal(
    brief.aiStatus.message,
    "AI-tjänsten kunde inte nås — texten nedan är systemets egna formuleringar.",
  );
});

/* -------------------------------------------------------- household gates */

void test("household opt-out alone keeps the brief on templates, whatever the environment says", async () => {
  const { user, household, service, aiClassification, provider } = await fixture({
    aiEnabled: false,
  });
  aiClassification.configOverride = aiOnConfig(); // environment says yes

  const brief = await service.getBrief(user.id, household.id);
  assert.equal(brief.generator, "TEMPLATE");
  assert.equal(provider.calls, 0);
  assert.equal(brief.aiStatus.enabled, false);
});
