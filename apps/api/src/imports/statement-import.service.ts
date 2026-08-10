import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { buildCashExpense, buildIncome } from "@ffos/financial-engine";
import { logger } from "../common/logger";
import { getDb } from "../db/client";
import { auditLogs } from "../db/schema";
import {
  accountBalanceSnapshots,
  accounts,
  dataSources,
  importBatches,
  rawImportRecords,
  sourceTransactions,
} from "../db/schema-economic";
import { persistBalancedEvent } from "../db/seed/persist-event";
import { enqueueJob } from "../jobs/queue";
import { HouseholdAccessService } from "../households/household-access.service";
import { ObjectStorageService } from "../storage/object-storage.service";
import {
  assertSupportedHouseholdCurrency,
  isSupportedAggregationCurrency,
} from "../common/currency-policy";
import {
  detectSebCsv,
  decodeSebCsv,
  parseSebRow,
  splitSebLines,
  SEB_FORMAT,
  SEB_FORMAT_VERSION,
  SEB_MAX_BASE64_CHARS,
  SEB_MAX_DATA_ROWS,
  SEB_MAX_DESCRIPTION_CHARS,
  SEB_PROVIDER,
  SEB_SCHEMA_VERSION,
  type SebParsedRow,
  type SebRowIssue,
} from "./seb/seb-csv-format";
import { fileContentHash, fingerprintStatementRows } from "./seb/statement-fingerprint";
import { validateBalanceChain, type SebBalanceChainResult } from "./seb/balance-chain";

/**
 * The shared statement-import pipeline.
 *
 * Everything here is provider-agnostic except where it asks SEB's adapter to
 * detect and parse. A second bank supplies a detector and a row parser and
 * reuses all of this: raw preservation, fingerprint dedupe, overlap handling,
 * review flagging, ledger persistence, snapshots and batch lifecycle.
 *
 * See `docs/imports/SEB_CSV_DESIGN.md` for the reasoning, particularly §6 on
 * identity and §12 on transaction boundaries.
 */

/** Raw rows are preserved in chunks; interpretation is independent of this. */
const RAW_CHUNK = 500;
/** Economic writes per chunk. Each row is still its own atomic command. */
const COMMIT_CHUNK = 200;
/** How many rows the preview shows. The client never renders 8 000 rows. */
const PREVIEW_ROWS = 25;
/** A manual entry this many days from an imported row is a duplicate candidate. */
const DUPLICATE_DAY_WINDOW = 3;

export type StatementRowStatus = "NEW" | "ALREADY_IMPORTED" | "INVALID";

export type StatementPreviewRow = {
  rowNumber: number;
  bookingDate: string;
  text: string;
  amountMinor: string | null;
  reportedBalanceMinor: string | null;
  status: StatementRowStatus;
  issue?: SebRowIssue;
  detail?: string;
};

