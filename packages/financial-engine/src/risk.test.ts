import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessCoverageRisk,
  assessDebtRisk,
  assessFixedCostRisk,
  assessLiquidityRisk,
  assessVehicleFinancingRisk,
} from "./risk";

test("liquidity and debt risk scores are deterministic", () => {
  const liq = assessLiquidityRisk({
    availableCashMinor: 180_000_00n,
    monthlySpendingMinor: 40_000_00n,
  });
  assert.ok(liq.health.score > 50);
  assert.ok(liq.signal.evidence.length >= 1);

  const debt = assessDebtRisk({
    liabilitiesMinor: 4_000_000_00n,
    monthlyIncomeMinor: 80_000_00n,
    mortgageAccountId: "m1",
  });
  assert.ok(debt.signal.evidence.some((e) => e.href === "/debt"));
});

test("fixed cost coverage and vehicle signals", () => {
  const fixed = assessFixedCostRisk({
    fixedAnnualMinor: 200_000_00n,
    monthlyIncomeMinor: 80_000_00n,
  });
  assert.ok(fixed.health.score > 0);

  const cov = assessCoverageRisk({ coveragePercent: 88 });
  assert.equal(cov.health.level, "LOW");

  const veh = assessVehicleFinancingRisk({
    negativeEquity: true,
    netEquityMinor: -10_000_00n,
    vehicleId: "v1",
  });
  assert.equal(veh?.level, "HIGH");
});
