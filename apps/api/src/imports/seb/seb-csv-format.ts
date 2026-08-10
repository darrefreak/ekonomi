/**
 * SEB CSV account statement — format identity, detection and exact parsing.
 *
 * Everything in this file is pure: strings in, values or typed refusals out. No
 * database, no clock, no floating point. The pipeline that stores rows lives in
 * `statement-import.service.ts`; this module only answers "what did SEB send,
 * exactly".
 *
 * See `docs/imports/SEB_CSV_DESIGN.md`.
 */

export const SEB_PROVIDER = "SEB" as const;
export const SEB_SOURCE_KIND = "FILE_IMPORT" as const;
export const SEB_FORMAT = "SEB_CSV_ACCOUNT_STATEMENT" as const;
export const SEB_FORMAT_VERSION = 1 as const;
/** Written to `raw_import_records.schema_version`. */
export const SEB_SCHEMA_VERSION = "SEB_CSV_ACCOUNT_STATEMENT_V1" as const;

export const SEB_DELIMITER = ";" as const;

/** The six headers, by name and in order. Column count alone is never evidence. */
export const SEB_HEADERS = [
  "Bokföringsdatum",
  "Valutadatum",
  "Verifikationsnummer",
  "Text",
  "Belopp",
  "Saldo",
] as const;

/** V1 upload limits. Roughly twenty times a five-year statement. */
export const SEB_MAX_DECODED_BYTES = 8 * 1024 * 1024;
export const SEB_MAX_BASE64_CHARS = 12_000_000;
export const SEB_MAX_DATA_ROWS = 100_000;
export const SEB_MAX_ROW_CHARS = 4_000;
/** The normalized description is bounded; the raw payload keeps the original. */
export const SEB_MAX_DESCRIPTION_CHARS = 500;

export type SebDetection =
  | {
      recognised: true;
      provider: typeof SEB_PROVIDER;
      sourceKind: typeof SEB_SOURCE_KIND;
      format: typeof SEB_FORMAT;
      version: typeof SEB_FORMAT_VERSION;
      confidence: 1;
      hadBom: boolean;
    }
  | { recognised: false; reason: SebDetectionRefusal; detail: string };

export type SebDetectionRefusal =
  | "EMPTY_FILE"
  | "NOT_UTF8"
  | "WRONG_DELIMITER"
  | "UNEXPECTED_HEADERS"
  | "TOO_LARGE"
  | "TOO_MANY_ROWS";

const BOM = "\uFEFF";

/**
 * Decode upload bytes as UTF-8, refusing anything that is not.
 *
 * `TextDecoder` with `fatal` is the only decoder here that will not quietly
 * substitute U+FFFD for broken input, which would turn a corrupt file into a
 * statement full of replacement characters.
 */
export function decodeSebCsv(
  bytes: Buffer | Uint8Array,
): { ok: true; text: string; hadBom: boolean } | { ok: false; reason: "NOT_UTF8" | "TOO_LARGE" } {
  if (bytes.byteLength > SEB_MAX_DECODED_BYTES) return { ok: false, reason: "TOO_LARGE" };
  // Read the BOM from the bytes: TextDecoder removes it during decoding, so the
  // decoded string cannot tell us whether the file had one.
  const hadBom = bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, reason: "NOT_UTF8" };
  }
  // Defensive: strip a decoded BOM too, in case a decoder preserves it.
  return { ok: true, text: text.startsWith(BOM) ? text.slice(BOM.length) : text, hadBom };
}

/** Split on CRLF or LF, dropping a trailing blank line. */
export function splitSebLines(text: string): string[] {
  const lines = text.split(/\r\n|\n|\r/);
  while (lines.length && lines[lines.length - 1]!.trim() === "") lines.pop();
  return lines;
}

/**
 * Header-only detection.
 *
 * Strict on purpose: a comma file carrying the same six names, or six unrelated
 * semicolon columns, is not a SEB statement. A changed export shape should be
 * noticed by a person rather than guessed at.
 */
