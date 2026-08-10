import assert from "node:assert/strict";
import test from "node:test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { households, householdMembers, users } from "../db/schema";
import {
  accountBalanceSnapshots,
  accounts,
  financialEvents,
  importBatches,
  ledgerEntries,
  ledgerPostings,
  rawImportRecords,
  sourceTransactions,
} from "../db/schema-economic";
import { requireTestDatabase } from "../testing/require-test-database";
import { StatementImportService } from "./statement-import.service";
import { HouseholdAccessService } from "../households/household-access.service";
import { ObjectStorageService } from "../storage/object-storage.service";
import { LedgerTruthService } from "../ledger/ledger-truth.service";
import { AuditService } from "../audit/audit.service";
import {
  buildSebCsv,
  generateSyntheticStatement,
  referenceStatementRows,
} from "./seb/__fixtures__/make-statement";
import { SEB_HEADERS } from "./seb/seb-csv-format";

/**
 * The statement importer tested against a real database.
 *
 * These are the requirements a unit test cannot reach: that the same file twice
 * produces one economic effect, that an overlapping export imports only what is
 * new, that another household's account is unreachable, and that the ledger
 * still balances afterwards.
 *
 * Every fixture is synthetic. No real bank statement is used here.
 */

requireTestDatabase();

const suffix = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** A household with a member, a bank account, and the service wired to it. */
async function fixture(
  options: {
    accountCurrency?: string;
    archived?: boolean;
    /** Match the statement's starting balance, or the two disagree by the gap. */
    openingBalanceMinor?: bigint;
  } = {},
) {
  const db = getDb();
  const [household] = await db
    .insert(households)
    .values({ name: `SEB import ${suffix()}`, baseCurrency: "SEK" })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      email: `seb-${suffix()}@example.test`,
      passwordHash: "x".repeat(60),
      displayName: "Importör",
    })
    .returning();
  await db.insert(householdMembers).values({
    householdId: household.id,
    userId: user.id,
    role: "OWNER",
  });
  const [account] = await db
    .insert(accounts)
    .values({
      householdId: household.id,
      name: "SEB Lönekonto",
      accountType: "CHECKING",
      currency: options.accountCurrency ?? "SEK",
      openingBalanceMinor: options.openingBalanceMinor ?? 0n,
      currentBalanceMinor: options.openingBalanceMinor ?? 0n,
      archivedAt: options.archived ? new Date() : null,
    })
    .returning();

  const service = new StatementImportService(
    new HouseholdAccessService(),
    new ObjectStorageService(),
    new LedgerTruthService(new AuditService()),
  );
  return { household, user, account, service };
}

function base64(csv: string): string {
  return Buffer.from(csv, "utf8").toString("base64");
}

/** Ledger postings must sum to zero per entry, for every entry in the household. */
async function assertLedgerBalances(householdId: string) {
  const db = getDb();
  const rows = await db
    .select({
      entryId: ledgerPostings.ledgerEntryId,
      delta: sql<string>`sum(case when ${ledgerPostings.side} = 'debit' then ${ledgerPostings.amountMinor} else -${ledgerPostings.amountMinor} end)`,
    })
    .from(ledgerPostings)
    .where(eq(ledgerPostings.householdId, householdId))
    .groupBy(ledgerPostings.ledgerEntryId);
  for (const row of rows) {
    assert.equal(row.delta, "0", `entry ${row.entryId} does not balance`);
  }
  return rows.length;
}

