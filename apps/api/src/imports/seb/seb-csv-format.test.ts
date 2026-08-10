import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectSebCsv,
  parseSebAmountToMinor,
  parseSebDate,
  parseSebRow,
  splitSebRow,
  neutraliseCsvFormula,
  SEB_HEADERS,
} from "./seb-csv-format";

const BOM = "\uFEFF";
const HEADER = SEB_HEADERS.join(";");

function file(body: string, { bom = true } = {}): Buffer {
  return Buffer.from(`${bom ? BOM : ""}${HEADER}\n${body}`, "utf8");
}

describe("SEB CSV detection", () => {
  it("recognises the export, with or without a BOM", () => {
    const withBom = detectSebCsv(file("2026-08-08;2026-08-08;123;ICA;-130.930;596242.280\n"));
    assert.equal(withBom.recognised, true);
    assert.equal(withBom.recognised && withBom.provider, "SEB");
    assert.equal(withBom.recognised && withBom.format, "SEB_CSV_ACCOUNT_STATEMENT");
    assert.equal(withBom.recognised && withBom.version, 1);
    assert.equal(withBom.recognised && withBom.confidence, 1);
    assert.equal(withBom.recognised && withBom.hadBom, true);

    const withoutBom = detectSebCsv(file("2026-08-08;;1;X;1.000;1.000\n", { bom: false }));
    assert.equal(withoutBom.recognised, true);
    assert.equal(withoutBom.recognised && withoutBom.hadBom, false);
  });

  it("refuses a comma-separated file carrying the very same headers", () => {
    const result = detectSebCsv(Buffer.from(`${SEB_HEADERS.join(",")}\n2026-01-01,,1,X,1.000,1.000\n`, "utf8"));
    assert.equal(result.recognised, false);
    assert.equal(result.recognised === false && result.reason, "WRONG_DELIMITER");
  });

  it("refuses six unrelated semicolon columns", () => {
    const result = detectSebCsv(Buffer.from("a;b;c;d;e;f\n1;2;3;4;5;6\n", "utf8"));
    assert.equal(result.recognised, false);
    assert.equal(result.recognised === false && result.reason, "UNEXPECTED_HEADERS");
  });

  it("refuses a missing column and an extra column alike", () => {
    const missing = detectSebCsv(Buffer.from(`Bokföringsdatum;Valutadatum;Verifikationsnummer;Text;Belopp\n`, "utf8"));
    assert.equal(missing.recognised === false && missing.reason, "UNEXPECTED_HEADERS");
    const extra = detectSebCsv(Buffer.from(`${HEADER};Extra\n`, "utf8"));
    assert.equal(extra.recognised === false && extra.reason, "UNEXPECTED_HEADERS");
  });

  it("refuses an empty file and a non-UTF8 file", () => {
    assert.equal(detectSebCsv(Buffer.from("", "utf8")).recognised, false);
    assert.equal(detectSebCsv(Buffer.from([0xff, 0xfe, 0x41, 0x00])).recognised, false);
    const notUtf8 = detectSebCsv(Buffer.from([0xc3, 0x28]));
    assert.equal(notUtf8.recognised === false && notUtf8.reason, "NOT_UTF8");
  });

  it("does not look at the filename", () => {
    // A file that is not a SEB statement stays unrecognised whatever it is called.
    const result = detectSebCsv(Buffer.from("Datum;Belopp\n2026-01-01;1\n", "utf8"));
    assert.equal(result.recognised, false);
  });
});

describe("SEB exact money", () => {
  /** Assert an exact conversion, failing loudly if the value was refused. */
  function minorOf(raw: string): bigint {
    const parsed = parseSebAmountToMinor(raw);
    assert.equal(parsed.ok, true, `${raw} should parse`);
    if (!parsed.ok) throw new Error("unreachable");
    return parsed.minor;
  }

  it("converts the observed three-decimal values exactly", () => {
    assert.equal(minorOf("100.000"), 10000n);
    assert.equal(minorOf("-130.930"), -13093n);
    assert.equal(minorOf("596242.280"), 59624228n);
    assert.equal(minorOf("0.010"), 1n);
    assert.equal(minorOf("-306.000"), -30600n);
  });

  it("refuses a third decimal that is not zero, rather than rounding", () => {
    for (const raw of ["0.001", "123.456", "-0.005", "1.999", "10.101"]) {
      const parsed = parseSebAmountToMinor(raw);
      assert.equal(parsed.ok, false, `${raw} must be refused`);
      assert.equal(parsed.ok === false && parsed.reason, "PRECISION");
    }
  });

  it("accepts fewer decimals and refuses more", () => {
    assert.equal(minorOf("5"), 500n);
    assert.equal(minorOf("5.4"), 540n);
    assert.equal(minorOf("5.45"), 545n);
    assert.equal(parseSebAmountToMinor("5.4500").ok, false);
  });

  it("refuses anything it would have to interpret", () => {
    for (const raw of ["", "  ", "abc", "1 000.000", "1,000.000", "1.0.0", "--1.000", "1e3", "NaN"]) {
      assert.equal(parseSebAmountToMinor(raw).ok, false, `${raw} must be refused`);
    }
  });

  it("is exact at magnitudes a float would corrupt", () => {
    // 0.1 + 0.2 territory, and beyond Number.MAX_SAFE_INTEGER in öre.
    assert.equal(minorOf("0.100"), 10n);
    assert.equal(minorOf("0.200"), 20n);
    assert.equal(minorOf("999999999999999.990"), 99999999999999999n);
    // The same value through a float loses the last digit entirely. Compared as
    // strings, because the corrupted number cannot be written as a literal.
    assert.equal(String(Math.round(999999999999999.99 * 100)), "100000000000000000");
    assert.equal(minorOf("999999999999999.990").toString(), "99999999999999999");
  });
});

