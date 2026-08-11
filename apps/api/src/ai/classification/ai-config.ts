/**
 * External AI configuration, read from the environment only (§4).
 *
 * No model name is hardcoded into domain logic; nothing here is a secret;
 * defaults are the safe direction (§5): external calls OFF, dry-run ON.
 */

export type AiClassificationConfig = {
  apiKey: string | null;
  model: string;
  /** Master switch: without this nothing external ever happens. */
  enabled: boolean;
  /** Forces dry-run even when enabled. Defaults to true. */
  dryRun: boolean;
  maxClustersPerRun: number;
  timeoutMs: number;
};

function readBool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

function readInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function readAiClassificationConfig(): AiClassificationConfig {
  return {
    apiKey: process.env.OPENAI_API_KEY?.trim() || null,
    model: process.env.OPENAI_CLASSIFICATION_MODEL?.trim() || "gpt-4o-mini",
    enabled: readBool("AI_TRANSACTION_CLASSIFICATION_ENABLED", false),
    dryRun: readBool("AI_CLASSIFICATION_DRY_RUN", true),
    maxClustersPerRun: readInt("AI_TRANSACTION_CLASSIFICATION_MAX_CLUSTERS", 25),
    timeoutMs: readInt("AI_TRANSACTION_CLASSIFICATION_TIMEOUT_MS", 20_000),
  };
}