test("a statement is preserved, previewed and only then written to the ledger", async () => {
  const { household, user, account, service } = await fixture();
  const csv = buildSebCsv({ rows: referenceStatementRows(), openingBalanceMinor: 1_000_000n });
  const db = getDb();

  const preview = await service.inspect(user.id, {
    householdId: household.id,
    accountId: account.id,
    filename: "kontoutdrag.csv",
    contentBase64: base64(csv),
  });

  assert.equal(preview.provider, "SEB");
  assert.equal(preview.format, "SEB_CSV_ACCOUNT_STATEMENT");
  assert.equal(preview.formatVersion, 1);
  assert.equal(preview.totalRows, 9);
  assert.equal(preview.newRows, 9);
  assert.equal(preview.existingRows, 0);
  assert.equal(preview.invalidRows, 0);
  assert.equal(preview.balanceChain.status, "RECONCILED");
  assert.equal(preview.periodStart, "2026-01-02");
  assert.equal(preview.periodEnd, "2026-01-10");

  // Raw rows exist; economic rows do not, because nothing has been confirmed.
  const rawAfterInspect = await db
    .select({ id: rawImportRecords.id })
    .from(rawImportRecords)
    .where(eq(rawImportRecords.householdId, household.id));
  assert.equal(rawAfterInspect.length, 9, "every source row must be preserved");

  const eventsAfterInspect = await db
    .select({ id: financialEvents.id })
    .from(financialEvents)
    .where(eq(financialEvents.householdId, household.id));
  assert.equal(eventsAfterInspect.length, 0, "inspection must not write to the ledger");

  const [batchAfterInspect] = await db
    .select({ status: importBatches.status })
    .from(importBatches)
    .where(eq(importBatches.id, preview.batchId));
  assert.equal(batchAfterInspect.status, "READY_FOR_REVIEW");

  // Confirm.
  const result = await service.commit(user.id, {
    householdId: household.id,
    batchId: preview.batchId,
  });
  assert.equal(result.created, 9);
  assert.equal(result.failed, 0);

  const events = await db
    .select({ id: financialEvents.id })
    .from(financialEvents)
    .where(eq(financialEvents.householdId, household.id));
  assert.equal(events.length, 9);
  await assertLedgerBalances(household.id);
});

test("the raw payload keeps SEB's own values, including the third decimal", async () => {
  const { household, user, account, service } = await fixture();
  const csv = buildSebCsv({
    rows: [{ bookingDate: "2026-03-01", reference: "77", text: " ICA  KVANTUM ", amountMinor: -13_093n }],
    openingBalanceMinor: 59_637_321n,
  });
  const preview = await service.inspect(user.id, {
    householdId: household.id,
    accountId: account.id,
    filename: "kontoutdrag.csv",
    contentBase64: base64(csv),
  });
  const [raw] = await getDb()
    .select({ payload: rawImportRecords.payload, rowNumber: rawImportRecords.rowNumber })
    .from(rawImportRecords)
    .where(eq(rawImportRecords.importBatchId, preview.batchId));
  const payload = raw.payload as Record<string, string>;
  assert.equal(payload["Belopp"], "-130.930", "the source string must survive verbatim");
  assert.equal(payload["Text"], " ICA  KVANTUM ", "spacing must not be normalized away");
  assert.equal(payload["Bokföringsdatum"], "2026-03-01");
  assert.equal(raw.rowNumber, 1);

  await service.commit(user.id, { householdId: household.id, batchId: preview.batchId });
  const [tx] = await getDb()
    .select({
      amountMinor: sourceTransactions.amountMinor,
      rawDescription: sourceTransactions.rawDescription,
      providerReference: sourceTransactions.providerReference,
      reportedBalance: sourceTransactions.reportedBalanceAfterMinor,
    })
    .from(sourceTransactions)
    .where(eq(sourceTransactions.householdId, household.id));
  assert.equal(tx.amountMinor, -13_093n, "-130.930 SEK is exactly -13093 öre");
  assert.equal(tx.rawDescription, " ICA  KVANTUM ");
  assert.equal(tx.providerReference, "77");
  assert.equal(tx.reportedBalance, 59_624_228n);
});

