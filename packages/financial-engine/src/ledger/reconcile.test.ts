import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcileReportedVsLedger } from "./reconcile";

test("reconcile MATCHED when reported equals ledger", () => {
  const r = reconcileReportedVsLedger({
    accountId: "a1",
    currency: "SEK",
    asOf: "2026-08-01",
    reportedBalanceMinor: 100_00n,
    ledgerCalculatedBalanceMinor: 100_00n,
  });
  assert.equal(r.status, "MATCHED");
  assert.equal(r.differenceMinor, 0n);
});

test("reconcile MISMATCH keeps both sides and difference", () => {
  const r = reconcileReportedVsLedger({
    accountId: "a1",
    currency: "SEK",
    asOf: "2026-08-01",
    reportedBalanceMinor: 128_850_00n,
    ledgerCalculatedBalanceMinor: 128_400_00n,
  });
  assert.equal(r.status, "MISMATCH");
  assert.equal(r.differenceMinor, 450_00n);
  assert.equal(r.ledgerCalculatedBalanceMinor, 128_400_00n);
  assert.equal(r.reportedBalanceMinor, 128_850_00n);
});

test("reconcile MISSING_REPORTED_BALANCE", () => {
  const r = reconcileReportedVsLedger({
    accountId: "a1",
    currency: "SEK",
    asOf: "2026-08-01",
    reportedBalanceMinor: null,
    ledgerCalculatedBalanceMinor: 50_00n,
  });
  assert.equal(r.status, "MISSING_REPORTED_BALANCE");
});
