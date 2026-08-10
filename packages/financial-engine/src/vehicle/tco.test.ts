import assert from "node:assert/strict";
import { test } from "node:test";
import {
  kmToSwedishMiles,
  projectedTco,
  vehicleCashOutflow,
  vehicleCostPerKm,
  vehicleCostPerSwedishMile,
  vehicleEconomicCost,
  vehicleNetEquity,
} from "./tco";

test("economic cost excludes loan principal", () => {
  const costs = [
    { kind: "ENERGY", amountMinor: 1_200_00n, isEconomicCost: true },
    { kind: "INSURANCE", amountMinor: 450_00n, isEconomicCost: true },
    { kind: "LOAN_PRINCIPAL", amountMinor: 3_000_00n, isEconomicCost: false },
    { kind: "LOAN_INTEREST", amountMinor: 600_00n, isEconomicCost: true },
  ];
  assert.equal(vehicleCashOutflow(costs), 5_250_00n);
  assert.equal(vehicleEconomicCost(costs), 2_250_00n);
});

test("cost per km and swedish mile", () => {
  assert.equal(vehicleCostPerKm(2_250_00n, 1_500), 150n);
  assert.equal(vehicleCostPerSwedishMile(2_250_00n, 1_500), 1_500n);
  assert.equal(kmToSwedishMiles(15_000), 1_500);
});

test("equity and projected TCO", () => {
  const equity = vehicleNetEquity({
    estimatedValueMidMinor: 280_000_00n,
    remainingDebtMinor: 195_000_00n,
    sellingCostMinor: 5_000_00n,
  });
  assert.equal(equity.netEquityMinor, 80_000_00n);
  assert.equal(equity.negativeEquity, false);
  assert.equal(projectedTco(4_500_00n, 12), 54_000_00n);
});
