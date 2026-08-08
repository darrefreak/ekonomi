import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateLifestyleCreep } from "./lifestyle-creep";
import {
  detectContractRenewalOpportunity,
  detectLifestyleCreepOpportunity,
  detectMortgageRateOpportunity,
  detectSubscriptionTrimOpportunity,
  rankOpportunities,
} from "./opportunities";

test("mortgage and subscription detectors fire on thresholds", () => {
  const m = detectMortgageRateOpportunity({
    mortgageInterestAnnualMinor: 80_000_00n,
    mortgageAccountId: "acc-1",
  });
  assert.ok(m);
  assert.ok((m!.estimatedAnnualSavingMinor ?? 0n) > 0n);
  assert.ok(m!.estimateBasis?.includes("heuristik"));
  assert.ok(m!.evidence.some((e) => e.href.includes("/debt")));

  const s = detectSubscriptionTrimOpportunity({
    subscriptionAnnualMinor: 6_000_00n,
    subscriptionIds: ["sub-1"],
  });
  assert.ok(s);
  assert.equal(s!.detectorKey, "subs-trim");
  assert.ok(s!.estimateBasis?.includes("20"));
});

test("contract renewal and lifestyle creep detectors", () => {
  const c = detectContractRenewalOpportunity({
    asOf: "2026-08-01",
    contracts: [
      {
        id: "c1",
        name: "El",
        renewalDate: "2026-09-15",
        endDate: null,
      },
    ],
  });
  assert.ok(c);
  assert.equal(c!.evidence[0]?.id, "c1");

  const creep = calculateLifestyleCreep({
    asOf: "2026-08-01",
    monthlyPoints: [
      ...Array.from({ length: 12 }, (_, i) => ({
        month: `2025-${String(i + 1).padStart(2, "0")}`,
        spendingMinor: 30_000_00n,
      })),
      { month: "2026-05", spendingMinor: 40_000_00n },
      { month: "2026-06", spendingMinor: 40_000_00n },
      { month: "2026-07", spendingMinor: 40_000_00n },
    ],
  });
  const opp = detectLifestyleCreepOpportunity(creep);
  assert.ok(opp);
  assert.equal(rankOpportunities([mNull(), opp, c]).length, 2);
});

function mNull() {
  return detectMortgageRateOpportunity({ mortgageInterestAnnualMinor: 0n });
}
