import type { SebParsedRow } from "./seb-csv-format";

/**
 * Validate a statement against its own reported running balance.
 *
 * SEB reports `Saldo` after every transaction, which lets the import check the
 * source instead of trusting it: for adjacent rows in chronological order,
 * `balance_before + amount == balance_after`.
 *
 * All arithmetic is bigint. The result is reported honestly — an import is never
 * described as reconciled when the statement does not add up.
 */

export type BalanceChainDirection = "ASCENDING" | "DESCENDING" | "UNDETERMINED";

export type BalanceChainStatus =
  | "RECONCILED"
  | "RECONCILED_WITH_WARNINGS"
  | "BROKEN"
  | "INSUFFICIENT_DATA";

export type BalanceChainBreak = {
  rowNumber: number;
  bookingDate: string;
  expectedBalanceMinor: string;
  reportedBalanceMinor: string;
  differenceMinor: string;
};

export type SebBalanceChainResult = {
  rowsChecked: number;
  rowsReconciled: number;
  breakCount: number;
  breaks: BalanceChainBreak[];
  openingReportedBalanceMinor: string | null;
  closingReportedBalanceMinor: string | null;
  closingBookingDate: string | null;
  direction: BalanceChainDirection;
  status: BalanceChainStatus;
};

/**
 * How many breaks are tolerable before the chain is called broken.
 *
 * A handful of breaks is the signature of an export cut mid-day or of an
 * ambiguous overlap, and those are worth showing individually. Beyond that the
 * statement is not describing a single consistent sequence and saying so is more
 * useful than listing every row.
 */
const WARNING_BREAK_LIMIT = 5;
/** Enough breaks to list for a person without producing a wall of rows. */
const MAX_REPORTED_BREAKS = 25;

/**
 * Detect the file's ordering from the rows themselves.
 *
 * Assuming an order would silently invert every check on a descending export, so
 * an order that cannot be established is reported rather than guessed.
 */
export function detectChainDirection(
  rows: readonly SebParsedRow[],
): BalanceChainDirection {
  if (rows.length < 2) return "UNDETERMINED";
  const first = rows[0]!.bookingDate;
  const last = rows[rows.length - 1]!.bookingDate;
  if (first < last) return "ASCENDING";
  if (first > last) return "DESCENDING";
  return "UNDETERMINED";
}

/**
 * Walk the chain.
 *
 * `rows` must be in file order; this function puts them in chronological order
 * itself based on the detected direction, so the caller does not have to know
 * which way the bank exported.
 */
export function validateBalanceChain(
  rows: readonly SebParsedRow[],
): SebBalanceChainResult {
  const withBalance = rows.filter((row) => row.reportedBalanceAfterMinor !== null);
  const direction = detectChainDirection(rows);

  if (withBalance.length < 2) {
    return {
      rowsChecked: withBalance.length,
      rowsReconciled: 0,
      breakCount: 0,
      breaks: [],
      openingReportedBalanceMinor:
        withBalance[0]?.reportedBalanceAfterMinor?.toString() ?? null,
      closingReportedBalanceMinor:
        withBalance[withBalance.length - 1]?.reportedBalanceAfterMinor?.toString() ?? null,
      closingBookingDate: withBalance[withBalance.length - 1]?.bookingDate ?? null,
      direction,
      status: "INSUFFICIENT_DATA",
    };
  }

  // An undetermined direction (every row on one date) still has a usable
  // sequence: the file's own order. Treating it as chronological is the only
  // reading available, and the result is reported as such.
  const chronological =
    direction === "DESCENDING" ? [...withBalance].reverse() : [...withBalance];

  const breaks: BalanceChainBreak[] = [];
  let reconciled = 0;

  for (let i = 1; i < chronological.length; i++) {
    const previous = chronological[i - 1]!;
    const current = chronological[i]!;
    const expected = previous.reportedBalanceAfterMinor! + current.amountMinor;
    const reported = current.reportedBalanceAfterMinor!;
    if (expected === reported) {
      reconciled += 1;
      continue;
    }
    if (breaks.length < MAX_REPORTED_BREAKS) {
      breaks.push({
        rowNumber: current.rowNumber,
        bookingDate: current.bookingDate,
        expectedBalanceMinor: expected.toString(),
        reportedBalanceMinor: reported.toString(),
        differenceMinor: (reported - expected).toString(),
      });
    }
  }

  const links = chronological.length - 1;
  const breakCount = links - reconciled;
  const status: BalanceChainStatus =
    breakCount === 0
      ? "RECONCILED"
      : breakCount <= WARNING_BREAK_LIMIT
        ? "RECONCILED_WITH_WARNINGS"
        : "BROKEN";

  return {
    rowsChecked: links,
    rowsReconciled: reconciled,
    breakCount,
    breaks,
    openingReportedBalanceMinor:
      chronological[0]!.reportedBalanceAfterMinor!.toString(),
    closingReportedBalanceMinor:
      chronological[chronological.length - 1]!.reportedBalanceAfterMinor!.toString(),
    closingBookingDate: chronological[chronological.length - 1]!.bookingDate,
    direction,
    status,
  };
}
