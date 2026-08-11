# AI Transaction Privacy Boundary

This document is the authoritative description of **exactly what may leave the
system** when external AI transaction analysis is enabled, what never leaves,
how redaction works, and how AI-related data participates in the household
data lifecycle (export, erasure, retention).

External AI analysis is **OFF by default** at three independent levels:

1. `AI_TRANSACTION_CLASSIFICATION_ENABLED` (environment, default `false`)
2. `AI_CLASSIFICATION_DRY_RUN` (environment, default `true`)
3. `Extern AI-analys av transaktioner` (per-household setting, default OFF)

All three must be explicitly enabled — environment enabled, dry-run disabled,
and the household toggle ON — before a single byte of transaction-derived text
can leave the machine. The deterministic pipeline (system rules, user
verification, learned rules, recurring detection, Needs Review) works fully
with AI disabled.

## What leaves the system

When a cluster is sent for classification, the payload is exactly the
`MinimizedClusterPayload` type in
`apps/api/src/ai/classification/provider.ts`:

| Field | Content | Notes |
| --- | --- | --- |
| `clusterRef` | Opaque per-request reference (`c1`, `c2`, …) | Never a database id |
| `normalizedDescription` | The cluster's most common description, **after redaction** | See redaction below |
| `sampleDescriptions` | 2–5 distinct representative descriptions, **after redaction** | Not full history |
| `direction` | `INFLOW` / `OUTFLOW` | |
| `accountType` | Account type label (e.g. `CHECKING`) | Never account numbers/names |
| `currency` | ISO code (e.g. `SEK`) | |
| `medianAmountMinor` | Median amount of the cluster | Aggregate, not per-transaction |
| `minAmountMinor` / `maxAmountMinor` | Amount range | Aggregate |
| `occurrenceCount` | How many transactions the cluster has | Count only |
| `medianIntervalDays` | Recurrence evidence (median day gap) or null | Derived number |
| `existingMerchantCandidate` | Current deterministic merchant candidate, if any | Already-derived name |

Alongside the clusters, the request carries the **allowed taxonomy** (category
ids, keys, Swedish names, parent links) so the model can only answer with ids
that already exist, plus the prompt version and schema version strings.

For Financial Brief V2 language generation (a separate, also-optional
feature), the payload is the ranked structured findings only: finding type,
severity, pre-rendered numeric fragments and the deterministic template
sentence. No transaction rows, no account data, no documents.

## What never leaves the system

- personnummer, or anything shaped like one (redacted before send)
- account numbers, bankgiro/plusgiro, IBAN, card numbers (redacted)
- phone numbers (redacted)
- long payment references / OCR numbers (redacted)
- household member names, emails, addresses
- notes, documents, uploaded files
- full transaction history (only 2–5 redacted example descriptions per cluster)
- per-transaction dates (only the derived median interval)
- balances, net worth, ledger events, forecast internals
- database ids of any kind

Clusters whose descriptions carry **no semantic text after redaction**
(opaque numeric/reference-only descriptions) are never sent at all — they are
excluded by `hasSemanticText` in
`apps/api/src/ai/classification/redaction.ts` and remain in Needs Review.

## Redaction

Redaction is deterministic, local and regex-based
(`apps/api/src/ai/classification/redaction.ts`). The LLM is never asked to
redact its own input. Patterns, applied most-specific first:

| Pattern | Replacement | Example |
| --- | --- | --- |
| Personnummer (6/8-digit date + 4) | `[PNR]` | `19850101-1234` → `[PNR]` |
| IBAN | `[IBAN]` | `SE3550000000054910000003` → `[IBAN]` |
| Masked/full card numbers | `[KORT]` | `4501****1234` → `[KORT]` |
| Account / bankgiro / plusgiro | `[KONTO]` | `5301-1234567` → `[KONTO]` |
| Phone numbers | `[Tel]` | `+46 70 123 45 67` → `[Tel]` |
| OCR/REF/FAKTNR technical refs | `[REF]` | `OCR 12345678901` → `[REF]` |
| Long numeric references (7+, digit-heavy) | `[REF]` | `A1234567890` → `[REF]` |

The goal is minimization **without destroying merchant text**:
`NETFLIX.COM 4501****1234` becomes `NETFLIX.COM [KORT]`, not `[REDACTED]`.
Which classes of identifier were removed is recorded locally for
observability; the original text is never stored in the AI cache.

## Eligibility — who can be sent at all

A cluster is AI-eligible only if **all** of the following hold
(`AiClassificationService.eligibility`):

1. It is **unresolved**: system merchant rules, user-verified classification,
   learned rules and deterministic evidence have all failed to name it.
2. Its redacted representative description still has semantic text.
3. It has not already been answered by the AI cache for the current
   signature/taxonomy/prompt/model versions.

Already-classified clusters are never re-sent. `UNKNOWN` is an accepted
answer and is cached like any other.

## Dry-run

`AI_CLASSIFICATION_DRY_RUN=true` (the default) runs the **same eligibility
logic** as real mode and reports transactions analyzed, clusters, resolved
counts, AI-eligible clusters, estimated requests and estimated payload bytes —
and sends nothing. There are no fake counters; the dry-run report is computed
from the same code path a real run would use.

## What is stored locally about AI calls

The AI cache (`ai_classification_results`) stores per household: cluster
signature + versions (signature, taxonomy, prompt, schema), provider and model
names, an input hash and result hash (SHA-256), the validated structured
result, combined confidence, status, failure reason kind, token usage counts
and latency. It stores **no raw prompt text and no unredacted description**.

Brief snapshots (`financial_brief_snapshots`) store the rendered brief, its
input hash and the generator (template or AI + model/prompt version).

## Data lifecycle

- **Erasure:** both tables reference `households(id)` with
  `ON DELETE CASCADE`. Household erasure removes all AI cache rows and brief
  snapshots; nothing AI-related survives the household.
- **Export:** AI classification results and brief snapshots are
  household-scoped rows and are included in the household data export like
  other derived intelligence.
- **Retention:** cache rows live as long as the household unless invalidated
  by version changes (taxonomy/prompt/model), in which case they are simply
  no longer matched and can be pruned.
- **Provider side:** requests are sent via the official OpenAI SDK. No
  training opt-in is granted; only the minimized payload above is transmitted.

## The household-facing description

The settings toggle is labeled **"Extern AI-analys av transaktioner"** and
explained as:

> "När detta är aktiverat kan minimerad transaktionstext skickas till vald
> AI-tjänst för att hjälpa till att identifiera handlare och kategori."

This is accurate: minimized transaction text — never full bank history — is
what may be sent.
