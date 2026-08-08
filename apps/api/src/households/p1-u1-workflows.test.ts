import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { households, householdMembers, users } from "../db/schema";
import { categories } from "../db/schema-economic";
import { AuditService } from "../audit/audit.service";
import { AccountsService } from "../accounts/accounts.service";
import { TransactionsService } from "../transactions/transactions.service";
import { EconomicEventsService } from "../ledger/economic-events.service";
import { LedgerTruthService } from "../ledger/ledger-truth.service";
import { HouseholdAccessService } from "./household-access.service";
import { MembersService } from "./members.service";

async function setup() {
  if (!process.env.DATABASE_URL) return null;
  const db = getDb();

  const [household] = await db
    .insert(households)
    .values({ name: `P1-U1 ${Date.now()}`, baseCurrency: "SEK" })
    .returning();

  const [owner] = await db
    .insert(users)
    .values({
      email: `p1u1-owner-${Date.now()}@example.test`,
      passwordHash: "test-hash",
      displayName: "Owner",
    })
    .returning();

  const [ownerMember] = await db
    .insert(householdMembers)
    .values({ householdId: household.id, userId: owner.id, role: "OWNER" })
    .returning();

  return { household, owner, ownerMember, db };
}

test("P1-U1: categories CRUD respects system protection and archive filter", async () => {
  const ctx = await setup();
  if (!ctx) return;
  const { household, owner } = ctx;

  const access = new HouseholdAccessService();
  const audit = new AuditService();
  const transactions = new TransactionsService(access, audit);

  const created = await transactions.createCategory(owner.id, {
    householdId: household.id,
    name: "Nöjen & Fritid",
    kind: "expense",
  });
  assert.equal(created.key, "nojen_fritid");
  assert.equal(created.isSystem, false);
  assert.equal(created.archivedAt, null);

  const updated = await transactions.updateCategory(owner.id, created.id, {
    householdId: household.id,
    name: "Nöje",
  });
  assert.equal(updated.name, "Nöje");

  const listBefore = await transactions.listCategories(owner.id, household.id);
  assert.ok(listBefore.items.some((c) => c.id === created.id));

  const archived = await transactions.archiveCategory(
    owner.id,
    household.id,
    created.id,
  );
  assert.ok(archived.archivedAt);

  const listAfterDefault = await transactions.listCategories(
    owner.id,
    household.id,
  );
  assert.ok(!listAfterDefault.items.some((c) => c.id === created.id));

  const listWithArchived = await transactions.listCategories(
    owner.id,
    household.id,
    { includeArchived: true },
  );
  assert.ok(listWithArchived.items.some((c) => c.id === created.id));

  // System categories cannot be renamed or archived.
  const db = getDb();
  const [systemCategory] = await db
    .insert(categories)
    .values({
      householdId: household.id,
      key: `system_test_${Date.now()}`,
      name: "System Test",
      kind: "expense",
      isSystem: true,
    })
    .returning();

  await assert.rejects(() =>
    transactions.updateCategory(owner.id, systemCategory.id, {
      householdId: household.id,
      name: "Hacked",
    }),
  );
  await assert.rejects(() =>
    transactions.archiveCategory(owner.id, household.id, systemCategory.id),
  );
});

test("P1-U1: merchants list is scoped to household", async () => {
  const ctx = await setup();
  if (!ctx) return;
  const { household, owner } = ctx;

  const access = new HouseholdAccessService();
  const audit = new AuditService();
  const transactions = new TransactionsService(access, audit);

  const result = await transactions.listMerchants(owner.id, household.id);
  assert.deepEqual(result.items, []);
});

test("P1-U1: AccountsService sets/validates ownerMemberId and audits changes", async () => {
  const ctx = await setup();
  if (!ctx) return;
  const { household, owner, ownerMember } = ctx;

  const access = new HouseholdAccessService();
  const audit = new AuditService();
  const accountsService = new AccountsService(access, audit);

  const account = await accountsService.create(owner.id, {
    householdId: household.id,
    name: "Privat konto",
    accountType: "CHECKING",
    currency: "SEK",
    ownerMemberId: ownerMember.id,
    isShared: false,
    openingBalanceMinor: "0",
  });
  assert.equal(account.ownerMemberId, ownerMember.id);

  // ownerMemberId must belong to the same household.
  await assert.rejects(() =>
    accountsService.create(owner.id, {
      householdId: household.id,
      name: "Invalid owner",
      accountType: "CHECKING",
      currency: "SEK",
      isShared: true,
      ownerMemberId: "11111111-1111-4111-8111-111111111111",
      openingBalanceMinor: "0",
    }),
  );

  const updated = await accountsService.update(owner.id, account.id, {
    householdId: household.id,
    name: "Privat konto (uppdaterat)",
  });
  assert.equal(updated.ownerMemberId, ownerMember.id);

  const archived = await accountsService.archive(
    owner.id,
    household.id,
    account.id,
  );
  assert.ok(archived.archivedAt);
});