test("a row whose third decimal is not zero is refused, not rounded", async () => {
  const { household, user, account, service } = await fixture();
  // Hand-built: the generator only emits exactly representable amounts.
  const csv = `\uFEFF${SEB_HEADERS.join(";")}
2026-04-01;2026-04-01;1;GILTIG;-100.000;900.000
2026-04-02;2026-04-02;2;RÄNTA;-0.001;899.999
2026-04-03;2026-04-03;3;GILTIG IGEN;-50.000;849.999
`;
  const preview = await service.inspect(user.id, {
    householdId: household.id,
    accountId: account.id,
    filename: "precision.csv",
    contentBase64: base64(csv),
  });
  assert.equal(preview.invalidRows, 1, "only the unrepresentable amount is refused");
  assert.equal(preview.totalRows, 3);
  assert.equal(preview.invalidSample[0]!.issue, "INVALID_AMOUNT_PRECISION");
  assert.equal(preview.invalidSample[0]!.rowNumber, 2);
  assert.match(preview.invalidSample[0]!.detail!, /avrundas inte/);

  await service.commit(user.id, { householdId: household.id, batchId: preview.batchId });
  const txs = await getDb()
    .select({ amountMinor: sourceTransactions.amountMinor })
    .from(sourceTransactions)
    .where(eq(sourceTransactions.householdId, household.id));
  assert.equal(txs.length, 2, "the unrepresentable row must not reach the ledger");
  // Nothing was rounded into existence.
  assert.ok(!txs.some((tx) => tx.amountMinor === 0n));
  const [batch] = await getDb()
    .select({ status: importBatches.status })
    .from(importBatches)
    .where(eq(importBatches.id, preview.batchId));
  assert.equal(batch.status, "COMPLETED_WITH_WARNINGS", "an invalid row is not silent success");
});

test("importing the same file twice produces no second economic effect", async () => {
  const { household, user, account, service } = await fixture();
  const csv = buildSebCsv({ rows: referenceStatementRows(), openingBalanceMinor: 1_000_000n });
  const db = getDb();

  const first = await service.inspect(user.id, {
    householdId: household.id,
    accountId: account.id,
    filename: "kontoutdrag.csv",
    contentBase64: base64(csv),
  });
  await service.commit(user.id, { householdId: household.id, batchId: first.batchId });

  const countRows = async () => {
    const [events] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(financialEvents)
      .where(eq(financialEvents.householdId, household.id));
    const [txs] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(sourceTransactions)
      .where(eq(sourceTransactions.householdId, household.id));
    const [entries] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.householdId, household.id));
    const [postings] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(ledgerPostings)
      .where(eq(ledgerPostings.householdId, household.id));
    return { events: events.n, txs: txs.n, entries: entries.n, postings: postings.n };
  };
  const after1 = await countRows();

  // The very same bytes again.
  const second = await service.inspect(user.id, {
    householdId: household.id,
    accountId: account.id,
    filename: "kontoutdrag.csv",
    contentBase64: base64(csv),
  });
  assert.equal(second.newRows, 0, "every row must already be known");
  assert.equal(second.existingRows, 9);

  await service.commit(user.id, { householdId: household.id, batchId: second.batchId });
  const after2 = await countRows();
  assert.deepEqual(after2, after1, "a second import must create nothing");
});

test("a transaction survives a Saldo that cannot be read", async () => {
  const { household, user, account, service } = await fixture();
  // The amount is exact; only the bank's own balance is unrepresentable. Losing
  // the transaction to protect a cross-check would lose money data.
  const csv = `\uFEFF${SEB_HEADERS.join(";")}
2026-05-01;2026-05-01;1;GILTIG;-100.000;900.999
`;
  const preview = await service.inspect(user.id, {
    householdId: household.id,
    accountId: account.id,
    filename: "saldo.csv",
    contentBase64: base64(csv),
  });
  assert.equal(preview.invalidRows, 0, "the transaction itself is fine");
  assert.equal(preview.totalRows, 1);

  await service.commit(user.id, { householdId: household.id, batchId: preview.batchId });
  const [tx] = await getDb()
    .select({
      amountMinor: sourceTransactions.amountMinor,
      reported: sourceTransactions.reportedBalanceAfterMinor,
      reviewReason: sourceTransactions.reviewReason,
    })
    .from(sourceTransactions)
    .where(eq(sourceTransactions.householdId, household.id));
  assert.equal(tx.amountMinor, -10_000n, "the money is imported exactly");
  assert.equal(tx.reported, null, "the unusable balance is dropped, not guessed");
  assert.equal(tx.reviewReason, "UNREADABLE_BALANCE", "and a person is told");
});

