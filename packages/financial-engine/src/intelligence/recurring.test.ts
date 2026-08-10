import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyRecurringKind,
  detectMissingOccurrence,
  detectPriceChanges,
  detectRecurrence,
  isSubscriptionKind,
  normaliseRecurringCost,
  projectNextOccurrence,
  type RecurringOccurrence,
} from "./recurring";
import {
  groupBySignature,
  signaturesLikelySame,
  transactionSignature,
} from "./signature";
import {
  downsideVolatilityBps,
  isRobustOutlier,
  madMinor,
  medianMinor,
  percentileMinor,
  percentChange,
  riskVolatilityBps,
  trimmedMeanMinor,
} from "./statistics";

/** Occurrences on the given dates, all the same amount unless overridden. */
function stream(dates: string[], amountMinor: bigint): RecurringOccurrence[] {
  return dates.map((date) => ({ date, amountMinor }));
}

describe("robust statistics", () => {
  it("takes a median that is a value the household actually saw", () => {
    assert.equal(medianMinor([100n, 300n, 200n]), 200n);
    // Even count takes the lower middle rather than inventing a half-öre.
    assert.equal(medianMinor([100n, 200n, 300n, 400n]), 200n);
    assert.equal(medianMinor([]), null);
  });

  it("is not dragged around by one enormous month", () => {
    const ordinary = [3_000_00n, 3_100_00n, 2_900_00n, 3_050_00n, 2_950_00n];
    const withIkea = [...ordinary, 40_000_00n];
    assert.equal(medianMinor(ordinary), medianMinor(withIkea.slice(0, 5)));
    const median = medianMinor(withIkea)!;
    const mean = withIkea.reduce((a, b) => a + b, 0n) / BigInt(withIkea.length);
    assert.ok(median < mean / 2n, "the mean is somewhere the household never lived");
  });

  it("computes nearest-rank percentiles", () => {
    const values = [100n, 200n, 300n, 400n, 500n, 600n, 700n, 800n, 900n, 1000n];
    assert.equal(percentileMinor(values, 50), 500n);
    assert.equal(percentileMinor(values, 90), 900n);
    assert.equal(percentileMinor(values, 100), 1000n);
    assert.equal(percentileMinor(values, 0), 100n);
    assert.equal(percentileMinor([], 50), null);
  });

  it("trims the extremes from both ends", () => {
    const values = [1n, 100n, 101n, 102n, 103n, 104n, 10_000n];
    const trimmed = trimmedMeanMinor(values, 0.15)!;
    assert.ok(trimmed > 100n && trimmed < 110n, `got ${trimmed}`);
    // Trimming everything away still answers, rather than returning null.
    assert.equal(trimmedMeanMinor([5n], 0.49), 5n);
  });

  it("measures spread with the MAD", () => {
    assert.equal(madMinor([100n, 100n, 100n]), 0n, "a flat series has no spread");
    assert.equal(madMinor([100n, 200n, 300n]), 100n);
  });

  it("sees downside risk that the MAD is blind to", () => {
    // Two months in three identical, every third collapsing: MAD is zero because
    // most deviations are zero, but the household plainly carries risk.
    const collapsing = [1300n, 1300n, 220n, 1300n, 1300n, 220n, 1300n, 1300n, 220n];
    assert.equal(madMinor(collapsing), 0n, "the MAD cannot see this shape");
    const downside = downsideVolatilityBps(collapsing)!;
    assert.ok(downside > 5000, `downside should be large, got ${downside}`);
    assert.equal(riskVolatilityBps(collapsing), downside, "risk takes the larger measure");

    // And a steady series has no downside risk.
    assert.equal(downsideVolatilityBps([1000n, 1000n, 1000n]), 0);
  });

  it("does not report a percentage change from nothing", () => {
    assert.equal(percentChange(0n, 500n), null);
    assert.equal(percentChange(1000n, 1100n), 10);
    assert.equal(percentChange(1000n, 900n), -10);
  });

  it("flags outliers against a robust baseline", () => {
    const population = [1000n, 1010n, 990n, 1005n, 995n];
    assert.equal(isRobustOutlier(5000n, population), true);
    assert.equal(isRobustOutlier(1002n, population), false);
    // A flat population makes anything different an outlier.
    assert.equal(isRobustOutlier(101n, [100n, 100n, 100n]), true);
  });
});

