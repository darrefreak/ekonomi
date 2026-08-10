import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSebRow, type SebParsedRow } from "./seb-csv-format";
import { fingerprintStatementRows, statementRowFingerprint } from "./statement-fingerprint";
import { detectChainDirection, validateBalanceChain } from "./balance-chain";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const OTHER_ACCOUNT = "22222222-2222-4222-8222-222222222222";

function rows(lines: string[]): SebParsedRow[] {
  return lines.map((line, index) => {
    const parsed = parseSebRow(line, index + 1);
    assert.equal(parsed.ok, true, `fixture line ${index + 1} must parse: ${line}`);
    if (!parsed.ok) throw new Error("unreachable");
    return parsed.row;
  });
}

describe("statement row identity", () => {
  it("does not collide when the same Verifikationsnummer appears on different rows", () => {
    // SEB reuses the reference; only the rest of the row differs.
    const parsed = rows([
      "2026-08-08;2026-08-08;99;ICA;-100.000;900.000",
      "2026-08-08;2026-08-08;99;APOTEKET;-50.000;850.000",
      "2026-08-09;2026-08-09;99;LÖN;1000.000;1850.000",
    ]);
    const prints = fingerprintStatementRows(ACCOUNT, parsed);
    assert.equal(new Set(prints.values()).size, 3, "one reference must not merge three transactions");
  });

  it("keeps two genuinely identical-looking transactions apart", () => {
    // Same day, same amount, same text. The running balance differs because two
    // separate transactions happened, which is what makes them distinguishable.
    const parsed = rows([
      "2026-08-08;2026-08-08;1;CAFE;-45.000;955.000",
      "2026-08-08;2026-08-08;1;CAFE;-45.000;910.000",
    ]);
    const prints = fingerprintStatementRows(ACCOUNT, parsed);
    assert.equal(new Set(prints.values()).size, 2, "two real transactions must both survive");
  });

  it("keeps rows apart even when every field including the balance repeats", () => {
    // Only possible for a zero-amount pair, and it must still not collapse.
    const parsed = rows([
      "2026-08-08;2026-08-08;7;JUSTERING;0.000;500.000",
      "2026-08-08;2026-08-08;7;JUSTERING;0.000;500.000",
    ]);
    const prints = fingerprintStatementRows(ACCOUNT, parsed);
    assert.equal(new Set(prints.values()).size, 2, "identical rows must not silently become one");
  });

  it("is stable across runs, so the same file yields the same identities", () => {
    const lines = [
      "2026-08-08;2026-08-08;1;ICA;-100.000;900.000",
      "2026-08-08;2026-08-08;1;ICA;-100.000;800.000",
      "2026-08-09;2026-08-09;2;LÖN;1000.000;1800.000",
    ];
    const first = [...fingerprintStatementRows(ACCOUNT, rows(lines)).values()];
    const second = [...fingerprintStatementRows(ACCOUNT, rows(lines)).values()];
    assert.deepEqual(first, second, "re-importing the same file must reproduce the identities");
  });

  it("scopes identity to the account, so the same statement on two accounts stays separate", () => {
    const lines = ["2026-08-08;2026-08-08;1;ICA;-100.000;900.000"];
    const a = [...fingerprintStatementRows(ACCOUNT, rows(lines)).values()][0];
    const b = [...fingerprintStatementRows(OTHER_ACCOUNT, rows(lines)).values()][0];
    assert.notEqual(a, b);
  });

  it("cannot be fooled by moving characters across field boundaries", () => {
    const base = {
      accountId: ACCOUNT,
      bookingDate: "2026-08-08",
      valueDate: "2026-08-08",
      amountMinor: -10000n,
      reportedBalanceAfterMinor: 90000n,
      occurrenceIndex: 0,
    };
    const shifted = statementRowFingerprint({ ...base, providerReference: "12", rawDescription: "3ICA" });
    const original = statementRowFingerprint({ ...base, providerReference: "123", rawDescription: "ICA" });
    assert.notEqual(shifted, original, "length-prefixing must prevent a boundary shift collision");
  });

  it("changes when any economically meaningful field changes", () => {
    const base = {
      accountId: ACCOUNT,
      bookingDate: "2026-08-08",
      valueDate: "2026-08-08",
      providerReference: "1",
      rawDescription: "ICA",
      amountMinor: -10000n,
      reportedBalanceAfterMinor: 90000n,
      occurrenceIndex: 0,
    };
    const reference = statementRowFingerprint(base);
    assert.notEqual(statementRowFingerprint({ ...base, amountMinor: -10001n }), reference);
    assert.notEqual(statementRowFingerprint({ ...base, bookingDate: "2026-08-09" }), reference);
    assert.notEqual(statementRowFingerprint({ ...base, reportedBalanceAfterMinor: 90001n }), reference);
    assert.notEqual(statementRowFingerprint({ ...base, rawDescription: "ICA " }), reference);
  });
});

