import assert from "node:assert/strict";
import { requireTestDatabase } from "../testing/require-test-database";
import { requireDemoAccount } from "../testing/demo-fixture";
import { test } from "node:test";
import { debtResponseSchema } from "@ffos/schemas";
import type { HouseholdAccessService } from "../households/household-access.service";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";
import { DebtService } from "./debt.service";

test("debt list exposes principal vs interest and rate scenarios", async () => {
  requireTestDatabase();
  const { household } = await requireDemoAccount("MORTGAGE");

  const access = {
    requireMembership: async () => ({
      household,
      member: { id: "member", role: "OWNER" },
    }),
  } as unknown as HouseholdAccessService;

  const service = new DebtService(access, new HouseholdMetricsService());
  const list = debtResponseSchema.parse(
    await service.list("user-1", household.id),
  );
  assert.ok(list.items.length >= 1);
  assert.ok(BigInt(list.totals.outstanding.amountMinor) > 0n);

  const mtg = list.items.find((i) => i.accountType === "MORTGAGE");
  assert.ok(mtg);
  assert.ok(mtg!.trailingPaymentCount >= 0);
  if (mtg!.interestRateBps != null && mtg!.interestRateBps > 0) {
    assert.ok(mtg!.rateScenarios.length >= 1);
    assert.ok(
      BigInt(mtg!.rateScenarios[0]!.monthlyInterestDelta.amountMinor) > 0n,
    );
  }

  const detail = await service.detail("user-1", household.id, mtg!.id);
  assert.equal(detail.item.id, mtg!.id);
  assert.ok(Array.isArray(detail.payments));
});
