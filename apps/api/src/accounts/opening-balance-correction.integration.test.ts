import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { households, householdMembers, users } from "../db/schema";
import { accountBalanceSnapshots, accounts } from "../db/schema-economic";
import { requireTestDatabase } from "../testing/require-test-database";
import { AccountsService } from "./accounts.service";
import { HouseholdAccessService } from "../households/household-access.service";
import { AuditService } from "../audit/audit.service";
import { LedgerTruthService } from "../ledger/ledger-truth.service";

/**
 * Correcting an account's starting balance.
 *
 * Found in real use: a household imported five years of bank history into an
 * account created with an opening balance of 0. The statement began partway
 * through the account's life, so the ledger was right about all 8 184
 * transactions and still reported a net worth 115 309,05 kr below the bank — and
 * there was no way to fix it, because the opening balance could only be set when
 * the account was created.
 */

requireTestDatabase();

const suffix = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function fixture() {
  const db = getDb();
  const [household] = await db
    .insert(households)
    .values({ name: `Opening ${suffix()}`, baseCurrency: "SEK" })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      email: `opening-${suffix()}@example.test`,
      passwordHash: "x".repeat(60),
      displayName: "Ägare",
    })
    .returning();
  await db
    .insert(householdMembers)
    .values({ householdId: household.id, userId: user.id, role: "OWNER" });

  const audit = new AuditService();
  const service = new AccountsService(
    new HouseholdAccessService(),
    audit,
    new LedgerTruthService(audit),
  );
  return { household, user, service };
}

test("an account's opening balance can be corrected after history is imported", async () => {
  const { household, user, service } = await fixture();
  const db = getDb();

  // Created the way a household would before importing: starting from nothing.
  const created = await service.create(user.id, {
    householdId: household.id,
    name: "SEB Lönekonto",
    accountType: "CHECKING",
    currency: "SEK",
    openingBalanceMinor: "0",
    isShared: true,
  });

  const [before] = await db
    .select({
      opening: accounts.openingBalanceMinor,
      current: accounts.currentBalanceMinor,
    })
    .from(accounts)
    .where(eq(accounts.id, created.id));
  assert.equal(before.opening, 0n);

  // The statement said the account held 115 309,05 kr before its first row.
  const corrected = await service.update(user.id, created.id, {
    householdId: household.id,
    name: "SEB Lönekonto",
    openingBalanceMinor: "11530905",
  });
  assert.ok(corrected);

  const [after] = await db
    .select({
      opening: accounts.openingBalanceMinor,
      current: accounts.currentBalanceMinor,
    })
    .from(accounts)
    .where(eq(accounts.id, created.id));
  assert.equal(after.opening, 11_530_905n, "the starting point is corrected");
  assert.equal(
    after.current,
    11_530_905n,
    "and the cached balance every total reads follows it, rather than keeping the old start",
  );

  // One claim about where the account started, not two.
  const snapshots = await db
    .select({ reported: accountBalanceSnapshots.reportedBalanceMinor })
    .from(accountBalanceSnapshots)
    .where(eq(accountBalanceSnapshots.accountId, created.id));
  const openingClaims = snapshots.filter((row) => row.reported === 11_530_905n);
  assert.equal(openingClaims.length, 1, "the opening snapshot is corrected, not duplicated");
});

test("correcting nothing changes nothing, and the audit says which happened", async () => {
  const { household, user, service } = await fixture();
  const db = getDb();
  const created = await service.create(user.id, {
    householdId: household.id,
    name: "Sparkonto",
    accountType: "SAVINGS",
    currency: "SEK",
    openingBalanceMinor: "500000",
    isShared: true,
  });

  // Renaming must not rewrite the starting balance.
  await service.update(user.id, created.id, {
    householdId: household.id,
    name: "Sparkonto (buffert)",
  });
  const [row] = await db
    .select({ opening: accounts.openingBalanceMinor, name: accounts.name })
    .from(accounts)
    .where(eq(accounts.id, created.id));
  assert.equal(row.opening, 500_000n, "an untouched field is left alone");
  assert.equal(row.name, "Sparkonto (buffert)");

  // Sending the same value it already has is not a correction either.
  await service.update(user.id, created.id, {
    householdId: household.id,
    openingBalanceMinor: "500000",
  });
  const audit = await new AuditService().list(household.id, 50);
  const corrections = audit.items.filter(
    (item) => item.action === "account.opening_balance_correct",
  );
  assert.equal(corrections.length, 0, "no correction was recorded, because none happened");
});

test("a negative opening balance is refused", async () => {
  const { household, user, service } = await fixture();
  const created = await service.create(user.id, {
    householdId: household.id,
    name: "Konto",
    accountType: "CHECKING",
    currency: "SEK",
    openingBalanceMinor: "0",
    isShared: true,
  });
  // The schema rejects it at the edge; the service must not accept it either.
  await assert.rejects(
    () =>
      service.update(user.id, created.id, {
        householdId: household.id,
        openingBalanceMinor: "-1",
      } as never),
  );
});