describe("balance chain", () => {
  it("reconciles an ascending statement", () => {
    const result = validateBalanceChain(
      rows([
        "2026-08-01;2026-08-01;1;START;100.000;1000.000",
        "2026-08-02;2026-08-02;2;ICA;-250.500;749.500",
        "2026-08-03;2026-08-03;3;LÖN;2000.000;2749.500",
        "2026-08-04;2026-08-04;4;HYRA;-1200.250;1549.250",
      ]),
    );
    assert.equal(result.direction, "ASCENDING");
    assert.equal(result.status, "RECONCILED");
    assert.equal(result.breakCount, 0);
    assert.equal(result.rowsChecked, 3);
    assert.equal(result.rowsReconciled, 3);
    assert.equal(result.openingReportedBalanceMinor, "100000");
    assert.equal(result.closingReportedBalanceMinor, "154925");
    assert.equal(result.closingBookingDate, "2026-08-04");
  });

  it("reconciles the same statement exported newest-first", () => {
    const result = validateBalanceChain(
      rows([
        "2026-08-04;2026-08-04;4;HYRA;-1200.250;1549.250",
        "2026-08-03;2026-08-03;3;LÖN;2000.000;2749.500",
        "2026-08-02;2026-08-02;2;ICA;-250.500;749.500",
        "2026-08-01;2026-08-01;1;START;100.000;1000.000",
      ]),
    );
    assert.equal(result.direction, "DESCENDING");
    assert.equal(result.status, "RECONCILED", "ordering is detected, not assumed");
    assert.equal(result.breakCount, 0);
    // Opening and closing follow chronology, not file order.
    assert.equal(result.openingReportedBalanceMinor, "100000");
    assert.equal(result.closingReportedBalanceMinor, "154925");
  });

  it("names a break with the expected and reported balance", () => {
    const result = validateBalanceChain(
      rows([
        "2026-08-01;2026-08-01;1;START;100.000;1000.000",
        "2026-08-02;2026-08-02;2;ICA;-250.000;700.000", // should be 750.000
        "2026-08-03;2026-08-03;3;LÖN;300.000;1000.000",
      ]),
    );
    assert.equal(result.status, "RECONCILED_WITH_WARNINGS");
    assert.equal(result.breakCount, 1);
    assert.equal(result.breaks[0]!.rowNumber, 2);
    assert.equal(result.breaks[0]!.expectedBalanceMinor, "75000");
    assert.equal(result.breaks[0]!.reportedBalanceMinor, "70000");
    assert.equal(result.breaks[0]!.differenceMinor, "-5000");
  });

  it("calls a statement broken when the breaks are not a handful", () => {
    const lines = ["2026-08-01;2026-08-01;0;START;0.000;1000.000"];
    for (let i = 1; i <= 8; i++) {
      const day = String(i + 1).padStart(2, "0");
      lines.push(`2026-08-${day};2026-08-${day};${i};X;-1.000;${1000 + i}.000`);
    }
    const result = validateBalanceChain(rows(lines));
    assert.equal(result.status, "BROKEN");
    assert.ok(result.breakCount > 5);
  });

  it("says insufficient data rather than guessing", () => {
    const single = validateBalanceChain(rows(["2026-08-01;2026-08-01;1;X;100.000;1000.000"]));
    assert.equal(single.status, "INSUFFICIENT_DATA");
    assert.equal(single.rowsChecked, 1);

    const noBalances = validateBalanceChain(
      rows(["2026-08-01;2026-08-01;1;X;100.000;", "2026-08-02;2026-08-02;2;Y;-5.000;"]),
    );
    assert.equal(noBalances.status, "INSUFFICIENT_DATA");
  });

  it("is exact at magnitudes that would break a float", () => {
    // Öre values above Number.MAX_SAFE_INTEGER still chain exactly.
    const result = validateBalanceChain(
      rows([
        "2026-08-01;2026-08-01;1;A;0.000;99999999999999.990",
        "2026-08-02;2026-08-02;2;B;0.010;100000000000000.000",
      ]),
    );
    assert.equal(result.status, "RECONCILED");
    assert.equal(result.closingReportedBalanceMinor, "10000000000000000");
  });

  it("detects direction only when the dates establish one", () => {
    assert.equal(detectChainDirection(rows(["2026-08-01;2026-08-01;1;X;1.000;1.000"])), "UNDETERMINED");
    assert.equal(
      detectChainDirection(
        rows(["2026-08-01;2026-08-01;1;X;1.000;1.000", "2026-08-01;2026-08-01;2;Y;1.000;2.000"]),
      ),
      "UNDETERMINED",
      "one date for every row establishes nothing",
    );
  });
});
