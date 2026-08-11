import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildFindings,
  composeHeadline,
  extractNumberTokens,
  formatKronor,
  formatPercent,
  isNumericallyGrounded,
  mergeAiTexts,
  rankFindings,
  renderTemplateText,
  selectBriefFindings,
  suppressDuplicates,
  type BriefFinding,
} from "./findings";

/* ------------------------------------------------------------- formatting */

test("formatKronor renders Swedish thousand groups and sign", () => {
  assert.equal(formatKronor(166_000n), "1\u00a0660\u00a0kr");
  assert.equal(formatKronor(-4_200_000n), "\u221242\u00a0000\u00a0kr");
  assert.equal(formatKronor(0n), "0\u00a0kr");
  // Rounds to whole kronor.
  assert.equal(formatKronor(150n), "2\u00a0kr");
});

test("formatPercent uses decimal comma and explicit sign", () => {
  assert.equal(formatPercent(14.1), "+14,1\u00a0%");
  assert.equal(formatPercent(-8), "\u22128,0\u00a0%");
  assert.equal(formatPercent(0), "0,0\u00a0%");
});

/* --------------------------------------------------------------- findings */

const asOf = "2026-08-11";

test("spending above baseline becomes a WARNING finding with exact fragments", () => {
  const findings = buildFindings({
    asOf,
    spendingBaseline: {
      currentMonthMinor: 1_346_000n, // 13 460 kr
      baselineMedianMinor: 1_180_000n, // 11 800 kr → +1 660 kr ≈ +14 %
      monthsObserved: 12,
      fresh: true,
    },
  });
  assert.equal(findings.length, 1);
  const finding = findings[0]!;
  assert.equal(finding.type, "SPENDING_ABOVE_BASELINE");
  assert.equal(finding.severity, "WARNING");
  assert.equal(finding.impactMinor, 166_000n);
  assert.equal(finding.fragments.amount, "1\u00a0660\u00a0kr");
  assert.ok(finding.fragments.delta!.startsWith("+14"));
});

test("small deviations produce no finding", () => {
  const findings = buildFindings({
    asOf,
    spendingBaseline: {
      currentMonthMinor: 1_020_000n,
      baselineMedianMinor: 1_000_000n, // +2 %
      monthsObserved: 12,
      fresh: true,
    },
  });
  assert.equal(findings.length, 0);
});

test("stale liquidity is omitted entirely, not shown with a caveat", () => {
  const fresh = buildFindings({
    asOf,
    liquidity: { availableMinor: 9_200_000n, requiredMinor: 5_000_000n, fresh: true },
  });
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0]!.type, "LIQUIDITY_SURPLUS");

  const stale = buildFindings({
    asOf,
    liquidity: { availableMinor: 9_200_000n, requiredMinor: 5_000_000n, fresh: false },
  });
  assert.equal(stale.length, 0, "a current-state claim from stale data is omitted");
});

test("missing coverage areas always yield a DATA_COVERAGE_WARNING", () => {
  const findings = buildFindings({
    asOf,
    coverage: { missingAreas: ["kreditkort", "bolån"] },
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.type, "DATA_COVERAGE_WARNING");
  assert.ok(renderTemplateText(findings[0]!).includes("kreditkort, bolån"));
});

/* -------------------------------------------------- ranking + suppression */

function finding(partial: Partial<BriefFinding> & { key: string }): BriefFinding {
  return {
    type: "CATEGORY_INCREASE",
    severity: "NOTICE",
    impactMinor: 0n,
    confidence: 0.8,
    fragments: {},
    values: {},
    explainRoute: "/",
    dedupeGroup: partial.key,
    asOf,
    fresh: true,
    ...partial,
  };
}

test("ranking is severity first, then impact, then confidence, deterministically", () => {
  const ranked = rankFindings([
    finding({ key: "b", severity: "WARNING", impactMinor: 100n }),
    finding({ key: "a", severity: "CRITICAL", impactMinor: 1n }),
    finding({ key: "c", severity: "WARNING", impactMinor: 500n }),
    finding({ key: "d", severity: "POSITIVE", impactMinor: 9_999n }),
  ]);
  assert.deepEqual(
    ranked.map((f) => f.key),
    ["a", "c", "b", "d"],
  );
});

test("duplicate suppression keeps one finding per dedupe group (§44)", () => {
  // Food up 14 %, restaurants up 30 %, total spending up 8 % — one story.
  const ranked = rankFindings([
    finding({
      key: "spending-above-baseline",
      type: "SPENDING_ABOVE_BASELINE",
      severity: "WARNING",
      impactMinor: 80_000n,
      dedupeGroup: "total-spending",
    }),
    finding({
      key: "category-increase-food",
      severity: "WARNING",
      impactMinor: 140_000n,
      dedupeGroup: "total-spending",
    }),
    finding({
      key: "category-increase-restaurants",
      severity: "WARNING",
      impactMinor: 30_000n,
      dedupeGroup: "total-spending",
    }),
  ]);
  const deduped = suppressDuplicates(ranked);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]!.key, "category-increase-food", "the strongest one survives");
});

test("the brief selects at most 5 items and never drops the coverage warning", () => {
  const many = [
    ...Array.from({ length: 8 }, (_, i) =>
      finding({ key: `f${i}`, severity: "WARNING", impactMinor: BigInt(1000 - i) }),
    ),
    finding({
      key: "data-coverage-warning",
      type: "DATA_COVERAGE_WARNING",
      severity: "NOTICE",
    }),
  ];
  const selected = selectBriefFindings(many);
  assert.equal(selected.length, 5);
  assert.equal(selected.at(-1)!.type, "DATA_COVERAGE_WARNING");
});

