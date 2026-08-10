/**
 * Synthetic SEB statements for tests and acceptance.
 *
 * A real bank statement is never committed to this repository and never used as
 * a fixture. These generators reproduce the *structure* of SEB's export — UTF-8
 * BOM, semicolon delimiter, the six headers, `YYYY-MM-DD` dates, three-decimal
 * amounts and a running balance — with invented merchants and amounts.
 *
 * The balance chain is computed as the rows are built, so a generated statement
 * reconciles by construction and a deliberate break is a deliberate change.
 */

import { SEB_HEADERS } from "../seb-csv-format";

const BOM = "\uFEFF";

export type SyntheticRow = {
  bookingDate: string;
  valueDate?: string;
  reference: string;
  text: string;
  /** Öre. Converted to SEB's three-decimal form on serialization. */
  amountMinor: bigint;
};

/** Render öre as SEB does: three decimals, third always 0. */
export function minorToSebDecimal(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / 100n;
  const ore = abs % 100n;
  return `${negative ? "-" : ""}${whole}.${ore.toString().padStart(2, "0")}0`;
}

/**
 * Serialize rows into a SEB CSV, chaining the balance from `openingBalanceMinor`.
 *
 * `direction` controls export order. `breakAtRow` corrupts one reported balance
 * so a broken chain can be tested without hand-writing a file.
 */
export function buildSebCsv(input: {
  rows: SyntheticRow[];
  openingBalanceMinor: bigint;
  direction?: "ASCENDING" | "DESCENDING";
  breakAtRow?: number;
  includeBom?: boolean;
  /** Omit the Saldo column's values, as an export without running balances. */
  withoutBalances?: boolean;
}): string {
  const {
    rows,
    openingBalanceMinor,
    direction = "ASCENDING",
    breakAtRow,
    includeBom = true,
    withoutBalances = false,
  } = input;

  let balance = openingBalanceMinor;
  const lines = rows.map((row, index) => {
    balance += row.amountMinor;
    const reported = breakAtRow === index + 1 ? balance + 5000n : balance;
    return [
      row.bookingDate,
      row.valueDate ?? row.bookingDate,
      row.reference,
      row.text,
      minorToSebDecimal(row.amountMinor),
      withoutBalances ? "" : minorToSebDecimal(reported),
    ].join(";");
  });

  const ordered = direction === "DESCENDING" ? [...lines].reverse() : lines;
  return `${includeBom ? BOM : ""}${SEB_HEADERS.join(";")}\n${ordered.join("\n")}\n`;
}

const MERCHANTS = [
  "ICA MAXI STORMARKNAD",
  "COOP FORUM",
  "APOTEKET AB",
  "SL BILJETT",
  "APPLE COM/BI",
  "SPOTIFY AB",
  "CIRCLE K",
  "SYSTEMBOLAGET",
  "H&M SVERIGE",
  "IKEA KUNGENS KURVA",
  "HYRA BOSTAD",
  "ELNÄT AB",
  "46700280624",
  "BG MAX INBETALNING",
  "SWISH BETALNING",
];

/** Deterministic pseudo-random, so a generated statement is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addDays(iso: string, days: number): string {
  // Date-only arithmetic through UTC, so no local timezone can shift a day.
  const [y, m, d] = iso.split("-").map(Number);
  const base = Date.UTC(y!, m! - 1, d!) + days * 86_400_000;
  return new Date(base).toISOString().slice(0, 10);
}

/**
 * A multi-year statement of the same shape and scale as a real export.
 *
 * Amounts are whole öre so every row is exactly representable; precision
 * refusals are exercised by their own fixtures rather than mixed in here.
 */
export function generateSyntheticStatement(input: {
  rowCount: number;
  startDate: string;
  endDate: string;
  openingBalanceMinor: bigint;
  seed?: number;
}): SyntheticRow[] {
  const random = mulberry32(input.seed ?? 20260810);
  const spanDays = Math.max(
    1,
    Math.round(
      (Date.parse(`${input.endDate}T00:00:00Z`) -
        Date.parse(`${input.startDate}T00:00:00Z`)) /
        86_400_000,
    ),
  );
  const rows: SyntheticRow[] = [];
  for (let i = 0; i < input.rowCount; i++) {
    // Spread rows across the period, monotonically, so the chain is ordered.
    // Divided by rowCount - 1 so the last row lands on endDate rather than a day
    // short of it, and the generated statement really covers the stated range.
    const dayOffset = Math.floor((i / Math.max(1, input.rowCount - 1)) * spanDays);
    const bookingDate = addDays(input.startDate, dayOffset);
    const isIncome = i % 30 === 0;
    const magnitude = isIncome
      ? BigInt(2_500_000 + Math.floor(random() * 500_000))
      : BigInt(1_000 + Math.floor(random() * 250_000));
    rows.push({
      bookingDate,
      valueDate: bookingDate,
      // SEB reuses references; a small pool guarantees collisions.
      reference: String(100000 + (i % 900)),
      text: isIncome ? "LÖN ARBETSGIVARE AB" : MERCHANTS[i % MERCHANTS.length]!,
      amountMinor: isIncome ? magnitude : -magnitude,
    });
  }
  return rows;
}

/**
 * The small hand-built fixture: every case the design has to answer.
 *
 * Deliberately readable, so a reviewer can see what each row is for.
 */
export function referenceStatementRows(): SyntheticRow[] {
  return [
    // A positive and a negative row.
    { bookingDate: "2026-01-02", reference: "500001", text: "LÖN ARBETSGIVARE AB", amountMinor: 2_500_000n },
    { bookingDate: "2026-01-03", reference: "500002", text: "ICA MAXI STORMARKNAD", amountMinor: -124_800n },
    // A duplicate provider reference on an unrelated transaction.
    { bookingDate: "2026-01-04", reference: "500002", text: "APOTEKET AB", amountMinor: -8_900n },
    // Two identical-looking transactions: same day, amount and text.
    { bookingDate: "2026-01-05", reference: "500003", text: "CAFE ESPRESSO", amountMinor: -4_500n },
    { bookingDate: "2026-01-05", reference: "500003", text: "CAFE ESPRESSO", amountMinor: -4_500n },
    // A transfer candidate, in wording the existing review logic recognises.
    { bookingDate: "2026-01-07", reference: "500004", text: "ÖVERFÖRING SPARKONTO", amountMinor: -500_000n },
    // Description that must be allowed to stay unknown.
    { bookingDate: "2026-01-08", reference: "500005", text: "46700280624", amountMinor: -31_500n },
    // A value date later than the booking date.
    { bookingDate: "2026-01-09", valueDate: "2026-01-12", reference: "500006", text: "SL BILJETT", amountMinor: -3_900n },
    // Exactly one öre, to prove the third decimal is handled at the boundary.
    { bookingDate: "2026-01-10", reference: "500007", text: "AVRUNDNING", amountMinor: -1n },
  ];
}