test("an overlapping export imports only the rows that are new", async () => {
  const { household, user, account, service } = await fixture();
  const all = referenceStatementRows();
  const db = getDb();

  // First: the earlier part of the period.
  const firstCsv = buildSebCsv({ rows: all.slice(0, 5), openingBalanceMinor: 1_000_000n });
  const first = await service.inspect(user.id, {
    householdId: household.id,
    accountId: account.id,
    filename: "jan-del1.csv",
    contentBase64: base64(firstCsv),
  });
  const firstResult = await service.commit(user.id, {
    householdId: household.id,
    batchId: first.batchId,
  });
  assert.equal(firstResult.created, 5);

  // Then the whole period, including everything already imported. The running
  // balance is identical because the opening balance is the same.
  const secondCsv = buildSebCsv({ rows: all, openingBalanceMinor: 1_000_000n });
  const second = await service.inspect(user.id, {
    householdId: household.id,
    accountId: account.id,
    filename: "jan-hela.csv",
    contentBase64: base64(secondCsv),
  });
  assert.equal(second.existingRows, 5, "the overlap must be recognised");
  assert.equal(second.newRows, 4, "only the unseen rows are new");

  const secondResult = await service.commit(user.id, {
    householdId: household.id,
    batchId: second.batchId,
  });
  assert.equal(secondResult.created, 4, "only the unseen rows become transactions");
  assert.equal(
    secondResult.existing,
    5,
    "and the five the file shares with the first import are reported as existing",
  );

  const [total] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sourceTransactions)
    .where(eq(sourceTransactions.householdId, household.id));
  assert.equal(total.n, 9, "nine transactions in total, not fourteen");
  await assertLedgerBalances(household.id);
});

test("two identical-looking transactions both survive the import", async () => {
  const { household, user, account, service } = await fixture();
  // Rows 4 and 5 of the reference fixture are the same day, amount and text.
  const csv = buildSebCsv({ rows: referenceStatementRows(), openingBalanceMinor: 1_000_000n });
  const preview = await service.inspect(user.id, {
    householdId: household.id,
    accountId: account.id,
    filename: "kontoutdrag.csv",
    contentBase64: base64(csv),
  });
  await service.commit(user.id, { householdId: household.id, batchId: preview.batchId });

  const cafes = await getDb()
    .select({ id: sourceTransactions.id })
    .from(sourceTransactions)
    .where(
      and(
        eq(sourceTransactions.householdId, household.id),
        eq(sourceTransactions.amountMinor, -4_500n),
      ),
    );
  assert.equal(cafes.length, 2, "a real transaction must never be silently dropped");
});

test("a reused Verifikationsnummer does not merge unrelated transactions", async () => {
  const { household, user, account, service } = await fixture();
  const csv = buildSebCsv({ rows: referenceStatementRows(), openingBalanceMinor: 1_000_000n });
  const preview = await service.inspect(user.id, {
    householdId: household.id,
    accountId: account.id,
    filename: "kontoutdrag.csv",
    contentBase64: base64(csv),
  });
  await service.commit(user.id, { householdId: household.id, batchId: preview.batchId });

  // Reference 500002 appears on both the ICA and the Apoteket row.
  const shared = await getDb()
    .select({ amountMinor: sourceTransactions.amountMinor })
    .from(sourceTransactions)
    .where(
      and(
        eq(sourceTransactions.householdId, household.id),
        eq(sourceTransactions.providerReference, "500002"),
      ),
    );
  assert.equal(shared.length, 2);
  assert.deepEqual(
    shared.map((row) => row.amountMinor).sort((a, b) => (a < b ? -1 : 1)),
    [-124_800n, -8_900n],
  );
});

