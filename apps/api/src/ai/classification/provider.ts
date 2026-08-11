import type { AiClusterClassification } from "@ffos/schemas";

/**
 * Provider-neutral boundary for external AI (§2).
 *
 * The rest of the system only ever sees these types. Nothing OpenAI-specific
 * leaks past this file, no SDK types cross it, and packages/financial-engine
 * never imports it: the provider lives strictly in the application layer.
 */

/** One cluster, minimized and redacted, ready to leave the system (§8). */
export type MinimizedClusterPayload = {
  /** Opaque reference the provider echoes back; never a database id. */
  clusterRef: string;
  /** Redacted representative description (the most common one). */
  normalizedDescription: string;
  /** 2–5 redacted example descriptions. */
  sampleDescriptions: string[];
  direction: "INFLOW" | "OUTFLOW";
  accountType: string | null;
  currency: string;
  medianAmountMinor: string;
  minAmountMinor: string;
  maxAmountMinor: string;
  occurrenceCount: number;
  /** Median days between occurrences, when a cadence exists. */
  medianIntervalDays: number | null;
  /** Existing deterministic merchant candidate, when one exists. */
  existingMerchantCandidate: string | null;
};

/** A category the model is allowed to pick. Ids only — no inventing (§11). */
export type AllowedTaxonomyEntry = {
  id: string;
  key: string;
  name: string;
  parentId: string | null;
};

export type ClassificationRequest = {
  clusters: MinimizedClusterPayload[];
  taxonomy: AllowedTaxonomyEntry[];
  promptVersion: string;
  schemaVersion: string;
};

export type ProviderUsage = {
  promptTokens: number;
  completionTokens: number;
};

export type ClassificationResponse = {
  results: AiClusterClassification[];
  provider: string;
  model: string;
  usage: ProviderUsage | null;
  latencyMs: number;
};

/**
 * Errors the pipeline knows how to survive (§18). Everything a provider can
 * throw is folded into one of these kinds before it reaches the service.
 */
export class ClassificationProviderError extends Error {
  constructor(
    readonly kind:
      | "TIMEOUT"
      | "UNAVAILABLE"
      | "RATE_LIMIT"
      | "INVALID_RESPONSE"
      | "NOT_CONFIGURED",
    message: string,
  ) {
    super(message);
    this.name = "ClassificationProviderError";
  }
}

/** The interface every classification provider implements (§2). */
export interface TransactionClassificationProvider {
  readonly name: string;
  readonly model: string;
  /** True when credentials/config exist and a real call could be made. */
  isConfigured(): boolean;
  classify(request: ClassificationRequest): Promise<ClassificationResponse>;
}

/** Brief V2's optional language pass reuses the same boundary (§38). */
export type BriefLanguageRequest = {
  /** Ranked findings as safe JSON: types, fragments, severities. No database. */
  findings: Array<{
    key: string;
    type: string;
    severity: string;
    fragments: Record<string, string>;
    templateText: string;
  }>;
  promptVersion: string;
};

export type BriefLanguageResponse = {
  /** One rendered Swedish sentence per finding key. */
  texts: Record<string, string>;
  headline: string | null;
  provider: string;
  model: string;
  usage: ProviderUsage | null;
};

export interface BriefLanguageProvider {
  readonly name: string;
  readonly model: string;
  isConfigured(): boolean;
  render(request: BriefLanguageRequest): Promise<BriefLanguageResponse>;
}