@Injectable()
export class StatementImportService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
  ) {}

  /* ------------------------------------------------------------- helpers */

  /**
   * The account a statement may be imported into.
   *
   * Household membership, active state, currency and account type are all
   * checked here rather than at the edges, so no route can skip one.
   */
  private async requireImportableAccount(householdId: string, accountId: string) {
    const db = getDb();
    const [account] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.householdId, householdId)))
      .limit(1);

    // Household isolation: an account in another household is simply not found,
    // which also avoids confirming that the id exists.
    if (!account) {
      throw new NotFoundException({
        code: "ACCOUNT_NOT_FOUND",
        message: "Kontot hittades inte i det här hushållet.",
      });
    }
    if (account.archivedAt) {
      throw new BadRequestException({
        code: "ACCOUNT_ARCHIVED",
        message: "Kontot är arkiverat och kan inte tas emot import.",
      });
    }
    if (!isSupportedAggregationCurrency(account.currency)) {
      throw new BadRequestException({
        code: "UNSUPPORTED_ACCOUNT_CURRENCY",
        message: `Kontot är i ${account.currency}. Den här versionen kan bara importera SEK-konton.`,
      });
    }
    const importable = ["CHECKING", "SAVINGS", "CREDIT_CARD", "CASH"];
    if (!importable.includes(account.accountType)) {
      throw new BadRequestException({
        code: "UNSUPPORTED_ACCOUNT_TYPE",
        message: "Kontoutdrag kan bara importeras till ett bank- eller kortkonto.",
      });
    }
    return account;
  }

  /** The household's base currency must be one V1 can aggregate. */
  private async requireSupportedHousehold(householdId: string) {
    const db = getDb();
    const [account] = await db
      .select({ currency: accounts.currency })
      .from(accounts)
      .where(eq(accounts.householdId, householdId))
      .limit(1);
    if (account) assertSupportedHouseholdCurrency(account.currency);
  }

  private async audit(input: {
    householdId: string;
    actorUserId: string;
    action: string;
    entityId: string;
    after?: Record<string, unknown>;
  }) {
    // Deliberately no CSV content: raw rows live in the database and object
    // storage, both inside the erasure path, never in application logs.
    await getDb()
      .insert(auditLogs)
      .values({
        householdId: input.householdId,
        actorUserId: input.actorUserId,
        action: input.action,
        entity: "import_batch",
        entityId: input.entityId,
        after: input.after ?? null,
        source: "api",
      });
  }

  /** The SEB data source for this household, created once and reused. */
  private async ensureSebSource(householdId: string) {
    const db = getDb();
    const [existing] = await db
      .select()
      .from(dataSources)
      .where(
        and(
          eq(dataSources.householdId, householdId),
          eq(dataSources.providerId, SEB_PROVIDER),
          eq(dataSources.protocol, "FILE_IMPORT"),
        ),
      )
      .limit(1);
    if (existing) return existing;
    const [created] = await db
      .insert(dataSources)
      .values({
        householdId,
        providerId: SEB_PROVIDER,
        name: "SEB (kontoutdrag)",
        domain: "BANK",
        protocol: "FILE_IMPORT",
        authenticationMethod: "MANUAL_FILE",
        connectionStatus: "CONNECTED",
        metadata: { format: SEB_FORMAT, formatVersion: SEB_FORMAT_VERSION },
      })
      .returning();
    return created;
  }

  /* ------------------------------------------------------------- inspect */

  /**
   * Stage one: store the file, parse every row, preserve them, and report.
   *
   * No financial write happens here. The user has not confirmed anything yet, so
   * this must be safe to run and abandon.
   */
  async inspect(
    userId: string,
    input: {
      householdId: string;
      accountId: string;
      filename: string;
      contentBase64: string;
    },
  ) {
    await this.access.requireMembership(userId, input.householdId);
    await this.requireSupportedHousehold(input.householdId);
    const account = await this.requireImportableAccount(input.householdId, input.accountId);

    if (input.contentBase64.length > SEB_MAX_BASE64_CHARS) {
      throw new BadRequestException({
        code: "FILE_TOO_LARGE",
        message: "Filen är för stor. Dela upp kontoutdraget i kortare perioder.",
      });
    }
    const bytes = Buffer.from(input.contentBase64, "base64");

    const detection = detectSebCsv(bytes);
    if (!detection.recognised) {
      throw new BadRequestException({
        code: `SEB_CSV_${detection.reason}`,
        message: `Filen känns inte igen som ett SEB-kontoutdrag. ${detection.detail}`,
      });
    }

    const decoded = decodeSebCsv(bytes);
    if (!decoded.ok) {
      throw new BadRequestException({
        code: "SEB_CSV_NOT_UTF8",
        message: "Filen är inte giltig UTF-8-text.",
      });
    }
    const lines = splitSebLines(decoded.text).slice(1);
    if (lines.length === 0) {
      throw new BadRequestException({
        code: "SEB_CSV_NO_ROWS",
        message: "Kontoutdraget innehåller inga transaktioner.",
      });
    }
    if (lines.length > SEB_MAX_DATA_ROWS) {
      throw new BadRequestException({
        code: "SEB_CSV_TOO_MANY_ROWS",
        message: `Kontoutdraget har fler än ${SEB_MAX_DATA_ROWS} rader.`,
      });
    }

    // Every row is parsed inside its own guard, so one unreadable line becomes
    // an invalid row rather than a failed import.
    const parsed: SebParsedRow[] = [];
    const invalid: Array<{
      rowNumber: number;
      issue: SebRowIssue;
      detail: string;
      payload: Record<string, string>;
    }> = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (!line.trim()) continue;
      const rowNumber = i + 1;
      try {
        const result = parseSebRow(line, rowNumber);
        if (result.ok) parsed.push(result.row);
        else
          invalid.push({
            rowNumber,
            issue: result.issue,
            detail: result.detail,
            payload: result.payload,
          });
      } catch (err) {
        invalid.push({
          rowNumber,
          issue: "COLUMN_COUNT",
          detail: `Raden kunde inte tolkas: ${err instanceof Error ? err.message : "okänt fel"}`,
          payload: { raw: line.slice(0, 200) },
        });
      }
    }

    const balanceChain = validateBalanceChain(parsed);
    const fingerprints = fingerprintStatementRows(account.id, parsed);
    const source = await this.ensureSebSource(input.householdId);
    const hash = fileContentHash(bytes);

    const dates = parsed.map((row) => row.bookingDate).sort();
    const db = getDb();

    // The original file follows the existing object-storage path, so erasure and
    // recovery already cover it.
    let stored: { storageKey: string; bucket: string | null } | null = null;
    try {
      const object = await this.storage.putObject({
        householdId: input.householdId,
        filename: input.filename,
        contentType: "text/csv",
        body: bytes,
      });
      stored = { storageKey: object.storageKey, bucket: object.bucket ?? null };
    } catch {
      // Losing the convenience copy must not lose the import: every row is
      // preserved in raw_import_records regardless.
      stored = null;
    }

    const [batch] = await db
      .insert(importBatches)
      .values({
        householdId: input.householdId,
        sourceId: source?.id ?? null,
        status: "INSPECTING",
        provider: SEB_PROVIDER,
        format: SEB_FORMAT,
        formatVersion: SEB_FORMAT_VERSION,
        fileName: input.filename.slice(0, 260),
        fileHash: hash,
        fileByteSize: bytes.byteLength,
        storageKey: stored?.storageKey ?? null,
        bucket: stored?.bucket ?? null,
        targetAccountId: account.id,
        totalRecords: parsed.length + invalid.length,
        invalidRecords: invalid.length,
        periodStart: dates[0] ?? null,
        periodEnd: dates[dates.length - 1] ?? null,
        balanceChainStatus: balanceChain.status,
        balanceChain: balanceChain as unknown as Record<string, unknown>,
        closingBalanceMinor:
          balanceChain.closingReportedBalanceMinor === null
            ? null
            : BigInt(balanceChain.closingReportedBalanceMinor),
      })
      .returning();

    await this.audit({
      householdId: input.householdId,
      actorUserId: userId,
      action: "import.statement.uploaded",
      entityId: batch.id,
      after: {
        provider: SEB_PROVIDER,
        format: SEB_FORMAT,
        fileHash: hash,
        rows: parsed.length + invalid.length,
        accountId: account.id,
      },
    });

    // Preserve every row before interpreting any of it (ADR-0008). Chunked, and
    // one transaction per chunk: a committed chunk is progress, not a partial
    // financial state.
    const knownFingerprints = new Set<string>();
    for (let start = 0; start < parsed.length; start += RAW_CHUNK) {
      const chunk = parsed.slice(start, start + RAW_CHUNK);
      await db.transaction(async (tx) => {
        for (const row of chunk) {
          await tx
            .insert(rawImportRecords)
            .values({
              householdId: input.householdId,
              provider: SEB_PROVIDER,
              sourceId: source?.id ?? null,
              importBatchId: batch.id,
              payload: row.payload,
              hash: fingerprints.get(row.rowNumber)!,
              rowNumber: row.rowNumber,
              schemaVersion: SEB_SCHEMA_VERSION,
              processingStatus: "PENDING",
            })
            // The same row arriving again (same file, or an overlapping export)
            // is not an error; the existing unique index makes this a no-op.
            .onConflictDoNothing();
        }
      });
    }

    // Invalid rows are preserved too, so the user can inspect what SEB sent.
    for (let start = 0; start < invalid.length; start += RAW_CHUNK) {
      const chunk = invalid.slice(start, start + RAW_CHUNK);
      await db.transaction(async (tx) => {
        for (const row of chunk) {
          await tx
            .insert(rawImportRecords)
            .values({
              householdId: input.householdId,
              provider: SEB_PROVIDER,
              sourceId: source?.id ?? null,
              importBatchId: batch.id,
              payload: { ...row.payload, __issue: row.issue, __detail: row.detail },
              hash: `invalid:${batch.id}:${row.rowNumber}`,
              rowNumber: row.rowNumber,
              schemaVersion: SEB_SCHEMA_VERSION,
              processingStatus: "FAILED",
            })
            .onConflictDoNothing();
        }
      });
    }

    // Which rows this household has already imported into this account.
    const allFingerprints = [...fingerprints.values()];
    const existing = new Set<string>();
    for (let start = 0; start < allFingerprints.length; start += 1000) {
      const slice = allFingerprints.slice(start, start + 1000);
      const rows = await db
        .select({ fingerprint: sourceTransactions.fingerprint })
        .from(sourceTransactions)
        .where(
          and(
            eq(sourceTransactions.householdId, input.householdId),
            eq(sourceTransactions.accountId, account.id),
            inArray(sourceTransactions.fingerprint, slice),
          ),
        );
      for (const row of rows) if (row.fingerprint) existing.add(row.fingerprint);
    }
    knownFingerprints.clear();
    for (const fingerprint of existing) knownFingerprints.add(fingerprint);

    const newRows = parsed.filter(
      (row) => !knownFingerprints.has(fingerprints.get(row.rowNumber)!),
    );

    await db
      .update(importBatches)
      .set({
        status: "READY_FOR_REVIEW",
        newRecords: newRows.length,
        existingRecords: parsed.length - newRows.length,
      })
      .where(eq(importBatches.id, batch.id));

    await this.audit({
      householdId: input.householdId,
      actorUserId: userId,
      action: "import.statement.inspected",
      entityId: batch.id,
      after: {
        total: parsed.length + invalid.length,
        new: newRows.length,
        existing: parsed.length - newRows.length,
        invalid: invalid.length,
        balanceChainStatus: balanceChain.status,
      },
    });

    return this.previewPayload({
      batchId: batch.id,
      accountName: account.name,
      accountId: account.id,
      filename: input.filename,
      parsed,
      invalid,
      fingerprints,
      known: knownFingerprints,
      balanceChain,
      currency: account.currency,
    });
  }

  private previewPayload(input: {
    batchId: string;
    accountId: string;
    accountName: string;
    filename: string;
    parsed: SebParsedRow[];
    invalid: Array<{ rowNumber: number; issue: SebRowIssue; detail: string }>;
    fingerprints: Map<number, string>;
    known: Set<string>;
    balanceChain: SebBalanceChainResult;
    currency: string;
  }) {
    const dates = input.parsed.map((row) => row.bookingDate).sort();
    const newCount = input.parsed.filter(
      (row) => !input.known.has(input.fingerprints.get(row.rowNumber)!),
    ).length;

    // A sample, ordered newest first, plus every invalid row: the client must
    // never be handed thousands of rows to render.
    const sample: StatementPreviewRow[] = [...input.parsed]
      .sort((a, b) => (a.bookingDate < b.bookingDate ? 1 : -1))
      .slice(0, PREVIEW_ROWS)
      .map((row) => ({
        rowNumber: row.rowNumber,
        bookingDate: row.bookingDate,
        text: row.rawDescription.trim().slice(0, SEB_MAX_DESCRIPTION_CHARS),
        amountMinor: row.amountMinor.toString(),
        reportedBalanceMinor: row.reportedBalanceAfterMinor?.toString() ?? null,
        status: input.known.has(input.fingerprints.get(row.rowNumber)!)
          ? ("ALREADY_IMPORTED" as const)
          : ("NEW" as const),
      }));

    const invalidRows: StatementPreviewRow[] = input.invalid
      .slice(0, PREVIEW_ROWS)
      .map((row) => ({
        rowNumber: row.rowNumber,
        bookingDate: "",
        text: row.detail,
        amountMinor: null,
        reportedBalanceMinor: null,
        status: "INVALID" as const,
        issue: row.issue,
        detail: row.detail,
      }));

    return {
      batchId: input.batchId,
      provider: SEB_PROVIDER,
      format: SEB_FORMAT,
      formatVersion: SEB_FORMAT_VERSION,
      fileName: input.filename,
      accountId: input.accountId,
      accountName: input.accountName,
      currency: input.currency,
      periodStart: dates[0] ?? null,
      periodEnd: dates[dates.length - 1] ?? null,
      totalRows: input.parsed.length + input.invalid.length,
      newRows: newCount,
      existingRows: input.parsed.length - newCount,
      invalidRows: input.invalid.length,
      closingBalanceMinor: input.balanceChain.closingReportedBalanceMinor,
      balanceChain: {
        status: input.balanceChain.status,
        direction: input.balanceChain.direction,
        rowsChecked: input.balanceChain.rowsChecked,
        rowsReconciled: input.balanceChain.rowsReconciled,
        breakCount: input.balanceChain.breakCount,
        breaks: input.balanceChain.breaks,
      },
      sample,
      invalidSample: invalidRows,
    };
  }

  /**
   * Confirm a previewed batch, and hand the work to the worker.
   *
   * A five-year statement is thousands of rows, each its own transaction, which
   * takes far longer than a request should be held open. The batch moves to
   * IMPORTING here and the caller polls it; `commit` itself is what the worker
   * runs, and is also callable directly by tests and by a retry.
   */
  async confirm(userId: string, input: { householdId: string; batchId: string }) {
    await this.access.requireMembership(userId, input.householdId);
    const db = getDb();
    const [batch] = await db
      .select()
      .from(importBatches)
      .where(
        and(
          eq(importBatches.id, input.batchId),
          eq(importBatches.householdId, input.householdId),
        ),
      )
      .limit(1);
    if (!batch) {
      throw new NotFoundException({
        code: "IMPORT_BATCH_NOT_FOUND",
        message: "Importen hittades inte.",
      });
    }
    if (!["READY_FOR_REVIEW", "FAILED", "PARTIAL", "IMPORTING"].includes(batch.status)) {
      throw new BadRequestException({
        code: "IMPORT_BATCH_NOT_CONFIRMABLE",
        message: `Importen har status ${batch.status} och kan inte bekräftas.`,
      });
    }

    await db
      .update(importBatches)
      .set({ status: "IMPORTING", message: null })
      .where(eq(importBatches.id, batch.id));

    try {
      await enqueueJob({
        type: "COMMIT_STATEMENT_IMPORT",
        householdId: input.householdId,
        entityId: batch.id,
        trigger: "import.confirm",
      });
      return { batchId: batch.id, status: "IMPORTING" as const, queued: true };
    } catch (err) {
      // No queue reachable: do the work inline rather than leave the household
      // with a batch that says IMPORTING and never moves. Logged rather than
      // swallowed, because a silent fallback means nobody learns the queue is
      // down until a request takes a minute.
      logger.warn("statement_import_enqueue_failed", {
        batchId: batch.id,
        error: err instanceof Error ? err.message : String(err),
      });
      const result = await this.commit(userId, input);
      return { batchId: batch.id, status: result.status, queued: false };
    }
  }

  /* -------------------------------------------------------------- commit */

  /**
   * Stage two: turn preserved rows into economic truth.
   *
   * Runs only after the user confirms. Each row is its own atomic command keyed
   * on its fingerprint, so a chunk can be retried and an interrupted batch can be
   * resumed without a second economic effect.
   */
  async commit(userId: string, input: { householdId: string; batchId: string }) {
    await this.access.requireMembership(userId, input.householdId);
    const db = getDb();

    const [batch] = await db
      .select()
      .from(importBatches)
      .where(
        and(
          eq(importBatches.id, input.batchId),
          eq(importBatches.householdId, input.householdId),
        ),
      )
      .limit(1);
    if (!batch) {
      throw new NotFoundException({
        code: "IMPORT_BATCH_NOT_FOUND",
        message: "Importen hittades inte.",
      });
    }
    if (!batch.targetAccountId) {
      throw new BadRequestException({
        code: "IMPORT_BATCH_WITHOUT_ACCOUNT",
        message: "Importen har inget valt konto.",
      });
    }
    // Only a batch waiting for confirmation, or one that stopped midway, may be
    // committed. A completed batch is not re-run.
    if (!["READY_FOR_REVIEW", "IMPORTING", "FAILED", "PARTIAL"].includes(batch.status)) {
      throw new BadRequestException({
        code: "IMPORT_BATCH_NOT_CONFIRMABLE",
        message: `Importen har status ${batch.status} och kan inte bekräftas.`,
      });
    }

    const account = await this.requireImportableAccount(
      input.householdId,
      batch.targetAccountId,
    );

    await db
      .update(importBatches)
      .set({ status: "IMPORTING" })
      .where(eq(importBatches.id, batch.id));

    await this.audit({
      householdId: input.householdId,
      actorUserId: userId,
      action: "import.statement.confirmed",
      entityId: batch.id,
      after: { accountId: account.id, newRecords: batch.newRecords },
    });

    // Read back the preserved rows: the commit works from what was stored, not
    // from the upload, so a resumed batch behaves identically to a fresh one.
    const raw = await db
      .select()
      .from(rawImportRecords)
      .where(
        and(
          eq(rawImportRecords.importBatchId, batch.id),
          eq(rawImportRecords.householdId, input.householdId),
        ),
      )
      .orderBy(asc(rawImportRecords.rowNumber));

    const pending = raw.filter(
      (row) => row.processingStatus === "PENDING" || row.processingStatus === "PROCESSING",
    );

    const expenseAccountId = await this.systemAccountId(input.householdId, "EXPENSE");
    const incomeAccountId = await this.systemAccountId(input.householdId, "INCOME");

    let created = 0;
    /**
     * Rows this commit skipped because they were already represented.
     *
     * Distinct from the batch's own `existingRecords`: a row the file shares with
     * an earlier import is deduplicated when raw rows are preserved and never
     * reaches this loop at all, so counting only skips here would report no
     * overlap for a genuinely overlapping export.
     */
    let skipped = 0;
    let failed = 0;
    let review = 0;

    for (let start = 0; start < pending.length; start += COMMIT_CHUNK) {
      const chunk = pending.slice(start, start + COMMIT_CHUNK);
      for (const record of chunk) {
        const payload = record.payload as Record<string, string>;
        const line = [
          payload["Bokföringsdatum"] ?? "",
          payload["Valutadatum"] ?? "",
          payload["Verifikationsnummer"] ?? "",
          payload["Text"] ?? "",
          payload["Belopp"] ?? "",
          payload["Saldo"] ?? "",
        ].join(";");
        const parsed = parseSebRow(line, record.rowNumber ?? 0);
        if (!parsed.ok) {
          await db
            .update(rawImportRecords)
            .set({ processingStatus: "FAILED" })
            .where(eq(rawImportRecords.id, record.id));
          failed += 1;
          continue;
        }

        const fingerprint = record.hash;
        const [already] = await db
          .select({ id: sourceTransactions.id })
          .from(sourceTransactions)
          .where(
            and(
              eq(sourceTransactions.householdId, input.householdId),
              eq(sourceTransactions.accountId, account.id),
              eq(sourceTransactions.fingerprint, fingerprint),
            ),
          )
          .limit(1);
        if (already) {
          // Already imported: recorded, and deliberately not re-created.
          await db
            .update(rawImportRecords)
            .set({ processingStatus: "IGNORED" })
            .where(eq(rawImportRecords.id, record.id));
          skipped += 1;
          continue;
        }

        const row = parsed.row;
        const reviewReason =
          row.warning === "UNREADABLE_BALANCE"
            ? "UNREADABLE_BALANCE"
            : await this.reviewReasonFor(input.householdId, account.id, row);

        try {
          const isIncome = row.amountMinor > 0n;
          const magnitude = isIncome ? row.amountMinor : -row.amountMinor;
          // A zero-amount statement row has no economic effect. It is preserved
          // and marked, never turned into a balanced event with no postings.
          if (magnitude === 0n) {
            await db
              .update(rawImportRecords)
              .set({ processingStatus: "IGNORED" })
              .where(eq(rawImportRecords.id, record.id));
            skipped += 1;
            continue;
          }

          const draft = isIncome
            ? buildIncome({
                cashAccountId: account.id,
                incomeAccountId,
                amountMinor: magnitude,
                currency: "SEK",
              })
            : buildCashExpense({
                cashAccountId: account.id,
                expenseAccountId,
                amountMinor: magnitude,
                currency: "SEK",
              });

          const description =
            row.rawDescription.trim().slice(0, SEB_MAX_DESCRIPTION_CHARS) ||
            "Okänd transaktion";

          await persistBalancedEvent({
            householdId: input.householdId,
            draft,
            occurredOn: row.bookingDate,
            description,
            incomeAmountMinor: isIncome ? magnitude : 0n,
            sourceAccountId: account.id,
            sourceAmountMinor: row.amountMinor,
            importBatchId: batch.id,
            // Source identity, so a retry resolves to this same event instead of
            // creating a second one.
            externalId: fingerprint,
            commandType: "IMPORT_STATEMENT_ROW",
            sourceType: "import",
            sourceTx: {
              fingerprint,
              valueDate: row.valueDate,
              rawDescription: row.rawDescription,
              providerReference: row.providerReference || null,
              reportedBalanceAfterMinor: row.reportedBalanceAfterMinor,
              sourceRecordId: record.id,
              sourceId: batch.sourceId ?? undefined,
              reviewReason,
            },
          });

          await db
            .update(rawImportRecords)
            .set({ processingStatus: "COMPLETED" })
            .where(eq(rawImportRecords.id, record.id));
          created += 1;
          if (reviewReason) review += 1;
        } catch {
          await db
            .update(rawImportRecords)
            .set({ processingStatus: "FAILED" })
            .where(eq(rawImportRecords.id, record.id));
          failed += 1;
        }
      }
    }

    // SEB's Saldo becomes reported evidence at the statement's closing date —
    // one sparse snapshot, never a posting and never a competing truth.
    if (batch.closingBalanceMinor !== null && batch.periodEnd) {
      await db
        .insert(accountBalanceSnapshots)
        .values({
          householdId: input.householdId,
          accountId: account.id,
          reportedBalanceMinor: batch.closingBalanceMinor,
          asOf: new Date(`${batch.periodEnd}T23:59:59.000Z`),
          source: "seb_statement",
          userVerified: false,
          isEstimated: false,
        })
        .onConflictDoUpdate({
          target: [
            accountBalanceSnapshots.accountId,
            accountBalanceSnapshots.asOf,
            accountBalanceSnapshots.source,
          ],
          set: { reportedBalanceMinor: batch.closingBalanceMinor },
        });

      await db
        .update(accounts)
        .set({ reportedBalanceMinor: batch.closingBalanceMinor, lastSyncedAt: new Date() })
        .where(eq(accounts.id, account.id));
    }

    // What the whole file amounted to: rows recognised at preservation plus rows
    // this commit skipped.
    const existing = (batch.existingRecords ?? 0) + skipped;

    const hasWarnings =
      failed > 0 ||
      review > 0 ||
      (batch.invalidRecords ?? 0) > 0 ||
      (batch.balanceChainStatus !== null &&
        batch.balanceChainStatus !== "RECONCILED" &&
        batch.balanceChainStatus !== "INSUFFICIENT_DATA");

    const [finished] = await db
      .update(importBatches)
      .set({
        // Only set once every row has been processed, so a batch is never
        // reported complete while economic work is still outstanding.
        status: hasWarnings ? "COMPLETED_WITH_WARNINGS" : "COMPLETED",
        completedAt: new Date(),
        createdCount: created,
        ignoredCount: existing,
        failedCount: failed,
        reviewRecords: review,
        newRecords: created,
        existingRecords: existing,
        message: null,
      })
      .where(eq(importBatches.id, batch.id))
      .returning();

    await this.audit({
      householdId: input.householdId,
      actorUserId: userId,
      action: hasWarnings ? "import.statement.completed_with_warnings" : "import.statement.completed",
      entityId: batch.id,
      after: { created, existing, failed, review },
    });

    return {
      batchId: batch.id,
      status: finished.status,
      created,
      existing,
      failed,
      review,
      invalid: batch.invalidRecords ?? 0,
      balanceChainStatus: batch.balanceChainStatus,
      accountId: account.id,
    };
  }

  /**
   * Does this imported row plausibly duplicate something already recorded?
   *
   * Manual entries are never deleted or merged. Weak evidence — same account,
   * same amount, a few days apart — produces a review item and nothing more.
   * Descriptions are not compared, because "ICA" and "ICA MAXI STORMARKNAD" are
   * the same shop.
   */
  private async reviewReasonFor(
    householdId: string,
    accountId: string,
    row: SebParsedRow,
  ): Promise<string | null> {
    const db = getDb();
    const [candidate] = await db
      .select({ id: sourceTransactions.id })
      .from(sourceTransactions)
      .where(
        and(
          eq(sourceTransactions.householdId, householdId),
          eq(sourceTransactions.accountId, accountId),
          eq(sourceTransactions.amountMinor, row.amountMinor),
          // A manual entry: no import provenance.
          isNull(sourceTransactions.importBatchId),
          sql`abs(${sourceTransactions.bookingDate} - ${row.bookingDate}::date) <= ${DUPLICATE_DAY_WINDOW}`,
        ),
      )
      .limit(1);
    return candidate ? "POSSIBLE_DUPLICATE" : null;
  }

  /** The household's system account for expenses or income. */
  private async systemAccountId(
    householdId: string,
    type: "EXPENSE" | "INCOME",
  ): Promise<string> {
    const db = getDb();
    const [existing] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.householdId, householdId),
          eq(accounts.accountType, type),
          eq(accounts.isSystem, true),
        ),
      )
      .limit(1);
    if (existing) return existing.id;
    const [created] = await db
      .insert(accounts)
      .values({
        householdId,
        name: type === "EXPENSE" ? "Utgifter" : "Inkomster",
        accountType: type,
        currency: "SEK",
        isSystem: true,
      })
      .returning({ id: accounts.id });
    return created.id;
  }

  /* ------------------------------------------------------------- history */

  /** Import history for `/imports`. */
  async history(userId: string, householdId: string) {
    await this.access.requireMembership(userId, householdId);
    const db = getDb();
    const rows = await db
      .select({
        id: importBatches.id,
        provider: importBatches.provider,
        format: importBatches.format,
        fileName: importBatches.fileName,
        startedAt: importBatches.startedAt,
        completedAt: importBatches.completedAt,
        status: importBatches.status,
        totalRecords: importBatches.totalRecords,
        newRecords: importBatches.newRecords,
        existingRecords: importBatches.existingRecords,
        reviewRecords: importBatches.reviewRecords,
        invalidRecords: importBatches.invalidRecords,
        failedCount: importBatches.failedCount,
        periodStart: importBatches.periodStart,
        periodEnd: importBatches.periodEnd,
        balanceChainStatus: importBatches.balanceChainStatus,
        closingBalanceMinor: importBatches.closingBalanceMinor,
        accountName: accounts.name,
        accountId: importBatches.targetAccountId,
      })
      .from(importBatches)
      .leftJoin(accounts, eq(importBatches.targetAccountId, accounts.id))
      .where(
        and(
          eq(importBatches.householdId, householdId),
          isNotNull(importBatches.provider),
        ),
      )
      .orderBy(desc(importBatches.startedAt))
      .limit(50);

    return {
      items: rows.map((row) => ({
        ...row,
        closingBalanceMinor: row.closingBalanceMinor?.toString() ?? null,
      })),
    };
  }

  /** One batch, with its reconciliation detail. */
  async batch(userId: string, householdId: string, batchId: string) {
    await this.access.requireMembership(userId, householdId);
    const db = getDb();
    const [batch] = await db
      .select()
      .from(importBatches)
      .where(
        and(eq(importBatches.id, batchId), eq(importBatches.householdId, householdId)),
      )
      .limit(1);
    if (!batch) {
      throw new NotFoundException({
        code: "IMPORT_BATCH_NOT_FOUND",
        message: "Importen hittades inte.",
      });
    }
    const [account] = batch.targetAccountId
      ? await db
          .select({ name: accounts.name, currency: accounts.currency })
          .from(accounts)
          .where(eq(accounts.id, batch.targetAccountId))
          .limit(1)
      : [undefined];

    // The rows SEB sent that could not be used, so the user can see exactly what
    // was refused and why.
    const invalid = await db
      .select({
        rowNumber: rawImportRecords.rowNumber,
        payload: rawImportRecords.payload,
      })
      .from(rawImportRecords)
      .where(
        and(
          eq(rawImportRecords.importBatchId, batch.id),
          eq(rawImportRecords.processingStatus, "FAILED"),
        ),
      )
      .orderBy(asc(rawImportRecords.rowNumber))
      .limit(50);

    return {
      id: batch.id,
      provider: batch.provider,
      format: batch.format,
      fileName: batch.fileName,
      fileHash: batch.fileHash,
      status: batch.status,
      startedAt: batch.startedAt,
      completedAt: batch.completedAt,
      accountId: batch.targetAccountId,
      accountName: account?.name ?? null,
      currency: account?.currency ?? "SEK",
      periodStart: batch.periodStart,
      periodEnd: batch.periodEnd,
      totalRecords: batch.totalRecords,
      newRecords: batch.newRecords,
      existingRecords: batch.existingRecords,
      reviewRecords: batch.reviewRecords,
      invalidRecords: batch.invalidRecords,
      failedCount: batch.failedCount,
      balanceChainStatus: batch.balanceChainStatus,
      balanceChain: batch.balanceChain ?? null,
      closingBalanceMinor: batch.closingBalanceMinor?.toString() ?? null,
      invalidRows: invalid.map((row) => ({
        rowNumber: row.rowNumber,
        detail:
          (row.payload as Record<string, string>)["__detail"] ??
          "Raden kunde inte tolkas.",
        issue: (row.payload as Record<string, string>)["__issue"] ?? null,
      })),
    };
  }
}