test("P1-U1: invite -> accept -> role update -> remove member workflow", async () => {
  const ctx = await setup();
  if (!ctx) return;
  const { household, owner, db } = ctx;

  const access = new HouseholdAccessService();
  const audit = new AuditService();
  const members = new MembersService(access, audit);

  const inviteeEmail = `p1u1-invitee-${Date.now()}@example.test`;
  const invitation = await members.inviteMember(owner.id, household.id, {
    householdId: household.id,
    email: inviteeEmail,
    role: "ADULT",
  });
  assert.equal(invitation.status, "PENDING");
  assert.equal(invitation.email, inviteeEmail.toLowerCase());

  const [invitee] = await db
    .insert(users)
    .values({
      email: inviteeEmail,
      passwordHash: "test-hash",
      displayName: "Invitee",
    })
    .returning();

  // Fetch the raw token directly (not exposed on the DTO by design).
  const { householdInvitations } = await import("../db/schema");
  const [rawInvite] = await db
    .select()
    .from(householdInvitations)
    .where(eq(householdInvitations.id, invitation.id))
    .limit(1);

  const accepted = await members.acceptInvite(
    invitee.id,
    inviteeEmail,
    rawInvite.token,
  );
  assert.equal(accepted.householdId, household.id);
  assert.equal(accepted.role, "ADULT");

  const promoted = await members.updateMemberRole(
    owner.id,
    household.id,
    accepted.memberId,
    { householdId: household.id, role: "ADMIN" },
  );
  assert.equal(promoted.role, "ADMIN");

  // Cannot demote the last OWNER.
  const [ownerMemberRow] = await db
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.userId, owner.id))
    .limit(1);
  await assert.rejects(() =>
    members.updateMemberRole(owner.id, household.id, ownerMemberRow.id, {
      householdId: household.id,
      role: "ADMIN",
    }),
  );
  await assert.rejects(() =>
    members.removeMember(owner.id, household.id, ownerMemberRow.id),
  );

  const removed = await members.removeMember(
    owner.id,
    household.id,
    accepted.memberId,
  );
  assert.equal(removed.ok, true);
});

test("P1-U1: invitation cancel only works while pending", async () => {
  const ctx = await setup();
  if (!ctx) return;
  const { household, owner } = ctx;

  const access = new HouseholdAccessService();
  const audit = new AuditService();
  const members = new MembersService(access, audit);

  const invitation = await members.inviteMember(owner.id, household.id, {
    householdId: household.id,
    email: `p1u1-cancel-${Date.now()}@example.test`,
    role: "VIEWER",
  });

  const cancelled = await members.cancelInvitation(
    owner.id,
    household.id,
    invitation.id,
  );
  assert.equal(cancelled.status, "CANCELLED");

  await assert.rejects(() =>
    members.cancelInvitation(owner.id, household.id, invitation.id),
  );
});

test("P1-U1: createCashIncome mirrors createCashExpense and auto-resolves system books", async () => {
  const ctx = await setup();
  if (!ctx) return;
  const { household } = ctx;

  const audit = new AuditService();
  const ledger = new LedgerTruthService(audit);
  const events = new EconomicEventsService(ledger, audit);

  const db = getDb();
  const { accounts } = await import("../db/schema-economic");
  const [cashAccount] = await db
    .insert(accounts)
    .values({
      householdId: household.id,
      name: "Cash",
      accountType: "CHECKING",
      openingBalanceMinor: 0n,
      currentBalanceMinor: 0n,
      isShared: true,
    })
    .returning();

  const expenseEvent = await events.createCashExpense({
    householdId: household.id,
    cashAccountId: cashAccount.id,
    amountMinor: 5000n,
    occurredOn: "2026-08-01",
    description: "Matvaror",
    notes: "test note",
    merchantName: "ICA",
  });
  assert.equal(expenseEvent.eventType, "EXPENSE");
  assert.equal(expenseEvent.expenseAmountMinor.toString(), "5000");

  const incomeEvent = await events.createCashIncome({
    householdId: household.id,
    cashAccountId: cashAccount.id,
    amountMinor: 250000n,
    occurredOn: "2026-08-01",
    description: "Lön",
    notes: "salary",
  });
  assert.equal(incomeEvent.eventType, "INCOME");
  assert.equal(incomeEvent.incomeAmountMinor.toString(), "250000");

  // Both system books should now exist for this household.
  const expenseBook = await events.resolveExpenseBook(household.id);
  const incomeBook = await events.resolveIncomeBook(household.id);
  assert.equal(expenseBook.accountType, "EXPENSE");
  assert.equal(incomeBook.accountType, "INCOME");
  assert.equal(expenseBook.isSystem, true);
  assert.equal(incomeBook.isSystem, true);
});

test("P1-U1: opening balance establishes position without period income/expense", async () => {
  const ctx = await setup();
  if (!ctx) return;
  const { household, owner } = ctx;

  const access = new HouseholdAccessService();
  const audit = new AuditService();
  const accountsService = new AccountsService(access, audit);
  const metrics = new (
    await import("../metrics/household-metrics.service")
  ).HouseholdMetricsService();

  const asset = await accountsService.create(owner.id, {
    householdId: household.id,
    name: "Sparkonto öppning",
    accountType: "SAVINGS",
    currency: "SEK",
    openingBalanceMinor: "5000000", // 50 000 SEK
    isShared: true,
  });
  assert.equal(asset.currentBalance.amountMinor, "5000000");

  const liability = await accountsService.create(owner.id, {
    householdId: household.id,
    name: "Lån öppning",
    accountType: "LOAN",
    currency: "SEK",
    openingBalanceMinor: "20000000", // 200 000 SEK
    isShared: true,
  });
  assert.equal(liability.currentBalance.amountMinor, "20000000");

  const asOf = "2026-08-01";
  const period = await metrics.periodEventTotals(
    household.id,
    "2026-08-01",
    "2026-08-31",
  );
  assert.equal(period.incomeMinor, 0n);
  assert.equal(period.spendingMinor, 0n);

  const snap = await metrics.getFinancialSnapshot(household.id, "SEK", asOf);
  assert.equal(snap.position.availableCash.amountMinor, 5_000_000n);
  assert.equal(snap.position.liabilities.amountMinor, 20_000_000n);
  assert.equal(snap.incomeMinor, 0n);
  assert.equal(snap.spendingMinor, 0n);
});