/* --------------------------------------------------------------- headline */

test("headline never says everything is fine past the evidence", () => {
  assert.equal(composeHeadline([]), "Inga avvikelser att rapportera just nu.");
  assert.equal(
    composeHeadline([finding({ key: "x", severity: "CRITICAL" })]),
    "Din ekonomi behöver uppmärksamhet.",
  );
  assert.ok(
    composeHeadline([
      finding({ key: "x", severity: "WARNING" }),
      finding({ key: "y", severity: "WARNING" }),
      finding({ key: "z", severity: "WARNING" }),
    ]).includes("Tre saker"),
  );
});

/* ------------------------------------------------------- numeric grounding */

test("number token extraction unifies Swedish grouping and decimal comma", () => {
  assert.deepEqual(extractNumberTokens("+14,1\u00a0% (1\u00a0660\u00a0kr)"), [
    "14.1",
    "1660",
  ]);
  assert.deepEqual(extractNumberTokens("från 179\u00a0kr till 219 kr"), ["179", "219"]);
});

test("§60 regression: AI may not alter +14,1 % / 1 660 kr", () => {
  const source = finding({
    key: "category-increase-food",
    type: "CATEGORY_INCREASE",
    fragments: {
      categoryName: "Mat",
      delta: "+14,1\u00a0%",
      amount: "1\u00a0660\u00a0kr",
    },
  });

  // Faithful prose: same numbers, different words → accepted.
  assert.equal(
    isNumericallyGrounded(
      "Matkostnaden ligger 14,1 % över ditt normala mönster, cirka 1 660 kr mer.",
      source,
    ),
    true,
  );

  // Altered percentage → rejected.
  assert.equal(
    isNumericallyGrounded("Matkostnaden har ökat med hela 18 % den här månaden.", source),
    false,
  );

  // Invented amount → rejected.
  assert.equal(
    isNumericallyGrounded("Du har spenderat 2 000 kr mer på mat (+14,1 %).", source),
    false,
  );
});

test("mergeAiTexts falls back to the template for any ungrounded sentence", () => {
  const source = finding({
    key: "subscription-price-x",
    type: "SUBSCRIPTION_PRICE_INCREASE",
    fragments: {
      merchant: "Netflix",
      oldPrice: "179\u00a0kr",
      newPrice: "219\u00a0kr",
      annualImpact: "480\u00a0kr",
    },
  });
  const { texts, rejectedKeys } = mergeAiTexts([source], {
    "subscription-price-x": "Netflix höjde priset till 249 kr per månad.",
  });
  assert.deepEqual(rejectedKeys, ["subscription-price-x"]);
  assert.equal(
    texts.get("subscription-price-x"),
    renderTemplateText(source),
    "the rejected AI text is replaced by the deterministic template",
  );

  const accepted = mergeAiTexts([source], {
    "subscription-price-x":
      "Netflix har blivit dyrare: 179 kr blev 219 kr, alltså 480 kr mer per år.",
  });
  assert.deepEqual(accepted.rejectedKeys, []);
  assert.ok(accepted.texts.get("subscription-price-x")!.includes("219"));
});

test("every finding type has a template and every template only uses given fragments", () => {
  const inputs = buildFindings({
    asOf,
    spendingBaseline: {
      currentMonthMinor: 1_346_000n,
      baselineMedianMinor: 1_180_000n,
      monthsObserved: 12,
      fresh: true,
    },
    categoryTrends: [
      {
        categoryKey: "food",
        categoryName: "Mat",
        changeVsBaselinePercent: 14.1,
        changeVsBaselineMinor: 166_000n,
        fresh: true,
      },
    ],
    subscriptionPriceChanges: [
      {
        merchantName: "Netflix",
        previousAmountMinor: 17_900n,
        newAmountMinor: 21_900n,
        annualImpactMinor: 48_000n,
        recurringId: "r1",
      },
    ],
    newSubscriptions: [
      { merchantName: "Spotify", monthlyAmountMinor: 11_900n, recurringId: "r2" },
    ],
    missingExpectedIncome: [
      { label: "Lön", expectedAmountMinor: 3_500_000n, expectedDate: "2026-08-25" },
    ],
    unusualTransactions: [
      { description: "STOR INKÖP", amountMinor: -1_200_000n, date: "2026-08-01" },
    ],
    liquidity: { availableMinor: 9_200_000n, requiredMinor: 5_000_000n, fresh: true },
    savingsRate: { currentPercent: 8, targetPercent: 15, fresh: true },
    reserve: { coverageMonths: 1.4, targetMonths: 3, fresh: true },
    upcomingLargeObligations: [
      { label: "Fordonsskatt", amountMinor: 450_000n, dueDate: "2026-09-01" },
    ],
    coverage: { missingAreas: ["kreditkort"] },
  });
  assert.ok(inputs.length >= 10);
  for (const item of inputs) {
    const text = renderTemplateText(item);
    assert.ok(text.length > 10, `${item.type} renders`);
    assert.ok(!text.includes("undefined"), `${item.type} has all fragments`);
    // The template's own numbers are grounded by construction.
    assert.equal(isNumericallyGrounded(text, item), true);
  }
});
