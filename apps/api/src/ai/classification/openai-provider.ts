import OpenAI from "openai";
import {
  aiClassificationBatchResponseSchema,
  type AiClusterClassification,
} from "@ffos/schemas";
import type { AiClassificationConfig } from "./ai-config";
import {
  ClassificationProviderError,
  type BriefLanguageProvider,
  type BriefLanguageRequest,
  type BriefLanguageResponse,
  type ClassificationRequest,
  type ClassificationResponse,
  type TransactionClassificationProvider,
} from "./provider";

/**
 * The OpenAI implementation of the classification boundary (§3).
 *
 * Current API pattern: the Responses API with schema-constrained structured
 * output (`text.format = json_schema`, strict). Not the deprecated Assistants
 * API. The model cannot return anything the JSON schema does not allow, and
 * even then the result is Zod-validated before anyone trusts it — the schema
 * constrains shape, the service constrains meaning (taxonomy ids, §11).
 */

/**
 * JSON schema for strict structured output. Strict mode requires
 * `additionalProperties: false` and every property listed in `required`;
 * nullability is expressed with type arrays.
 */
const CLASSIFICATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "clusterRef",
          "merchantCandidate",
          "merchantConfidence",
          "categoryId",
          "subcategoryId",
          "transactionType",
          "recurringTypeCandidate",
          "classificationConfidence",
          "shortExplanation",
          "signals",
        ],
        properties: {
          clusterRef: { type: "string" },
          merchantCandidate: { type: ["string", "null"] },
          merchantConfidence: { type: "number" },
          categoryId: { type: ["string", "null"] },
          subcategoryId: { type: ["string", "null"] },
          transactionType: {
            type: "string",
            enum: [
              "PURCHASE",
              "INCOME",
              "TRANSFER",
              "INVESTMENT",
              "CREDIT_CARD_PAYMENT",
              "LOAN_PRINCIPAL",
              "REFUND",
              "FEE",
              "UNKNOWN",
            ],
          },
          recurringTypeCandidate: {
            type: ["string", "null"],
            enum: [
              "SUBSCRIPTION",
              "UTILITY_BILL",
              "INSURANCE",
              "RENT_OR_MORTGAGE",
              "SALARY",
              "OTHER_RECURRING",
              null,
            ],
          },
          classificationConfidence: { type: "number" },
          shortExplanation: { type: "string" },
          signals: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "MERCHANT_NAME_IN_TEXT",
                "KNOWN_BRAND",
                "RECURRING_CADENCE",
                "AMOUNT_PATTERN",
                "DIRECTION",
                "CATEGORY_KEYWORD",
                "REFERENCE_ONLY",
                "AMBIGUOUS_TEXT",
              ],
            },
          },
        },
      },
    },
  },
} as const;

function classifierInstructions(promptVersion: string): string {
  return [
    `You are ${promptVersion}, a bank-transaction cluster classifier for a Swedish household finance system.`,
    "You receive clusters of similar transactions, already grouped and minimized. For each cluster, identify the merchant and the best category from the ALLOWED TAXONOMY.",
    "Rules:",
    "- categoryId and subcategoryId MUST be ids copied exactly from the allowed taxonomy, or null. Never invent an id.",
    "- If the allowed taxonomy is empty, categoryId and subcategoryId MUST be null for every cluster. Classify the merchant only.",
    "- If the evidence is insufficient, return merchantCandidate null, categoryId null and transactionType UNKNOWN with low confidence. UNKNOWN is a correct answer; a fabricated merchant is not.",
    "- Reference-only descriptions (mostly digits or placeholders like [REF]) are UNKNOWN.",
    "- Do not assume a subscription just because a merchant sells subscriptions.",
    "- transactionType TRANSFER/INVESTMENT/CREDIT_CARD_PAYMENT/LOAN_PRINCIPAL/REFUND changes economic meaning: only propose them when the text clearly says so.",
    "- shortExplanation: one short Swedish sentence naming the evidence.",
    "- Echo each cluster's clusterRef exactly.",
  ].join("\n");
}