export function detectSebCsv(bytes: Buffer | Uint8Array): SebDetection {
  const decoded = decodeSebCsv(bytes);
  if (!decoded.ok) {
    return {
      recognised: false,
      reason: decoded.reason,
      detail:
        decoded.reason === "TOO_LARGE"
          ? `Filen är större än ${Math.floor(SEB_MAX_DECODED_BYTES / (1024 * 1024))} MB.`
          : "Filen är inte giltig UTF-8-text.",
    };
  }
  const lines = splitSebLines(decoded.text);
  if (!lines.length || !lines[0]!.trim()) {
    return { recognised: false, reason: "EMPTY_FILE", detail: "Filen innehåller ingen data." };
  }
  if (lines.length - 1 > SEB_MAX_DATA_ROWS) {
    return {
      recognised: false,
      reason: "TOO_MANY_ROWS",
      detail: `Filen har fler än ${SEB_MAX_DATA_ROWS} rader.`,
    };
  }

  const header = lines[0]!;
  if (!header.includes(SEB_DELIMITER)) {
    return {
      recognised: false,
      reason: "WRONG_DELIMITER",
      detail: "Filen är inte semikolonseparerad.",
    };
  }

  const columns = header.split(SEB_DELIMITER).map((c) => c.trim().replace(/^"|"$/g, ""));
  const expected = SEB_HEADERS as readonly string[];
  const matches =
    columns.length === expected.length &&
    columns.every((column, index) => column === expected[index]);
  if (!matches) {
    return {
      recognised: false,
      reason: "UNEXPECTED_HEADERS",
      detail: `Rubrikerna matchar inte SEB:s kontoutdrag. Hittade: ${columns.slice(0, 8).join(", ")}`,
    };
  }

  return {
    recognised: true,
    provider: SEB_PROVIDER,
    sourceKind: SEB_SOURCE_KIND,
    format: SEB_FORMAT,
    version: SEB_FORMAT_VERSION,
    confidence: 1,
    hadBom: decoded.hadBom,
  };
}

/* ----------------------------------------------------------------- money */

export type AmountParse =
  | { ok: true; minor: bigint }
  | { ok: false; reason: "EMPTY" | "NOT_A_NUMBER" | "PRECISION" };

/**
 * Parse a SEB decimal string into öre, exactly.
 *
 * SEB writes three decimals; SEK holds two. Where the third decimal is `0` the
 * value is exactly representable and accepted. Where it is not, the row is
 * refused rather than rounded — a household's money is not adjusted to make an
 * import succeed.
 *
 *   "100.000"    →  10000n
 *   "-130.930"   → -13093n
 *   "596242.280" →  59624228n
 *   "0.010"      →  1n
 *   "0.001"      →  PRECISION
 *   "123.456"    →  PRECISION
 *
 * Digits are accumulated with bigint arithmetic. No float ever holds this value.
 */
export function parseSebAmountToMinor(raw: string): AmountParse {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "EMPTY" };

  // A leading + is not expected from SEB but is unambiguous; anything else
  // non-numeric (spaces inside digits, thousand separators, commas) is refused
  // rather than interpreted.
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) return { ok: false, reason: "NOT_A_NUMBER" };

  const negative = match[1] === "-";
  const whole = BigInt(match[2]!);
  const fraction = match[3] ?? "";

  if (fraction.length > 3) return { ok: false, reason: "PRECISION" };

  // Beyond two decimals, only an exact zero is representable in öre.
  if (fraction.length === 3 && fraction[2] !== "0") {
    return { ok: false, reason: "PRECISION" };
  }

  const ore = BigInt(fraction.slice(0, 2).padEnd(2, "0") || "0");
  const magnitude = whole * 100n + ore;
  return { ok: true, minor: negative ? -magnitude : magnitude };
}

/* ------------------------------------------------------------------ dates */

/**
 * Parse an exact `YYYY-MM-DD` with a real calendar check.
 *
 * Returned as the original date-only string, which is what the Postgres `date`
 * columns hold. Deliberately never constructs a `Date`: a timezone must not be
 * able to move a booking across midnight.
 */
export function parseSebDate(raw: string): { ok: true; date: string } | { ok: false } {
  const trimmed = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return { ok: false };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return { ok: false };
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > lengths[month - 1]!) return { ok: false };
  return { ok: true, date: trimmed };
}

/* -------------------------------------------------------------- row parse */

export type SebRowIssue =
  | "COLUMN_COUNT"
  | "INVALID_BOOKING_DATE"
  | "INVALID_VALUE_DATE"
  | "INVALID_AMOUNT"
  | "INVALID_AMOUNT_PRECISION"
  | "INVALID_BALANCE"
  | "INVALID_BALANCE_PRECISION"
  | "ROW_TOO_LONG";

/** Exactly what SEB provided, with nothing interpreted. */
export type SebParsedRow = {
  rowNumber: number;
  payload: Record<string, string>;
  bookingDate: string;
  valueDate: string | null;
  providerReference: string;
  rawDescription: string;
  amountMinor: bigint;
  reportedBalanceAfterMinor: bigint | null;
};

