export type CoverageAreaStatus = "present" | "warning" | "missing";

export type CoverageArea = {
  key: string;
  label: string;
  status: CoverageAreaStatus;
};

export type CoverageInput = {
  hasChecking: boolean;
  hasSavings: boolean;
  hasCreditCard: boolean;
  hasMortgage: boolean;
  hasInvestments: boolean;
  hasTaxAccount: boolean;
  hasPension: boolean;
  hasInsuranceSignal: boolean;
  hasCsn: boolean;
};

export function calculateFinancialCoverage(input: CoverageInput): {
  percent: number;
  areas: CoverageArea[];
} {
  const areas: CoverageArea[] = [
    {
      key: "bank",
      label: "Bankkonton",
      status: input.hasChecking ? "present" : "missing",
    },
    {
      key: "savings",
      label: "Sparande",
      status: input.hasSavings ? "present" : "missing",
    },
    {
      key: "credit_cards",
      label: "Kreditkort",
      status: input.hasCreditCard ? "present" : "warning",
    },
    {
      key: "mortgage",
      label: "Bolån",
      status: input.hasMortgage ? "present" : "missing",
    },
    {
      key: "investments",
      label: "Investeringar",
      status: input.hasInvestments ? "present" : "warning",
    },
    {
      key: "tax",
      label: "Skattekonto",
      status: input.hasTaxAccount ? "present" : "missing",
    },
    {
      key: "pension",
      label: "Pension",
      status: input.hasPension ? "present" : "warning",
    },
    {
      key: "insurance",
      label: "Försäkring",
      status: input.hasInsuranceSignal ? "present" : "warning",
    },
    {
      key: "csn",
      label: "CSN",
      status: input.hasCsn ? "present" : "missing",
    },
  ];

  const score = areas.reduce((acc, area) => {
    if (area.status === "present") return acc + 1;
    if (area.status === "warning") return acc + 0.5;
    return acc;
  }, 0);

  return {
    percent: Math.round((score / areas.length) * 100),
    areas,
  };
}
