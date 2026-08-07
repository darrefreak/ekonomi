import assert from "node:assert/strict";
import { test } from "node:test";
import {
  amountMinorStringSchema,
  createAccountSchema,
  createAssetDepreciationSchema,
  createInternalTransferSchema,
  createMortgagePaymentSchema,
  currencyCodeSchema,
  isoDateSchema,
  jobPayloadSchema,
  listTransactionsQuerySchema,
  transactionSplitsSchema,
  updateTransactionSchema,
} from "./index";

test("money minor rejects scientific / float / empty", () => {
  assert.equal(amountMinorStringSchema.safeParse("1e3").success, false);
  assert.equal(amountMinorStringSchema.safeParse("12.34").success, false);
  assert.equal(amountMinorStringSchema.safeParse("").success, false);
  assert.equal(amountMinorStringSchema.safeParse("01").success, false);
  assert.equal(amountMinorStringSchema.safeParse("123450").success, true);
  assert.equal(amountMinorStringSchema.safeParse("-50").success, true);
});

test("currency rejects malformed codes", () => {
  assert.equal(currencyCodeSchema.safeParse("SEKK").success, false);
  assert.equal(currencyCodeSchema.safeParse("123").success, false);
  assert.equal(currencyCodeSchema.safeParse("").success, false);
  assert.equal(currencyCodeSchema.safeParse("SEK").success, true);
});

test("iso dates reject impossible calendar days", () => {
  assert.equal(isoDateSchema.safeParse("2026-02-30").success, false);
  assert.equal(isoDateSchema.safeParse("2026-13-01").success, false);
  assert.equal(isoDateSchema.safeParse("2026-08-01").success, true);
});

test("strict write schemas reject unknown fields (mass assignment)", () => {
  const bad = createInternalTransferSchema.safeParse({
    householdId: "11111111-1111-4111-8111-111111111111",
    fromAccountId: "11111111-1111-4111-8111-111111111112",
    toAccountId: "11111111-1111-4111-8111-111111111113",
    amountMinor: "2000000",
    occurredOn: "2026-08-01",
    isAdmin: true,
    balanceOverride: "999",
  });
  assert.equal(bad.success, false);

  const acct = createAccountSchema.safeParse({
    householdId: "11111111-1111-4111-8111-111111111111",
    name: "Test",
    accountType: "CHECKING",
    currentBalanceMinor: "99999",
  });
  assert.equal(acct.success, false);
});

test("depreciation schema requires positive amount and valid ids", () => {
  assert.equal(
    createAssetDepreciationSchema.safeParse({
      householdId: "not-a-uuid",
      assetAccountId: "11111111-1111-4111-8111-111111111112",
      expenseAccountId: "11111111-1111-4111-8111-111111111113",
      amountMinor: "2000000",
      occurredOn: "2026-08-01",
    }).success,
    false,
  );
  assert.equal(
    createAssetDepreciationSchema.safeParse({
      householdId: "11111111-1111-4111-8111-111111111111",
      assetAccountId: "11111111-1111-4111-8111-111111111112",
      expenseAccountId: "11111111-1111-4111-8111-111111111113",
      amountMinor: "0",
      occurredOn: "2026-08-01",
    }).success,
    false,
  );
});

test("mortgage split fields must be positive", () => {
  const ok = createMortgagePaymentSchema.safeParse({
    householdId: "11111111-1111-4111-8111-111111111111",
    cashAccountId: "11111111-1111-4111-8111-111111111112",
    mortgageAccountId: "11111111-1111-4111-8111-111111111113",
    interestExpenseAccountId: "11111111-1111-4111-8111-111111111114",
    principalMinor: "1000000",
    interestMinor: "800000",
    occurredOn: "2026-08-01",
  });
  assert.equal(ok.success, true);
});

test("split totals must equal source amount", () => {
  const mismatch = transactionSplitsSchema.safeParse({
    sourceAmountMinor: "1800000",
    splits: [
      { amountMinor: "1000000", memo: "principal" },
      { amountMinor: "700000", memo: "interest" },
    ],
  });
  assert.equal(mismatch.success, false);

  const match = transactionSplitsSchema.safeParse({
    sourceAmountMinor: "1800000",
    splits: [
      { amountMinor: "1000000", memo: "principal" },
      { amountMinor: "800000", memo: "interest" },
    ],
  });
  assert.equal(match.success, true);
});

test("job payloads require valid household for reconcile", () => {
  assert.equal(
    jobPayloadSchema.safeParse({
      type: "RECONCILE_ACCOUNT_BALANCES",
      householdId: "system",
    }).success,
    false,
  );
  assert.equal(
    jobPayloadSchema.safeParse({
      type: "RECONCILE_ACCOUNT_BALANCES",
      householdId: "11111111-1111-4111-8111-111111111111",
      asOf: "2026-08-01",
    }).success,
    true,
  );
  assert.equal(
    jobPayloadSchema.safeParse({
      type: "HEALTH_CHECK",
      householdId: "system",
    }).success,
    true,
  );
});

test("transaction list query bounds limit and dates", () => {
  assert.equal(
    listTransactionsQuerySchema.safeParse({
      householdId: "11111111-1111-4111-8111-111111111111",
      limit: "-1",
    }).success,
    false,
  );
  assert.equal(
    listTransactionsQuerySchema.safeParse({
      householdId: "11111111-1111-4111-8111-111111111111",
      limit: "9999",
    }).success,
    false,
  );
  assert.equal(
    listTransactionsQuerySchema.safeParse({
      householdId: "11111111-1111-4111-8111-111111111111",
      from: "2026-99-01",
    }).success,
    false,
  );
  assert.equal(
    listTransactionsQuerySchema.safeParse({
      householdId: "11111111-1111-4111-8111-111111111111",
      from: "2026-08-01",
      to: "2026-01-01",
    }).success,
    false,
  );
  assert.equal(
    listTransactionsQuerySchema.safeParse({
      householdId: "11111111-1111-4111-8111-111111111111",
      limit: "50",
      from: "2026-01-01",
      to: "2026-08-01",
    }).success,
    true,
  );
});

test("vehicle write rejects negative odometer and isofix > seats", async () => {
  const { vehicleWriteSchema } = await import("./vehicles");
  assert.equal(
    vehicleWriteSchema.safeParse({
      householdId: "11111111-1111-4111-8111-111111111111",
      name: "Bil",
      make: "Volvo",
      model: "XC60",
      modelYear: 2020,
      fuelType: "PETROL",
      ownershipType: "OWNED",
      currentOdometerKm: -1,
    }).success,
    false,
  );
  assert.equal(
    vehicleWriteSchema.safeParse({
      householdId: "11111111-1111-4111-8111-111111111111",
      name: "Bil",
      make: "Volvo",
      model: "XC60",
      modelYear: 2020,
      fuelType: "PETROL",
      ownershipType: "OWNED",
      seats: 5,
      isofixCount: 8,
    }).success,
    false,
  );
});

test("update transaction rejects unknown privilege fields", () => {
  const bad = updateTransactionSchema.safeParse({
    householdId: "11111111-1111-4111-8111-111111111111",
    notes: "ok",
    householdRole: "OWNER",
  });
  assert.equal(bad.success, false);
});