export type SebRowResult =
  | { ok: true; row: SebParsedRow }
  | { ok: false; rowNumber: number; issue: SebRowIssue; payload: Record<string, string>; detail: string };

/**
 * Split one CSV line.
 *
 * SEB does not quote fields in this export, but a quoted field containing the
 * delimiter is handled so a description with a semicolon cannot shift every
 * later column.
 */
export function splitSebRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === SEB_DELIMITER && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  fields.push(current);
  return fields;
}

/**
 * Parse one data line.
 *
 * A row that cannot be parsed becomes a typed refusal carrying its payload, so
 * the pipeline can still preserve it and tell the user which line and why. One
 * bad row never fails an import.
 */
export function parseSebRow(line: string, rowNumber: number): SebRowResult {
  const emptyPayload: Record<string, string> = { raw: line.slice(0, 200) };
  if (line.length > SEB_MAX_ROW_CHARS) {
    return {
      ok: false,
      rowNumber,
      issue: "ROW_TOO_LONG",
      payload: emptyPayload,
      detail: `Raden är längre än ${SEB_MAX_ROW_CHARS} tecken.`,
    };
  }

  const fields = splitSebRow(line);
  if (fields.length !== SEB_HEADERS.length) {
    return {
      ok: false,
      rowNumber,
      issue: "COLUMN_COUNT",
      payload: emptyPayload,
      detail: `Raden har ${fields.length} kolumner, förväntade ${SEB_HEADERS.length}.`,
    };
  }

  // Preserved verbatim — original spacing, casing and three-decimal strings.
  const payload: Record<string, string> = {};
  SEB_HEADERS.forEach((header, index) => {
    payload[header] = fields[index]!;
  });

  const booking = parseSebDate(fields[0]!);
  if (!booking.ok) {
    return {
      ok: false,
      rowNumber,
      issue: "INVALID_BOOKING_DATE",
      payload,
      detail: `Bokföringsdatum "${fields[0]!.trim().slice(0, 40)}" är inte ett giltigt datum (ÅÅÅÅ-MM-DD).`,
    };
  }

  // An absent value date is tolerated; a present but invalid one is not.
  const valueRaw = fields[1]!.trim();
  let valueDate: string | null = null;
  if (valueRaw) {
    const parsed = parseSebDate(valueRaw);
    if (!parsed.ok) {
      return {
        ok: false,
        rowNumber,
        issue: "INVALID_VALUE_DATE",
        payload,
        detail: `Valutadatum "${valueRaw.slice(0, 40)}" är inte ett giltigt datum (ÅÅÅÅ-MM-DD).`,
      };
    }
    valueDate = parsed.date;
  }

  const amount = parseSebAmountToMinor(fields[4]!);
  if (!amount.ok) {
    return {
      ok: false,
      rowNumber,
      issue: amount.reason === "PRECISION" ? "INVALID_AMOUNT_PRECISION" : "INVALID_AMOUNT",
      payload,
      detail:
        amount.reason === "PRECISION"
          ? `Beloppet "${fields[4]!.trim()}" har fler decimaler än ören kan uttrycka exakt. Raden importeras inte och avrundas inte.`
          : `Beloppet "${fields[4]!.trim().slice(0, 40)}" kunde inte läsas.`,
    };
  }

  // Saldo may legitimately be absent on an export without running balances.
  const balanceRaw = fields[5]!.trim();
  let reportedBalanceAfterMinor: bigint | null = null;
  if (balanceRaw) {
    const balance = parseSebAmountToMinor(balanceRaw);
    if (!balance.ok) {
      return {
        ok: false,
        rowNumber,
        issue:
          balance.reason === "PRECISION" ? "INVALID_BALANCE_PRECISION" : "INVALID_BALANCE",
        payload,
        detail:
          balance.reason === "PRECISION"
            ? `Saldot "${balanceRaw}" har fler decimaler än ören kan uttrycka exakt.`
            : `Saldot "${balanceRaw.slice(0, 40)}" kunde inte läsas.`,
      };
    }
    reportedBalanceAfterMinor = balance.minor;
  }

  return {
    ok: true,
    row: {
      rowNumber,
      payload,
      bookingDate: booking.date,
      valueDate,
      providerReference: fields[2]!.trim(),
      rawDescription: fields[3]!,
      amountMinor: amount.minor,
      reportedBalanceAfterMinor,
    },
  };
}

/* ------------------------------------------------------- formula injection */

/**
 * Neutralise a value that a spreadsheet would treat as a formula.
 *
 * Applied only when rendering or exporting. Stored data keeps the original text,
 * because the payload is evidence of what the bank sent.
 */
export function neutraliseCsvFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