test("a manual entry is flagged for review rather than merged or deleted", async () => {
  const { household, user, account, service } = await fixture();
  const db = getDb();
  // A transaction the household typed in before importing, with no import
  // provenance and a shorter description than the bank's.
  await db.insert(sourceTransactions).values({
    householdId: household.id,
    accountId: account.id,
    externalId: `manual-${suffix()}`,
    bookingDate: "2026-01-03",
    amountMinor: -124_800n,
    currency: "SEK",
    description: "ICA",
    rawDescription: "ICA",
  });

  const csv = buildSebCsv({ rows: referenceStatementRows(), openingBalanceMinor: 1_000_000n });
  const preview = await service.inspect(user.id, {
    householdId: household.id,
    accountId: account.id,
    filename: "kontoutdrag.csv",
    contentBase64: base64(csv),
  });
  const result = await service.commit(user.id, {
    householdId: household.id,
    batchId: preview.batchId,
  });

  assert.ok(result.review >= 1, "the plausible duplicate must be raised");

  // The manual entry still exists, untouched.
  const manual = await db
    .select({ id: sourceTransactions.id })
    .from(sourceTransactions)
    .where(
      and(
        eq(sourceTransactions.householdId, household.id),
        eq(sourceTransactions.description, "ICA"),
      ),
    );
  assert.equal(manual.length, 1, "a manual entry is never deleted by an import");

  const flagged = await db
    .select({ id: sourceTransactions.id })
    .from(sourceTransactions)
    .where(
      and(
        eq(sourceTransactions.householdId, household.id),
        eq(sourceTransactions.reviewReason, "POSSIBLE_DUPLICATE"),
      ),
    );
  assert.ok(flagged.length >= 1, "the imported row carries the review reason");
});

test("SEB's Saldo becomes reported evidence, never a posting", async () => {
  const { household, user, account, service } = await fixture();
  const rows = referenceStatementRows();
  const csv = buildSebCsv({ rows, openingBalanceMinor: 1_000_000n });
  const db = getDb();

  const preview = await service.inspect(user.id, {
    householdId: household.id,
    accountId: account.id,
    filename: "kontoutdrag.csv",
    contentBase64: base64(csv),
  });
  await service.commit(user.id, { householdId: household.id, batchId: preview.batchId });

  const closing = rows.reduce((sum, row) => sum + row.amountMinor, 1_000_000n);

  // One sparse snapshot at the closing date, from the statement.
  const snapshots = await db
    .select({
      reported: accountBalanceSnapshots.reportedBalanceMinor,
      source: accountBalanceSnapshots.source,
    })
    .from(accountBalanceSnapshots)
    .where(
      and(
        eq(accountBalanceSnapshots.householdId, household.id),
        eq(accountBalanceSnapshots.source, "seb_statement"),
      ),
    );
  assert.equal(snapshots.length, 1, "one snapshot per import, not one per row");
  assert.equal(snapshots[0]!.reported, closing);

  // And no posting was created for the balance itself: every posting belongs to
  // a transaction, so the count matches the rows with a non-zero amount.
  const [postings] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ledgerPostings)
    .where(eq(ledgerPostings.householdId, household.id));
  assert.equal(postings.n, rows.length * 2, "two postings per transaction, none for Saldo");
  await assertLedgerBalances(household.id);
});

