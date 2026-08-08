import { estimateMortgageRateSavingMinor } from "./forecast";
import type { LifestyleCreepResult } from "./lifestyle-creep";

export type OpportunityEvidence = {
  kind: "account" | "subscription" | "contract" | "category" | "transaction" | "vehicle" | "page";
  id: string;
  label: string;
  href: string;
};

export type DetectedOpportunity = {
  id: string;
  detectorKey: string;
  title: string;
  description: string;
  estimatedAnnualSavingMinor: bigint | null;
  /** Human-readable basis — heuristic estimates must be labeled. */
  estimateBasis: string | null;
  confidence: number;
  effort: string;
  risk: string;
  priority: number;
  status: "NEW" | "ACTIVE";
  category: string;
  evidence: OpportunityEvidence[];
};

/** Stable Swedish labels for detector heuristics (compliance transparency). */
export function estimateBasisForDetector(detectorKey: string): string {
  switch (detectorKey) {
    case "mortgage-rate":
      return "Uppskattning (heuristik): ~10 % av nuvarande årsränta vid räntesänkning.";
    case "subs-trim":
      return "Uppskattning (heuristik): ca 20 % av årlig abonnemangskostnad.";
    case "contract-renewal":
      return "Uppskattning (heuristik): 1 200 kr/år per avtal som förnyas snart.";
    case "lifestyle-creep":
      return "Uppskattning: 12 × (3-mån snittutgift − 12-mån baseline).";
    default:
      return "Uppskattning (heuristik) — inte garanterad besparing.";
  }
}

export function detectMortgageRateOpportunity(input: {
  mortgageInterestAnnualMinor: bigint;
  mortgageAccountId?: string | null;
}): DetectedOpportunity | null {
  if (input.mortgageInterestAnnualMinor <= 20_000_00n) return null;
  const saving = estimateMortgageRateSavingMinor(input.mortgageInterestAnnualMinor);
  return {
    id: "live:mortgage-rate",
    detectorKey: "mortgage-rate",
    title: "Förhandla bolåneränta",
    description:
      "Live detektor: uppskattad årsbesparing från räntesänkning på nuvarande räntekostnad.",
    estimatedAnnualSavingMinor: saving,
    estimateBasis: estimateBasisForDetector("mortgage-rate"),
    confidence: 0.72,
    effort: "medium",
    risk: "low",
    priority: 1,
    status: "ACTIVE",
    category: "mortgage",
    evidence: [
      ...(input.mortgageAccountId
        ? [
            {
              kind: "account" as const,
              id: input.mortgageAccountId,
              label: "Bolån",
              href: `/accounts/${input.mortgageAccountId}`,
            },
          ]
        : []),
      {
        kind: "page",
        id: "debt",
        label: "Skulder",
        href: "/debt",
      },
    ],
  };
}

export function detectSubscriptionTrimOpportunity(input: {
  subscriptionAnnualMinor: bigint;
  subscriptionIds: string[];
}): DetectedOpportunity | null {
  if (input.subscriptionAnnualMinor <= 1_500_00n) return null;
  return {
    id: "live:subs-trim",
    detectorKey: "subs-trim",
    title: "Trimma abonnemang",
    description:
      "Live detektor: aktiva abonnemang ger utrymme att trimma ca 20 % årligen.",
    estimatedAnnualSavingMinor: input.subscriptionAnnualMinor / 5n,
    estimateBasis: estimateBasisForDetector("subs-trim"),
    confidence: 0.65,
    effort: "low",
    risk: "low",
    priority: 2,
    status: "ACTIVE",
    category: "subscriptions",
    evidence: [
      ...input.subscriptionIds.slice(0, 5).map((id) => ({
        kind: "subscription" as const,
        id,
        label: "Abonnemang",
        href: "/subscriptions",
      })),
      {
        kind: "page",
        id: "subscriptions",
        label: "Alla abonnemang",
        href: "/subscriptions",
      },
    ],
  };
}

export function detectContractRenewalOpportunity(input: {
  contracts: Array<{ id: string; name: string; renewalDate: string | null; endDate: string | null }>;
  asOf: string;
  daysAhead?: number;
}): DetectedOpportunity | null {
  const ahead = input.daysAhead ?? 90;
  const asOf = new Date(`${input.asOf.slice(0, 10)}T00:00:00.000Z`);
  const limit = new Date(asOf);
  limit.setUTCDate(limit.getUTCDate() + ahead);

  const due = input.contracts.filter((c) => {
    const d = c.renewalDate ?? c.endDate;
    if (!d) return false;
    const dt = new Date(`${d.slice(0, 10)}T00:00:00.000Z`);
    return dt >= asOf && dt <= limit;
  });
  if (!due.length) return null;

  return {
    id: "live:contract-renewal",
    detectorKey: "contract-renewal",
    title: "Omförhandla snart förnyade avtal",
    description: `Live detektor: ${due.length} avtal förnyas inom ${ahead} dagar.`,
    estimatedAnnualSavingMinor: BigInt(due.length) * 1_200_00n,
    estimateBasis: estimateBasisForDetector("contract-renewal"),
    confidence: 0.6,
    effort: "medium",
    risk: "low",
    priority: 3,
    status: "ACTIVE",
    category: "contracts",
    evidence: due.slice(0, 5).map((c) => ({
      kind: "contract" as const,
      id: c.id,
      label: c.name,
      href: "/contracts",
    })),
  };
}

export function detectLifestyleCreepOpportunity(
  creep: LifestyleCreepResult,
): DetectedOpportunity | null {
  if (!creep.creeping) return null;
  const annual = creep.deltaMinor * 12n;
  return {
    id: "live:lifestyle-creep",
    detectorKey: "lifestyle-creep",
    title: "Lifestyle creep — dämpa utgiftsökning",
    description: `Live detektor: senaste 3 mån snittutgift är ${
      creep.deltaPercent?.toFixed(1) ?? "?"
    } % över 12-månaders baseline.`,
    estimatedAnnualSavingMinor: annual > 0n ? annual : null,
    estimateBasis: estimateBasisForDetector("lifestyle-creep"),
    confidence: 0.68,
    effort: "medium",
    risk: "moderate",
    priority: 2,
    status: "ACTIVE",
    category: "lifestyle",
    evidence: [
      {
        kind: "page",
        id: "cashflow",
        label: "Kassaflöde",
        href: "/cashflow",
      },
      ...creep.drivers.slice(0, 3).map((d) => ({
        kind: "category" as const,
        id: d.categoryKey,
        label: d.categoryName,
        href: `/transactions?q=${encodeURIComponent(d.categoryName)}`,
      })),
    ],
  };
}

export function rankOpportunities(
  items: Array<DetectedOpportunity | null>,
): DetectedOpportunity[] {
  return items
    .filter((x): x is DetectedOpportunity => x != null)
    .sort((a, b) => a.priority - b.priority || b.confidence - a.confidence);
}
