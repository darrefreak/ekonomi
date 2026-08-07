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

function inferAmount(input: MockExtractInput): bigint | null {
  const hay = `${input.title} ${input.filename ?? ""}`;
  const m = hay.match(/(\d+[.,]\d{2}|\d{3,})/);
  if (!m) {
    if (input.documentType === "INVOICE") return 1_250_00n;
    if (input.documentType === "VEHICLE") return 4_500_00n;
    if (input.documentType === "SALARY") return 42_000_00n;
    return null;
  }
  const raw = m[1]!.replace(",", ".");
  if (raw.includes(".")) {
    return BigInt(Math.round(Number(raw) * 100));
  }
  return BigInt(raw) * 100n;
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