test("another household's account cannot be imported into", async () => {
  const mine = await fixture();
  const theirs = await fixture();
  const csv = buildSebCsv({ rows: referenceStatementRows(), openingBalanceMinor: 0n });

  await assert.rejects(
    () =>
      mine.service.inspect(mine.user.id, {
        householdId: mine.household.id,
        // An account that exists, but in another household.
        accountId: theirs.account.id,
        filename: "kontoutdrag.csv",
        contentBase64: base64(csv),
      }),
    /hittades inte/i,
  );

  // And a member of neither household cannot reach it at all.
  await assert.rejects(
    () =>
      mine.service.inspect(theirs.user.id, {
        householdId: mine.household.id,
        accountId: mine.account.id,
        filename: "kontoutdrag.csv",
        contentBase64: base64(csv),
      }),
  );
});

test("an archived account and a non-SEK account are both refused", async () => {
  const archived = await fixture({ archived: true });
  const csv = buildSebCsv({ rows: referenceStatementRows(), openingBalanceMinor: 0n });
  await assert.rejects(
    () =>
      archived.service.inspect(archived.user.id, {
        householdId: archived.household.id,
        accountId: archived.account.id,
        filename: "a.csv",
        contentBase64: base64(csv),
      }),
    /arkiverat/i,
  );

  const foreign = await fixture({ accountCurrency: "EUR" });
  await assert.rejects(
    () =>
      foreign.service.inspect(foreign.user.id, {
        householdId: foreign.household.id,
        accountId: foreign.account.id,
        filename: "a.csv",
        contentBase64: base64(csv),
      }),
    /SEK/,
  );
});

test("a file that is not a SEB statement is refused before anything is stored", async () => {
  const { household, user, account, service } = await fixture();
  const db = getDb();
  for (const [name, content] of [
    ["comma.csv", `${SEB_HEADERS.join(",")}\n2026-01-01,,1,X,1.000,1.000\n`],
    ["other.csv", "Datum;Text;Summa\n2026-01-01;X;1\n"],
    ["empty.csv", ""],
  ] as const) {
    await assert.rejects(
      () =>
        service.inspect(user.id, {
          householdId: household.id,
          accountId: account.id,
          filename: name,
          contentBase64: base64(content),
        }),
      /känns inte igen|inga transaktioner/i,
      `${name} must be refused`,
    );
  }
  const [batches] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(importBatches)
    .where(eq(importBatches.householdId, household.id));
  assert.equal(batches.n, 0, "a refused file must not leave a batch behind");
});

test("a broken balance chain is reported rather than described as success", async () => {
  const { household, user, account, service } = await fixture();
  const csv = buildSebCsv({
    rows: referenceStatementRows(),
    openingBalanceMinor: 1_000_000n,
    breakAtRow: 3,
  });
  const preview = await service.inspect(user.id, {
    householdId: household.id,
    accountId: account.id,
    filename: "trasig.csv",
    contentBase64: base64(csv),
  });
  assert.notEqual(preview.balanceChain.status, "RECONCILED");
  assert.ok(preview.balanceChain.breakCount >= 1);
  assert.equal(preview.balanceChain.breaks[0]!.rowNumber, 3);

  const result = await service.commit(user.id, {
    householdId: household.id,
    batchId: preview.batchId,
  });
  assert.equal(result.status, "COMPLETED_WITH_WARNINGS");
});

test("a newest-first export reconciles and imports the same way", async () => {
  const { household, user, account, service } = await fixture();
  const csv = buildSebCsv({
    rows: referenceStatementRows(),
    openingBalanceMinor: 1_000_000n,
    direction: "DESCENDING",
  });
  const preview = await service.inspect(user.id, {
    householdId: household.id,
    accountId: account.id,
    filename: "omvand.csv",
    contentBase64: base64(csv),
  });
  assert.equal(preview.balanceChain.direction, "DESCENDING");
  assert.equal(preview.balanceChain.status, "RECONCILED");
  const result = await service.commit(user.id, {
    householdId: household.id,
    batchId: preview.batchId,
  });
  assert.equal(result.created, 9);
});