describe("SEB dates", () => {
  it("accepts an exact ISO date", () => {
    const parsed = parseSebDate("2026-08-10");
    assert.equal(parsed.ok, true);
    assert.equal(parsed.ok && parsed.date, "2026-08-10");
    assert.equal(parseSebDate("2024-02-29").ok, true, "2024 is a leap year");
  });

  it("refuses impossible and malformed dates without coercing", () => {
    for (const raw of ["2026-02-30", "2026-13-01", "2026-00-10", "2026-08-00", "26-08-10", "2026/08/10", "", "2026-8-1", "2023-02-29"]) {
      assert.equal(parseSebDate(raw).ok, false, `${raw} must be refused`);
    }
  });
});

describe("SEB row parsing", () => {
  it("preserves the source values verbatim", () => {
    const result = parseSebRow("2026-08-08;2026-08-09;  12345  ; APPLE COM/BI/26-08-08 ;-130.930;596242.280", 7);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.row.rowNumber, 7);
    assert.equal(result.row.bookingDate, "2026-08-08");
    assert.equal(result.row.valueDate, "2026-08-09");
    assert.equal(result.row.providerReference, "12345");
    // Raw description keeps its original spacing.
    assert.equal(result.row.rawDescription, " APPLE COM/BI/26-08-08 ");
    assert.equal(result.row.amountMinor, -13093n);
    assert.equal(result.row.reportedBalanceAfterMinor, 59624228n);
    // The payload is exactly what the file said, including the third decimal.
    assert.equal(result.row.payload["Belopp"], "-130.930");
    assert.equal(result.row.payload["Saldo"], "596242.280");
    assert.equal(result.row.payload["Bokföringsdatum"], "2026-08-08");
  });

  it("reports an unrepresentable amount as a precision issue, with its payload", () => {
    const result = parseSebRow("2026-08-08;2026-08-08;1;Ränta;0.001;100.000", 3);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.issue, "INVALID_AMOUNT_PRECISION");
    assert.equal(result.rowNumber, 3);
    assert.equal(result.payload["Belopp"], "0.001");
    assert.match(result.detail, /avrundas inte/);
  });

  it("reports a wrong column count and a bad date rather than throwing", () => {
    const short = parseSebRow("2026-08-08;2026-08-08;1;X;1.000", 1);
    assert.equal(short.ok === false && short.issue, "COLUMN_COUNT");
    const badDate = parseSebRow("2026-02-30;2026-08-08;1;X;1.000;1.000", 2);
    assert.equal(badDate.ok === false && badDate.issue, "INVALID_BOOKING_DATE");
    const badValueDate = parseSebRow("2026-08-08;2026-02-30;1;X;1.000;1.000", 2);
    assert.equal(badValueDate.ok === false && badValueDate.issue, "INVALID_VALUE_DATE");
  });

  it("tolerates an absent value date and an absent balance", () => {
    const result = parseSebRow("2026-08-08;;1;X;-1.000;", 1);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.row.valueDate, null);
    assert.equal(result.row.reportedBalanceAfterMinor, null);
  });

  it("keeps a semicolon inside a quoted description from shifting the columns", () => {
    const fields = splitSebRow('2026-08-08;2026-08-08;1;"BUTIK; AB";-1.000;2.000');
    assert.equal(fields.length, 6);
    assert.equal(fields[3], "BUTIK; AB");
    assert.equal(fields[4], "-1.000");
  });

  it("refuses an absurdly long row", () => {
    const long = `2026-08-08;2026-08-08;1;${"x".repeat(5000)};-1.000;2.000`;
    const result = parseSebRow(long, 1);
    assert.equal(result.ok === false && result.issue, "ROW_TOO_LONG");
  });
});

describe("CSV formula neutralisation", () => {
  it("prefixes values a spreadsheet would execute, and leaves ordinary text alone", () => {
    assert.equal(neutraliseCsvFormula("=cmd|'/c calc'!A1"), "'=cmd|'/c calc'!A1");
    assert.equal(neutraliseCsvFormula("+1234"), "'+1234");
    assert.equal(neutraliseCsvFormula("@SUM(A1)"), "'@SUM(A1)");
    assert.equal(neutraliseCsvFormula("-130.930"), "'-130.930");
    assert.equal(neutraliseCsvFormula("ICA MAXI"), "ICA MAXI");
  });
});