export class OpenAITransactionClassificationProvider
  implements TransactionClassificationProvider
{
  readonly name = "openai";
  private client: OpenAI | null = null;

  constructor(private readonly config: AiClassificationConfig) {}

  get model(): string {
    return this.config.model;
  }

  isConfigured(): boolean {
    return this.config.apiKey != null;
  }

  private getClient(): OpenAI {
    if (!this.config.apiKey) {
      throw new ClassificationProviderError(
        "NOT_CONFIGURED",
        "OPENAI_API_KEY is not set",
      );
    }
    this.client ??= new OpenAI({
      apiKey: this.config.apiKey,
      timeout: this.config.timeoutMs,
      maxRetries: 1,
    });
    return this.client;
  }

  async classify(request: ClassificationRequest): Promise<ClassificationResponse> {
    const client = this.getClient();
    const started = Date.now();

    const input = JSON.stringify({
      clusters: request.clusters,
      allowedTaxonomy: request.taxonomy.map((entry) => ({
        id: entry.id,
        key: entry.key,
        name: entry.name,
        parentId: entry.parentId,
      })),
    });

    let raw: string;
    let usage: ClassificationResponse["usage"] = null;
    try {
      const response = await client.responses.create({
        model: this.config.model,
        instructions: classifierInstructions(request.promptVersion),
        input,
        text: {
          format: {
            type: "json_schema",
            name: "transaction_cluster_classification",
            schema: CLASSIFICATION_JSON_SCHEMA as unknown as Record<
              string,
              unknown
            >,
            strict: true,
          },
        },
      });
      raw = response.output_text;
      usage = response.usage
        ? {
            promptTokens: response.usage.input_tokens ?? 0,
            completionTokens: response.usage.output_tokens ?? 0,
          }
        : null;
    } catch (error) {
      throw toProviderError(error);
    }

    let parsed: { results: AiClusterClassification[] };
    try {
      parsed = aiClassificationBatchResponseSchema.parse(JSON.parse(raw));
    } catch (error) {
      throw new ClassificationProviderError(
        "INVALID_RESPONSE",
        `Provider returned a payload that failed schema validation: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return {
      results: parsed.results,
      provider: this.name,
      model: this.config.model,
      usage,
      latencyMs: Date.now() - started,
    };
  }
}

/**
 * Brief V2 prose generation over the same SDK (§38). Receives ranked findings
 * only — never the financial database — and is told, in the schema and in the
 * instructions, to leave numbers alone. The grounding validator does not
 * trust that: it re-checks every digit (§39).
 */
export class OpenAIBriefLanguageProvider implements BriefLanguageProvider {
  readonly name = "openai";
  private client: OpenAI | null = null;

  constructor(private readonly config: AiClassificationConfig) {}

  get model(): string {
    return this.config.model;
  }

  isConfigured(): boolean {
    return this.config.apiKey != null;
  }

  async render(request: BriefLanguageRequest): Promise<BriefLanguageResponse> {
    if (!this.config.apiKey) {
      throw new ClassificationProviderError(
        "NOT_CONFIGURED",
        "OPENAI_API_KEY is not set",
      );
    }
    this.client ??= new OpenAI({
      apiKey: this.config.apiKey,
      timeout: this.config.timeoutMs,
      maxRetries: 1,
    });

    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["headline", "items"],
      properties: {
        headline: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["key", "text"],
            properties: {
              key: { type: "string" },
              text: { type: "string" },
            },
          },
        },
      },
    };

    try {
      const response = await this.client.responses.create({
        model: this.config.model,
        instructions: [
          `You are ${request.promptVersion}, rewriting a Swedish household financial brief.`,
          "You receive structured findings with a deterministic template sentence each.",
          "Rewrite each sentence in concise, natural Swedish. You may change wording only.",
          "Every number, percentage and amount must be copied verbatim from the finding's fragments. Never introduce, round, or alter a number.",
          "Return one item per finding key.",
        ].join("\n"),
        input: JSON.stringify(request.findings),
        text: {
          format: {
            type: "json_schema",
            name: "financial_brief_language",
            schema: schema as unknown as Record<string, unknown>,
            strict: true,
          },
        },
      });
      const parsed = JSON.parse(response.output_text) as {
        headline: string;
        items: Array<{ key: string; text: string }>;
      };
      return {
        texts: Object.fromEntries(parsed.items.map((i) => [i.key, i.text])),
        headline: parsed.headline || null,
        provider: this.name,
        model: this.config.model,
        usage: response.usage
          ? {
              promptTokens: response.usage.input_tokens ?? 0,
              completionTokens: response.usage.output_tokens ?? 0,
            }
          : null,
      };
    } catch (error) {
      throw toProviderError(error);
    }
  }
}

/** Fold SDK errors into the pipeline's survivable error kinds (§18). */
function toProviderError(error: unknown): ClassificationProviderError {
  if (error instanceof ClassificationProviderError) return error;
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) {
      return new ClassificationProviderError("RATE_LIMIT", error.message);
    }
    if (error.status != null && error.status >= 500) {
      return new ClassificationProviderError("UNAVAILABLE", error.message);
    }
    return new ClassificationProviderError("INVALID_RESPONSE", error.message);
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|timed out|abort/i.test(message)) {
    return new ClassificationProviderError("TIMEOUT", message);
  }
  return new ClassificationProviderError("UNAVAILABLE", message);
}
