import assert from "node:assert/strict";
import { test } from "node:test";
import {
  amountMinorStringSchema,
  createAccountSchema,
  createAssetDepreciationSchema,
  createCategorySchema,
  createCashExpenseSchema,
  createInternalTransferSchema,
  createMortgagePaymentSchema,
  currencyCodeSchema,
  inviteMemberSchema,
  isoDateSchema,
  jobPayloadSchema,
  listMerchantsQuerySchema,
  listTransactionsQuerySchema,
  transactionSplitsSchema,
  updateSettingsSchema,
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

test("create category rejects mass-assignment and invalid key format", () => {
  assert.equal(
    createCategorySchema.safeParse({
      householdId: "11111111-1111-4111-8111-111111111111",
      name: "Mat",
      isSystem: true,
    }).success,
    false,
  );
  assert.equal(
    createCategorySchema.safeParse({
      householdId: "11111111-1111-4111-8111-111111111111",
      name: "Mat",
      key: "Mat Uppercase",
    }).success,
    false,
  );
  assert.equal(
    createCategorySchema.safeParse({
      householdId: "11111111-1111-4111-8111-111111111111",
      name: "Mat",
      kind: "expense",
      key: "mat",
    }).success,
    true,
  );
});

test("invite member defaults role to ADULT and rejects OWNER invites", () => {
  const parsed = inviteMemberSchema.safeParse({
    householdId: "11111111-1111-4111-8111-111111111111",
    email: "test@example.com",
  });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.role, "ADULT");

  assert.equal(
    inviteMemberSchema.safeParse({
      householdId: "11111111-1111-4111-8111-111111111111",
      email: "test@example.com",
      role: "OWNER",
    }).success,
    false,
  );
});

test("list merchants query requires householdId", () => {
  assert.equal(listMerchantsQuerySchema.safeParse({}).success, false);
  assert.equal(
    listMerchantsQuerySchema.safeParse({
      householdId: "11111111-1111-4111-8111-111111111111",
      q: "ica",
    }).success,
    true,
  );
});

test("cash expense requires positive amount and rejects unknown fields", () => {
  const base = {
    householdId: "11111111-1111-4111-8111-111111111111",
    cashAccountId: "11111111-1111-4111-8111-111111111112",
    amountMinor: "10000",
    occurredOn: "2026-08-01",
  };
  assert.equal(createCashExpenseSchema.safeParse(base).success, true);
  assert.equal(
    createCashExpenseSchema.safeParse({ ...base, amountMinor: "0" }).success,
    false,
  );
  assert.equal(
    createCashExpenseSchema.safeParse({ ...base, skipAuthCheck: true }).success,
    false,
  );
});

test("update settings bounds new financial policy percentages 0-100", () => {
  assert.equal(
    updateSettingsSchema.safeParse({
      householdId: "11111111-1111-4111-8111-111111111111",
      financialPolicies: { savingsRateTargetPercent: 101 },
    }).success,
    false,
  );
  assert.equal(
    updateSettingsSchema.safeParse({
      householdId: "11111111-1111-4111-8111-111111111111",
      financialPolicies: { maxFixedCostRatioPercent: -1 },
    }).success,
    false,
  );
  assert.equal(
    updateSettingsSchema.safeParse({
      householdId: "11111111-1111-4111-8111-111111111111",
      financialPolicies: {
        savingsRateTargetPercent: 25.5,
        maxFixedCostRatioPercent: 45,
        investmentContributionTargetMinor: "150000",
      },
    }).success,
    true,
  );
});
