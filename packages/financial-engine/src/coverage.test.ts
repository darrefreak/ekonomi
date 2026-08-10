import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateFinancialCoverage } from "./coverage";

test("coverage percent reflects present/warning/missing", () => {
  const result = calculateFinancialCoverage({
    hasChecking: true,
    hasSavings: true,
    hasCreditCard: true,
    hasMortgage: true,
    hasInvestments: true,
    hasTaxAccount: false,
    hasPension: false,
    hasInsuranceSignal: true,
    hasCsn: false,
  });
  assert.ok(result.percent >= 60 && result.percent <= 90);
  assert.equal(result.areas.find((a) => a.key === "csn")?.status, "missing");
});