test("an interrupted batch resumes without duplicating what it already wrote", async () => {
  const { household, user, account, service } = await fixture();
  const csv = buildSebCsv({ rows: referenceStatementRows(), openingBalanceMinor: 1_000_000n });
  const db = getDb();
  const preview = await service.inspect(user.id, {
    householdId: household.id,
    accountId: account.id,
    filename: "kontoutdrag.csv",
    contentBase64: base64(csv),
  });

  // Simulate a batch that stopped midway: some rows were committed, the rest are
  // still pending, and the batch never reached a terminal status.
  await service.commit(user.id, { householdId: household.id, batchId: preview.batchId });
  const committed = await db
    .select({ id: rawImportRecords.id })
    .from(rawImportRecords)
    .where(eq(rawImportRecords.importBatchId, preview.batchId));
  const halfIds = committed.slice(0, 4).map((row) => row.id);
  await db
    .update(rawImportRecords)
    .set({ processingStatus: "PENDING" })
    .where(inArray(rawImportRecords.id, halfIds));
  await db
    .update(importBatches)
    .set({ status: "IMPORTING" })
    .where(eq(importBatches.id, preview.batchId));

  const [before] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(financialEvents)
    .where(eq(financialEvents.householdId, household.id));

  // Retrying must find those rows already represented and create nothing.
  const retried = await service.commit(user.id, {
    householdId: household.id,
    batchId: preview.batchId,
  });
  assert.equal(retried.created, 0);
  assert.equal(retried.existing, 4);

  const [after] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(financialEvents)
    .where(eq(financialEvents.householdId, household.id));
  assert.equal(after.n, before.n, "a retry must not add an economic effect");
  await assertLedgerBalances(household.id);
});