describe("transaction signatures", () => {
  it("collapses the same charge across months into one group", () => {
    const a = transactionSignature("APPLE COM/BI/26-08-08");
    const b = transactionSignature("APPLE COM/BI/26-07-08");
    const c = transactionSignature("APPLE COM/BI/26-06-08");
    assert.equal(a.key, b.key);
    assert.equal(b.key, c.key);
    assert.ok(a.label.includes("APPLE"), `label was "${a.label}"`);
  });

  it("keeps genuinely different merchants apart", () => {
    const ica = transactionSignature("ICA MAXI STORMARKNAD");
    const coop = transactionSignature("COOP FORUM");
    assert.notEqual(ica.key, coop.key);
  });

  it("marks a pure reference number as opaque rather than inventing meaning", () => {
    const opaque = transactionSignature("46700280624");
    assert.equal(opaque.opaque, true);
    assert.equal(opaque.tokens.length, 0);
  });

  it("strips the payment mechanism, which is not who was paid", () => {
    const withMechanism = transactionSignature("KORTKOP ICA MAXI");
    assert.ok(!withMechanism.tokens.includes("KORTKOP"));
    assert.ok(withMechanism.tokens.includes("ICA"));
  });

  it("groups a mixed history by signature, largest first", () => {
    const transactions = [
      { rawDescription: "ICA MAXI STORMARKNAD" },
      { rawDescription: "APPLE COM/BI/26-08-08" },
      { rawDescription: "ICA MAXI STORMARKNAD" },
      { rawDescription: "APPLE COM/BI/26-07-08" },
      { rawDescription: "ICA MAXI STORMARKNAD" },
    ];
    const groups = groupBySignature(transactions);
    assert.equal(groups.length, 2);
    assert.equal(groups[0]!.transactions.length, 3, "the biggest group comes first");
    assert.equal(groups[1]!.transactions.length, 2);
  });

  it("refuses to merge a truncated store name (§4: conservative)", () => {
    const full = transactionSignature("ICA MAXI HANINGE");
    const truncated = transactionSignature("ICA MAXI HANI");
    assert.equal(
      signaturesLikelySame(full, truncated),
      false,
      "a wrongly merged merchant is worse than an unknown one",
    );
  });

  it("treats a multi-token superset as the same thing, but not a single token", () => {
    // Two shared tokens and full containment: the same merchant with a suffix.
    assert.equal(
      signaturesLikelySame(
        transactionSignature("APPLE COM BI"),
        transactionSignature("APPLE COM BI SVERIGE"),
      ),
      true,
    );
    // One shared token is a chain name, not a shop. Allowing it would merge
    // "ICA MAXI HANINGE" with "ICA KVANTUM SOLNA".
    assert.equal(
      signaturesLikelySame(
        transactionSignature("SPOTIFY AB"),
        transactionSignature("SPOTIFY AB STOCKHOLM"),
      ),
      false,
    );
  });

  it("never treats two opaque references as the same", () => {
    const a = transactionSignature("46700280624");
    const b = transactionSignature("99912345678");
    assert.equal(signaturesLikelySame(a, b), false);
  });
});

