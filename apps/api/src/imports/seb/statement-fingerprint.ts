import { createHash } from "node:crypto";
import type { SebParsedRow } from "./seb-csv-format";
import { SEB_SCHEMA_VERSION } from "./seb-csv-format";

/**
 * Source identity for an imported statement row.
 *
 * `Verifikationsnummer` is not unique in SEB's export and is never used alone.
 * The fingerprint is a hash over the fields that together identify a row on one
 * account, plus an occurrence index that keeps two genuinely identical rows
 * distinct.
 *
 * The governing rule, from `docs/imports/SEB_CSV_DESIGN.md`: prefer a false
 * review over silently dropping a real transaction. A fingerprint that is too
 * specific costs a duplicate the user can merge; one that is too loose destroys
 * a transaction that happened.
 */

/**
 * Length-prefix every field before joining.
 *
 * Without it, `"a" + "bc"` and `"ab" + "c"` hash identically, so a description
 * ending in a digit and an amount could imitate a different row. With it, no
 * combination of contents can collide by shifting a boundary.
 */
function canonical(parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join("|");
}

export type FingerprintInput = {
  accountId: string;
  bookingDate: string;
  valueDate: string | null;
  providerReference: string;
  rawDescription: string;
  amountMinor: bigint;
  reportedBalanceAfterMinor: bigint | null;
  /**
   * How many earlier rows in the same file share this exact field tuple.
   *
   * Two legitimately identical transactions — same day, same amount, same text —
   * would otherwise hash the same and one would be discarded. SEB's running
   * balance already separates them in practice, because two separate
   * transactions leave different balances behind; this covers the remainder,
   * such as a zero-amount pair.
   */
  occurrenceIndex: number;
};

export function statementRowFingerprint(input: FingerprintInput): string {
  return createHash("sha256")
    .update(
      canonical([
        SEB_SCHEMA_VERSION,
        input.accountId,
        input.bookingDate,
        input.valueDate ?? "",
        input.providerReference,
        input.rawDescription,
        input.amountMinor.toString(),
        input.reportedBalanceAfterMinor === null
          ? ""
          : input.reportedBalanceAfterMinor.toString(),
        String(input.occurrenceIndex),
      ]),
    )
    .digest("hex");
}

/** The tuple that decides whether two rows are "identical looking". */
function identityTuple(row: SebParsedRow): string {
  return canonical([
    row.bookingDate,
    row.valueDate ?? "",
    row.providerReference,
    row.rawDescription,
    row.amountMinor.toString(),
    row.reportedBalanceAfterMinor === null
      ? ""
      : row.reportedBalanceAfterMinor.toString(),
  ]);
}

/**
 * Assign occurrence indices across a whole file, then fingerprint every row.
 *
 * Done per file rather than per row so that re-importing the same file assigns
 * the same indices and therefore the same fingerprints. An overlapping export
 * re-states the same rows in the same order, so the indices are stable there
 * too.
 */
export function fingerprintStatementRows(
  accountId: string,
  rows: readonly SebParsedRow[],
): Map<number, string> {
  const seen = new Map<string, number>();
  const byRowNumber = new Map<number, string>();
  for (const row of rows) {
    const tuple = identityTuple(row);
    const occurrenceIndex = seen.get(tuple) ?? 0;
    seen.set(tuple, occurrenceIndex + 1);
    byRowNumber.set(
      row.rowNumber,
      statementRowFingerprint({
        accountId,
        bookingDate: row.bookingDate,
        valueDate: row.valueDate,
        providerReference: row.providerReference,
        rawDescription: row.rawDescription,
        amountMinor: row.amountMinor,
        reportedBalanceAfterMinor: row.reportedBalanceAfterMinor,
        occurrenceIndex,
      }),
    );
  }
  return byRowNumber;
}

/** SHA-256 of the uploaded bytes. Audit and recognition only, never dedupe. */
export function fileContentHash(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