test("a multi-year statement at real scale imports once and balances", async () => {
  // The account starts where the statement starts. Anything else and the ledger
  // disagrees with the bank by the gap, for ever.
  const { household, user, account, service } = await fixture({
    openingBalanceMinor: 5_000_000n,
  });
  const db = getDb();
  const rows = generateSyntheticStatement({
    // The same order of magnitude as a five-year SEB export.
    rowCount: 8_184,
    startDate: "2021-08-10",
    endDate: "2026-08-10",
    openingBalanceMinor: 5_000_000n,
  });
  const csv = buildSebCsv({ rows, openingBalanceMinor: 5_000_000n });

  const started = Date.now();
  const preview = await service.inspect(user.id, {
    householdId: household.id,
    accountId: account.id,
    filename: "kontoutdrag-5ar.csv",
    contentBase64: base64(csv),
  });
  assert.equal(preview.totalRows, 8_184);
  assert.equal(preview.newRows, 8_184);
  assert.equal(preview.invalidRows, 0);
  assert.equal(preview.balanceChain.status, "RECONCILED");
  assert.equal(preview.balanceChain.rowsChecked, 8_183);
  assert.equal(preview.periodStart, "2021-08-10");
  assert.equal(preview.periodEnd, "2026-08-10");
  // The preview is a sample: the client is never handed every row.
  assert.ok(preview.sample.length <= 25, "the preview must stay small");

  const result = await service.commit(user.id, {
    householdId: household.id,
    batchId: preview.batchId,
  });
  assert.equal(result.created, 8_184);
  assert.equal(result.failed, 0);
  console.log(
    `    8 184 rows inspected and committed in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );

  const entries = await assertLedgerBalances(household.id);
  assert.equal(entries, 8_184);

  // The ledger's own view of the account must equal the statement's closing
  // balance, since the account started empty and every row was imported.
  const closing = rows.reduce((sum, row) => sum + row.amountMinor, 5_000_000n);
  const [posted] = await db
    .select({
      delta: sql<string>`sum(case when ${ledgerPostings.side} = 'debit' then ${ledgerPostings.amountMinor} else -${ledgerPostings.amountMinor} end)`,
    })
    .from(ledgerPostings)
    .where(
      and(
        eq(ledgerPostings.householdId, household.id),
        eq(ledgerPostings.accountId, account.id),
      ),
    );
  assert.equal(
    BigInt(posted.delta ?? "0") + 5_000_000n,
    closing,
    "the ledger must agree with the statement's own closing balance",
  );
  assert.equal(
    preview.statementStartingBalanceMinor,
    "5000000",
    "the preview states what the account held before the first row",
  );

  // The account's cached balance is what the accounts list, net worth and
  // dashboard read. Asserting the postings alone is what let a stale cache
  // through: it was still the opening balance after 8 184 imported rows.
  const [cached] = await db
    .select({
      currentBalanceMinor: accounts.currentBalanceMinor,
      reportedBalanceMinor: accounts.reportedBalanceMinor,
    })
    .from(accounts)
    .where(eq(accounts.id, account.id));
  assert.equal(
    cached.currentBalanceMinor,
    closing,
    "the derived balance cache must agree with the postings after an import",
  );
  assert.equal(
    cached.reportedBalanceMinor,
    closing,
    "and with the statement's own reported balance, so reconciliation sees no mismatch",
  );

  // And the same file again changes nothing.
  const again = await service.inspect(user.id, {
    householdId: household.id,
    accountId: account.id,
    filename: "kontoutdrag-5ar.csv",
    contentBase64: base64(csv),
  });
  assert.equal(again.newRows, 0);
  assert.equal(again.existingRows, 8_184);
});

test("history and batch detail expose the import to the user", async () => {
  const { household, user, account, service } = await fixture();
  const csv = buildSebCsv({ rows: referenceStatementRows(), openingBalanceMinor: 1_000_000n });
  const preview = await service.inspect(user.id, {
    householdId: household.id,
    accountId: account.id,
    filename: "kontoutdrag.csv",
    contentBase64: base64(csv),
  });
  await service.commit(user.id, { householdId: household.id, batchId: preview.batchId });

  const history = await service.history(user.id, household.id);
  assert.equal(history.items.length, 1);
  assert.equal(history.items[0]!.provider, "SEB");
  assert.equal(history.items[0]!.accountName, "SEB Lönekonto");
  assert.equal(history.items[0]!.periodStart, "2026-01-02");
  assert.equal(history.items[0]!.newRecords, 9);

  const detail = await service.batch(user.id, household.id, preview.batchId);
  assert.equal(detail.provider, "SEB");
  assert.equal(detail.balanceChainStatus, "RECONCILED");
  assert.equal(detail.totalRecords, 9);
  assert.ok(detail.fileHash && detail.fileHash.length === 64, "the file hash is recorded");

  // Another household cannot read the batch.
  const outsider = await fixture();
  await assert.rejects(() => service.batch(outsider.user.id, household.id, preview.batchId));
});

test("the file hash alone does not decide dedupe", async () => {
  const { household, user, account, service } = await fixture();
  const rows = referenceStatementRows();
  const db = getDb();

  // The same transactions exported twice with different byte content: a trailing
  // newline difference and reversed order. Different file, same money.
  const a = buildSebCsv({ rows, openingBalanceMinor: 1_000_000n });
  const b = buildSebCsv({ rows, openingBalanceMinor: 1_000_000n, direction: "DESCENDING" });
  assert.notEqual(a, b, "the two exports differ as files");

  const first = await service.inspect(user.id, {
    householdId: household.id,
    accountId: account.id,
    filename: "a.csv",
    contentBase64: base64(a),
  });
  await service.commit(user.id, { householdId: household.id, batchId: first.batchId });

  const second = await service.inspect(user.id, {
    householdId: household.id,
    accountId: account.id,
    filename: "b.csv",
    contentBase64: base64(b),
  });
  // Different bytes, so a file-hash check would call this new; the row
  // fingerprints correctly recognise the same transactions.
  assert.equal(second.newRows, 0, "the same money must be recognised across exports");

  const [total] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sourceTransactions)
    .where(eq(sourceTransactions.householdId, household.id));
  assert.equal(total.n, 9);
});
