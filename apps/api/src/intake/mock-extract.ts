import { kronorStringToMinor } from "@ffos/domain";

export type MockExtractInput = {
  title: string;
  documentType: string;
  filename?: string | null;
  contentType?: string | null;
  byteSize?: number | null;
  issuerHint?: string | null;
};

export type MockExtractResult = {
  extracted: Record<string, unknown>;
  issuer: string | null;
  amountMinor: bigint | null;
  status: "REVIEW" | "ACTION_REQUIRED";
  notes: string;
};

function inferIssuer(input: MockExtractInput): string | null {
  const hay = `${input.title} ${input.filename ?? ""} ${input.issuerHint ?? ""}`.toLowerCase();
  if (hay.includes("vattenfall") || hay.includes("el")) return "Vattenfall";
  if (hay.includes("trygg") || hay.includes("försäkring")) return "Trygg-Hansa";
  if (hay.includes("bilia") || hay.includes("volvo") || hay.includes("service"))
    return "Bilia";
  if (hay.includes("skatteverket") || hay.includes("tax")) return "Skatteverket";
  if (hay.includes("lön") || hay.includes("salary") || hay.includes("payroll"))
    return "Arbetsgivare";
  return input.issuerHint ?? null;
}

/**
 * Parse a kronor-like token from OCR/title text into minor units.
 * Uses exact decimal string parsing — never JS Number/float.
 * Returns null for scientific notation, >2 fractional digits, or junk.
 */
export function parseExtractAmountToken(raw: string): bigint | null {
  const token = raw.trim();
  if (!token) return null;
  if (/[eE]/.test(token)) return null;
  if (/[^\d.,\s-]/.test(token)) return null;
  return kronorStringToMinor(token);
}

function inferAmount(input: MockExtractInput): bigint | null {
  const hay = `${input.title} ${input.filename ?? ""}`;
  // Prefer full decimal / thousands forms before short \d{1,3} prefixes.
  const m = hay.match(
    /(-?\d+[.,]\d{1,2}|-?\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d{1,2})?|-?\d{3,})/,
  );
  if (!m || m.index == null) {
    if (input.documentType === "INVOICE") return 1_250_00n;
    if (input.documentType === "VEHICLE") return 4_500_00n;
    if (input.documentType === "SALARY") return 42_000_00n;
    return null;
  }
  // Reject scientific notation like "1.23e2" (regex would otherwise take "1.23").
  const after = hay.charAt(m.index + m[0].length);
  if (after === "e" || after === "E") return null;
  return parseExtractAmountToken(m[1]!);
}

/** Deterministic mock extraction — no OCR. */
export function mockExtractDocument(input: MockExtractInput): MockExtractResult {
  const issuer = inferIssuer(input);
  const amountMinor = inferAmount(input);
  const extracted: Record<string, unknown> = {
    ocr: false,
    mock: true,
    documentType: input.documentType,
    contentType: input.contentType ?? null,
    byteSize: input.byteSize ?? null,
    filename: input.filename ?? null,
  };

  if (input.documentType === "INVOICE") {
    extracted.dueDate = "2026-08-28";
    extracted.invoiceNumber = "MOCK-INV-1001";
  } else if (input.documentType === "INSURANCE") {
    extracted.renewalDate = "2027-01-15";
    extracted.policyNumber = "MOCK-POL-77";
  } else if (input.documentType === "VEHICLE") {
    extracted.odometerKm = 76_400;
    extracted.workshop = issuer ?? "Verkstad";
  } else if (input.documentType === "SALARY") {
    extracted.payDate = "2026-07-25";
    extracted.employer = issuer ?? "Arbetsgivare";
  } else if (input.documentType === "TAX") {
    extracted.taxYear = 2025;
  } else {
    extracted.summary = "Mockstrukturerat utdrag utan OCR";
  }

  if (amountMinor != null) extracted.amountMinor = amountMinor.toString();
  if (issuer) extracted.issuer = issuer;

  const status =
    amountMinor != null || extracted.dueDate
      ? ("ACTION_REQUIRED" as const)
      : ("REVIEW" as const);

  return {
    extracted,
    issuer,
    amountMinor,
    status,
    notes: "Mock extraction (ingen riktig OCR) — Workstream J",
  };
}
