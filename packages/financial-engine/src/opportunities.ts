/**
 * Opportunity engine entry — deterministic detectors + scoring.
 * @see ./opportunities/detectors.ts
 */
export * from "./opportunities/types";
export * from "./opportunities/scoring";
export * from "./opportunities/detectors";

/** @deprecated Use estimateBasis on DetectedOpportunity; kept for older call sites. */
export function estimateBasisForDetector(detectorKey: string): string {
  switch (detectorKey) {
    case "mortgage-rate":
      return "Scenario: brutto årsräntedifferens vid −25 bp (inte bankerbjudande).";
    case "subscription-price-increase":
    case "subs-trim":
      return "Deterministisk prisserie: (aktuellt − föregående) × 12.";
    case "contract-renewal":
      return "Ingen besparing utan jämförelsedata — deadline-påminnelse.";
    case "lifestyle-creep":
    case "spending-trend":
      return "Deterministisk: 3-mån snitt − 12-mån baseline.";
    default:
      return "Se opportunity.facts / assumptions för beräkningsgrund.";
  }
}