describe("recurrence detection", () => {
  it("detects a monthly subscription", () => {
    const detection = detectRecurrence(
      stream(
        ["2026-01-04", "2026-02-04", "2026-03-04", "2026-04-04", "2026-05-04", "2026-06-04"],
        -21_900n,
      ),
    );
    assert.equal(detection.frequency, "MONTHLY");
    assert.ok(detection.confidence >= 75, `confidence ${detection.confidence}`);
    assert.equal(detection.amountStable, true);
    assert.equal(detection.medianAmountMinor, 21_900n);
    assert.ok(detection.reasons.length > 0);
  });

  it("distinguishes four-weekly from monthly", () => {
    const detection = detectRecurrence(
      stream(["2026-01-01", "2026-01-29", "2026-02-26", "2026-03-26", "2026-04-23"], -50_000n),
    );
    assert.equal(detection.frequency, "FOUR_WEEKLY");
  });

  it("detects quarterly and annual", () => {
    const quarterly = detectRecurrence(
      stream(["2025-01-15", "2025-04-15", "2025-07-15", "2025-10-15"], -180_000n),
    );
    assert.equal(quarterly.frequency, "QUARTERLY");

    const annual = detectRecurrence(
      stream(["2023-06-01", "2024-06-03", "2025-05-30", "2026-06-02"], -1_200_000n),
    );
    assert.equal(annual.frequency, "ANNUAL");
  });

  it("calls a varying utility bill recurring without calling it fixed", () => {
    const detection = detectRecurrence([
      { date: "2026-01-05", amountMinor: -180_000n },
      { date: "2026-02-05", amountMinor: -240_000n },
      { date: "2026-03-05", amountMinor: -150_000n },
      { date: "2026-04-05", amountMinor: -90_000n },
      { date: "2026-05-05", amountMinor: -70_000n },
    ]);
    assert.equal(detection.frequency, "MONTHLY", "the schedule is monthly");
    assert.equal(detection.amountStable, false, "but the amount is not a fixed price");
  });

  it("does not turn frequent random spending into a subscription (§61)", () => {
    // Groceries: often, but on no schedule and at no stable amount.
    const detection = detectRecurrence([
      { date: "2026-01-03", amountMinor: -45_000n },
      { date: "2026-01-06", amountMinor: -120_000n },
      { date: "2026-01-19", amountMinor: -30_000n },
      { date: "2026-02-02", amountMinor: -210_000n },
      { date: "2026-02-04", amountMinor: -15_000n },
      { date: "2026-02-21", amountMinor: -88_000n },
    ]);
    assert.notEqual(detection.frequency, "MONTHLY");
    assert.equal(detection.frequency, "VARIABLE");
    assert.ok(detection.confidence < 60, "not confident enough to project a due date");
    assert.equal(
      projectNextOccurrence({ detection, occurrences: [] }),
      null,
      "and therefore predicts nothing",
    );
  });

  it("refuses to conclude anything from two occurrences", () => {
    const detection = detectRecurrence(stream(["2026-01-04", "2026-02-04"], -21_900n));
    assert.equal(detection.frequency, "NONE");
    assert.equal(detection.confidence, 0);
    assert.match(detection.reasons.join(" "), /för få/i);
  });

  it("is more confident about twelve occurrences than about three", () => {
    const three = detectRecurrence(stream(["2026-01-04", "2026-02-04", "2026-03-04"], -1000n));
    const twelve = detectRecurrence(
      stream(
        Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, "0")}-04`),
        -1000n,
      ),
    );
    assert.ok(twelve.confidence > three.confidence);
  });
});

describe("recurring cost normalisation", () => {
  it("turns an annual bill into a monthly figure", () => {
    const annual = normaliseRecurringCost({ amountMinor: -1_200_000n, frequency: "ANNUAL" });
    assert.equal(annual.annualMinor, 1_200_000n);
    assert.equal(annual.monthlyMinor, 100_000n);
  });

  it("normalises four-weekly to thirteen payments a year", () => {
    const fourWeekly = normaliseRecurringCost({ amountMinor: -10_000n, frequency: "FOUR_WEEKLY" });
    assert.equal(fourWeekly.annualMinor, 130_000n);
  });

  it("declines to normalise something with no period", () => {
    const variable = normaliseRecurringCost({ amountMinor: -10_000n, frequency: "VARIABLE" });
    assert.equal(variable.monthlyMinor, null);
    assert.equal(variable.annualMinor, null);
  });
});

describe("subscription price changes", () => {
  it("finds each step of a rising price and the annual impact", () => {
    // 179 → 199 → 219, as in §17.
    const result = detectPriceChanges({
      occurrences: [
        { date: "2025-01-04", amountMinor: -17_900n },
        { date: "2025-02-04", amountMinor: -17_900n },
        { date: "2025-03-04", amountMinor: -19_900n },
        { date: "2025-04-04", amountMinor: -19_900n },
        { date: "2025-05-04", amountMinor: -21_900n },
        { date: "2025-06-04", amountMinor: -21_900n },
      ],
      frequency: "MONTHLY",
    });
    assert.equal(result.changes.length, 2);
    assert.equal(result.changes[0]!.fromMinor, 17_900n);
    assert.equal(result.changes[0]!.toMinor, 19_900n);
    assert.equal(result.changes[0]!.changedOn, "2025-03-04");
    assert.equal(result.originalMinor, 17_900n);
    assert.equal(result.currentMinor, 21_900n);
    assert.equal(result.totalDifferenceMinor, 4_000n, "40 kr more per month");
    assert.equal(result.annualImpactMinor, 48_000n, "480 kr more per year");
    // 2 000 öre on a 19 900 base is 10.0%, and the first step was 11.1%.
    assert.equal(result.changes[0]!.percentChange, 11.1);
    assert.equal(result.changes[1]!.percentChange, 10);
  });

  it("ignores a one-off blip that does not hold", () => {
    const result = detectPriceChanges({
      occurrences: [
        { date: "2025-01-04", amountMinor: -10_000n },
        { date: "2025-02-04", amountMinor: -14_000n },
        { date: "2025-03-04", amountMinor: -10_000n },
        { date: "2025-04-04", amountMinor: -10_000n },
      ],
      frequency: "MONTHLY",
    });
    assert.equal(result.changes.length, 0, "a single odd month is not a price rise");
  });

  it("ignores rounding-level wobble", () => {
    const result = detectPriceChanges({
      occurrences: [
        { date: "2025-01-04", amountMinor: -10_000n },
        { date: "2025-02-04", amountMinor: -10_050n },
        { date: "2025-03-04", amountMinor: -10_050n },
      ],
      frequency: "MONTHLY",
    });
    assert.equal(result.changes.length, 0, "0.5% is not a price change worth reporting");
  });

  it("reports a decrease as readily as an increase", () => {
    const result = detectPriceChanges({
      occurrences: [
        { date: "2025-01-04", amountMinor: -21_900n },
        { date: "2025-02-04", amountMinor: -17_900n },
        { date: "2025-03-04", amountMinor: -17_900n },
      ],
      frequency: "MONTHLY",
    });
    assert.equal(result.changes.length, 1);
    assert.ok(result.changes[0]!.differenceMinor < 0n);
  });
});

describe("recurring kinds", () => {
  it("recognises the kinds that change how forecasting treats them", () => {
    const outflow = { direction: "OUTFLOW" as const, frequency: "MONTHLY" as const, amountStable: true };
    assert.equal(classifyRecurringKind({ signatureLabel: "NETFLIX", ...outflow }).kind, "SUBSCRIPTION");
    assert.equal(classifyRecurringKind({ signatureLabel: "TELIA SVERIGE", ...outflow }).kind, "TELECOM");
    assert.equal(
      classifyRecurringKind({ signatureLabel: "LÄNSFÖRSÄKRING", ...outflow }).kind,
      "INSURANCE",
    );
    assert.equal(classifyRecurringKind({ signatureLabel: "BOLÅN AMORTERING", ...outflow }).kind, "MORTGAGE");
    assert.equal(
      classifyRecurringKind({
        signatureLabel: "LÖN ARBETSGIVARE",
        direction: "INFLOW",
        frequency: "MONTHLY",
        amountStable: true,
      }).kind,
      "SALARY",
    );
  });

  it("does not let an income keyword describe an outflow", () => {
    // A payment *to* something called "lön" is not a salary.
    const result = classifyRecurringKind({
      signatureLabel: "LÖNEKONTO OVERFORING",
      direction: "OUTFLOW",
      frequency: "MONTHLY",
      amountStable: true,
    });
    assert.notEqual(result.kind, "SALARY");
  });

  it("admits when a kind is a guess rather than a match", () => {
    const guessed = classifyRecurringKind({
      signatureLabel: "OKANT FORETAG",
      direction: "OUTFLOW",
      frequency: "MONTHLY",
      amountStable: true,
    });
    assert.equal(guessed.matched, false, "the caller can tell this was inferred");
    const matched = classifyRecurringKind({
      signatureLabel: "SPOTIFY",
      direction: "OUTFLOW",
      frequency: "MONTHLY",
      amountStable: true,
    });
    assert.equal(matched.matched, true);
  });

  it("knows which kinds a household would call a subscription", () => {
    assert.equal(isSubscriptionKind("SUBSCRIPTION"), true);
    assert.equal(isSubscriptionKind("TELECOM"), true);
    assert.equal(isSubscriptionKind("MORTGAGE"), false);
    assert.equal(isSubscriptionKind("SALARY"), false);
  });
});

describe("expected transactions", () => {
  it("projects a window rather than a date, with an amount range", () => {
    const occurrences = [
      { date: "2026-05-25", amountMinor: 6_700_000n },
      { date: "2026-06-25", amountMinor: 6_800_000n },
      { date: "2026-07-25", amountMinor: 6_850_000n },
      { date: "2026-08-25", amountMinor: 6_800_000n },
    ];
    const detection = detectRecurrence(occurrences);
    const expected = projectNextOccurrence({ detection, occurrences })!;
    assert.ok(expected, "a confident monthly stream projects");
    assert.ok(expected.earliestDate < expected.latestDate, "a window, not a day");
    assert.ok(expected.earliestDate > "2026-09-01" && expected.latestDate < "2026-10-10");
    assert.ok(expected.lowAmountMinor <= expected.expectedAmountMinor);
    assert.ok(expected.highAmountMinor >= expected.expectedAmountMinor);
  });

  it("projects nothing from a stream it is not confident about", () => {
    const occurrences = stream(["2026-01-04", "2026-02-04"], -1000n);
    const detection = detectRecurrence(occurrences);
    assert.equal(projectNextOccurrence({ detection, occurrences }), null);
  });

  it("only calls an occurrence missing after the window and a grace period (§20)", () => {
    const expected = {
      earliestDate: "2026-08-24",
      latestDate: "2026-08-26",
      expectedAmountMinor: 6_800_000n,
      lowAmountMinor: 6_800_000n,
      highAmountMinor: 6_800_000n,
      confidence: 90,
    };
    assert.equal(
      detectMissingOccurrence({ expected, asOf: "2026-08-26" }).missing,
      false,
      "not missing on the day it was due",
    );
    assert.equal(
      detectMissingOccurrence({ expected, asOf: "2026-08-28" }).missing,
      false,
      "still inside the grace period",
    );
    const overdue = detectMissingOccurrence({ expected, asOf: "2026-09-05" });
    assert.equal(overdue.missing, true);
    // Window ends 08-26, plus three days grace is 08-29; 09-05 is seven days on.
    assert.equal(overdue.daysOverdue, 7);
  });
});
