import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createAccountSchema, updateTransactionSchema } from "@ffos/schemas";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import { accounts, sourceTransactions } from "../db/schema-economic";
import { AccountsService } from "./accounts.service";
import { TransactionsService } from "../transactions/transactions.service";
import type { HouseholdAccessService } from "../households/household-access.service";
import type { AuditService } from "../audit/audit.service";

test("createAccountSchema requires household and name", () => {
  const parsed = createAccountSchema.parse({
    householdId: "11111111-1111-4111-8111-111111111111",
    name: "Testkonto",
    accountType: "CHECKING",
  });
  assert.equal(parsed.currency, "SEK");
  assert.equal(parsed.openingBalanceMinor, "0");
});

test("updateTransactionSchema accepts classification fields", () => {
  const parsed = updateTransactionSchema.parse({
    householdId: "11111111-1111-4111-8111-111111111111",
    categoryId: null,
    notes: "ok",
    tags: ["mat"],
    isExcluded: true,
  });
  assert.equal(parsed.isExcluded, true);
  assert.deepEqual(parsed.tags, ["mat"]);
});

test("account create update archive and transaction patch against DB", async () => {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  const [household] = await db.select().from(households).limit(1);
  if (!household) return; // skip if DB empty in CI without seed

  const access = {
    requireMembership: async () => ({
      household,
      member: { id: "member", role: "OWNER" },
    }),
    requireCanWrite: async () => ({
      household,
      member: { id: "member", role: "OWNER" },
    }),
    accountVisibility: async () => "full" as const,
    projectAccountListItem: <T>(item: T) => item,
    projectTransactionItem: <T>(item: T) => item,
  } as unknown as HouseholdAccessService;

  const audit = {
    record: async () => ({}) as never,
  } as unknown as AuditService;

  const accountsService = new AccountsService(access, audit);
  const txService = new TransactionsService(access, audit);

  const created = await accountsService.create("user-1", {
    householdId: household.id,
    name: `WSB Test ${Date.now()}`,
    accountType: "CHECKING",
    currency: "SEK",
    provider: "TestBank",
    isShared: true,
    openingBalanceMinor: "10000",
  });
  assert.equal(created.provider, "TestBank");
  assert.equal(created.currentBalance.amountMinor, "10000");

  const updated = await accountsService.update("user-1", created.id, {
    householdId: household.id,
    name: `${created.name} updated`,
    provider: "TestBank2",
  });
  assert.equal(updated.name.endsWith("updated"), true);
  assert.equal(updated.provider, "TestBank2");

  const [tx] = await db
    .select({ id: sourceTransactions.id })
    .from(sourceTransactions)
    .where(eq(sourceTransactions.householdId, household.id))
    .limit(1);
  if (tx) {
    const detail = await txService.update("user-1", tx.id, {
      householdId: household.id,
      notes: "workstream-b-test",
      tags: ["wsb"],
      isExcluded: false,
    });
    assert.equal(detail.notes, "workstream-b-test");
    assert.deepEqual(detail.tags, ["wsb"]);
  }

  const archived = await accountsService.archive("user-1", household.id, created.id);
  assert.ok(archived.archivedAt);

  const listed = await accountsService.list("user-1", household.id);
  assert.equal(
    listed.items.some((a) => a.id === created.id),
    false,
  );

  await db.delete(accounts).where(eq(accounts.id, created.id));
});
