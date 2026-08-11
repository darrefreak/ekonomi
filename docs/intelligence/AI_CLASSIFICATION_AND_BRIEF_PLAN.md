# AI Classification Fallback + Financial Brief V2 — Plan (Slice 3)

Status: implementation plan, written before code.
Scope: OpenAI classification of **unresolved clusters only**, dry-run and privacy
boundary, cache/versioning, confidence routing into Needs Review, Financial
Brief V2 (deterministic findings → template → optional AI prose), advisor tool
expansion, mobile AI states.

Out of scope: new bank providers, Open Banking, BankID, scraping, native iOS,
payments, trading, OCR, vehicle work. Deterministic classification, learned
rules and recurring detection are **not** rebuilt or replaced.

## 1. What exists today (verified by inspection)

- `classification_source` enum already contains `AI_MATCH`; nothing writes it.
  Coverage (`TransactionClusteringService.coverage`) already counts `aiMatch`.
- Deterministic pipeline order inside `analyse()`: user exact-signature rule →
  merchant match / system catalogue → auto-accept → learned rule → merchant
  category rule → `UNKNOWN`. User-verified rows are never overwritten.
- Needs Review lists one item per unresolved cluster
  (`ClassificationReviewService.list`), resolve supports accept/correct/skip and
  learned rules.
- The AI advisor (`apps/api/src/ai/`) is tools-only behind the `AI` feature
  flag: no LLM anywhere, 11 read-only tools, brief V1 composed from tool
  outputs. The dashboard "Finansiell brief" is a separate heuristic
  (`buildBrief` in `dashboard.service.ts`).
- Engines in `packages/financial-engine` are pure (no I/O, no SDKs):
  baselines, category trends, change drivers, anomalies, liquidity, savings,
  lifestyle creep, recurring. The package must stay free of OpenAI imports.
- No `OPENAI_API_KEY` exists in the environment: real external calls are
  **NOT AUTHORIZED** in this run; provider acceptance uses synthetic/mocked
  calls plus a real-household dry-run.

## 2. Data flow

```
unresolved cluster (classificationSource = UNKNOWN, not dismissed)
  → eligibility filter (semantic text present; opaque refs excluded)
    → minimized + redacted payload            (docs/intelligence/AI_TRANSACTION_PRIVACY.md)
      → cache lookup (signature/taxonomy/prompt/model versions)
        → provider call (only if enabled; else dry-run counts)
          → schema-validated structured result (UNKNOWN allowed)
            → combined confidence (model + deterministic evidence)
              → ≥ 0.95  apply merchant/category as AI_MATCH   (never USER_VERIFIED rows,
                                                               never high-risk types)
              → 0.75–0.95 Needs Review suggestion ("Vi tror att detta är …")
              → < 0.75  UNKNOWN — cluster stays reviewable
```

Financial Brief V2:

```
deterministic services (baselines, trends, recurring, expected, anomalies,
liquidity, savings, coverage)
  → structured findings (typed, valued, evidenced, fresh-stamped)
    → deterministic ranking → top 3–5, duplicates suppressed
      → Swedish template text with deterministically rendered numeric fragments
        → optional AI prose around the same fragments (findings only leave the system)
          → numeric-grounding validation → reject/fallback to template on drift
            → persisted snapshot keyed by inputHash
```

## 3. New components

### Provider abstraction (`apps/api/src/ai/classification/`)

- `provider.ts` — `TransactionClassificationProvider` interface:
  `classify(request) => Promise<ProviderClassificationOutcome[]>` where the
  request carries minimized cluster payloads and the allowed taxonomy. Also a
  `BriefLanguageProvider` for Brief V2 prose. No OpenAI types leak out.
- `openai-provider.ts` — `OpenAITransactionClassificationProvider` using the
  official `openai` SDK with schema-constrained structured output
  (`response_format: json_schema`, strict). Model, key, timeout from env only.
- `redaction.ts` — deterministic minimization/redaction: mask account numbers,
  personnummer-shaped tokens, phone numbers, long numeric references; keep
  merchant-bearing words. Never relies on the LLM to redact.
- `ai-classification.service.ts` — eligibility, dry-run, cache, combined
  confidence, apply/suggest routing, metrics, audit.

### Configuration (environment; no secrets committed)

| Variable | Default | Meaning |
|---|---|---|
| `OPENAI_API_KEY` | unset | provider credential; unset = provider unavailable |
| `OPENAI_CLASSIFICATION_MODEL` | `gpt-4o-mini` | model id, never hardcoded in logic |
| `AI_TRANSACTION_CLASSIFICATION_ENABLED` | `false` | master switch for external calls |
| `AI_CLASSIFICATION_DRY_RUN` | `true` | force dry-run even when enabled |
| `AI_TRANSACTION_CLASSIFICATION_MAX_CLUSTERS` | `25` | per-run cluster budget |
| `AI_TRANSACTION_CLASSIFICATION_TIMEOUT_MS` | `20000` | per-request timeout |

Plus a household-level setting `aiTransactionAnalysisEnabled` (default **off**)
surfaced in settings as "Extern AI-analys av transaktioner". External calls
require env enabled AND household opt-in AND key present AND not dry-run.

### Persistence

`ai_classification_results` (new table, FK → households ON DELETE CASCADE so
erasure covers it):

- identity: `householdId`, `signature`, `direction`, `signatureVersion`,
  `taxonomyVersion`, `promptVersion`, `provider`, `model` (unique)
- audit: `inputHash`, `resultHash`, `status`
  (`APPLIED | SUGGESTED | UNKNOWN | REJECTED | ERROR`), `usage` (tokens),
  `latencyMs`, `hitCount` (cache reuse), timestamps
- payload: validated `result` jsonb (no raw prompt text stored)

`financial_brief_snapshots` (new table, cascade): `householdId`, `asOf`,
`inputHash`, `findingsVersion`, `templateVersion`, `promptVersion`/`model`
(null when template-only), `brief` jsonb, `createdAt`. Reused when `inputHash`
is unchanged.

### Job

`AI_CLASSIFY_TRANSACTION_CLUSTERS` (BullMQ, typed registry): payload
`{ householdId }`; loads eligible clusters, uses cache, calls provider when
enabled, validates, routes by confidence, persists results. Idempotent via the
cache identity + upserts; per-cluster failure does not stop the run.

### Endpoints

- `GET  /api/v1/intelligence/ai/dry-run?householdId=` — real eligibility maths,
  zero external calls.
- `POST /api/v1/intelligence/ai/classify?householdId=` — run classification
  (respects enablement; in dry-run mode returns the dry-run report).
- `GET  /api/v1/intelligence/ai/status?householdId=` — enablement flags +
  cost observability (results, cache hits, failures, tokens).
- `GET  /api/v1/brief?householdId=` — Financial Brief V2 (works with AI off).

### Review integration

A `SUGGESTED` result writes `merchantCandidate`/`merchantConfidence` onto the
still-unresolved cluster (never overwriting a better deterministic candidate)
and the review item gains an `aiSuggestion` block (merchant, category,
confidence, short explanation). Accept/correct/remember-rule flows are the
existing ones; corrections create learned rules which outrank AI on later runs
by pipeline order.

### High-risk safety

`transactionType` proposals in
`{TRANSFER, INVESTMENT, CREDIT_CARD_PAYMENT, LOAN_PRINCIPAL, REFUND}` are never
auto-applied regardless of confidence — they only ever surface as review
suggestions. AI never writes to the ledger; merchant/category application is
the same mechanism the deterministic pipeline already uses.

### Combined confidence

`combineConfidence(model, evidence)` — deterministic, unit-tested. Evidence
terms: description token quality, occurrence count, agreement with an existing
deterministic candidate, recurrence consistency, amount stability. Thresholds:
≥ 0.95 auto-apply, 0.75–0.95 suggest, < 0.75 unknown.

## 4. Financial Brief V2

- `packages/financial-engine/src/brief/findings.ts` (pure): finding types
  (`SPENDING_ABOVE_BASELINE`, `CATEGORY_INCREASE`, `SUBSCRIPTION_PRICE_INCREASE`,
  `NEW_SUBSCRIPTION`, `MISSING_EXPECTED_INCOME`, `UNUSUAL_TRANSACTION`,
  `LIQUIDITY_SHORTFALL`, `LIQUIDITY_SURPLUS`, `SAVINGS_RATE_CHANGE`,
  `RESERVE_INADEQUATE`, `UPCOMING_LARGE_OBLIGATION`, `DATA_COVERAGE_WARNING`, …),
  each with severity, impact (minor units), confidence, deterministic values,
  numeric fragments, evidence route, asOf/freshness, dedupe group.
- `rankFindings` — deterministic order: severity, then |impact|, then
  confidence; duplicate groups collapse to the strongest finding.
- `composeBriefTemplate` — Swedish sentences where every number is rendered
  deterministically from the finding values. Mandatory; works with AI off.
- AI prose (optional): the provider receives ranked findings only (no financial
  database), must reuse the supplied numeric fragments verbatim; a grounding
  validator rejects any digit sequence not present in the finding fragments and
  falls back to the template. Regression-tested with a tampered mock.
- Coverage/freshness: a `DATA_COVERAGE_WARNING` finding is emitted from the
  dashboard coverage areas; stale current-state findings are dropped or
  demoted. The brief never claims "no risks" while coverage is missing.
- Dashboard card: 3–5 items, each with "Varför ser jag detta?" linking to the
  supporting route; AI-off state shows
  "Extern AI-analys är avstängd. Systemets automatiska analys fungerar fortfarande."

## 5. Advisor tool expansion

New read-only tools in the existing registry, backed by existing services:
`get_spending_baseline`, `get_category_trend`, `get_merchant_trend`,
`get_recurring_summary`, `get_subscription_changes`,
`get_expected_transactions`, `get_missing_expected`, `get_lifestyle_creep`,
`get_anomalies`, `get_liquidity_requirement`, `get_savings_target`,
`get_available_surplus`, `get_financial_resilience`,
`get_period_change_drivers`, `get_financial_coverage`. Chat keyword routing
extended (buffert → liquidity, abonnemang → subscription changes, …). No SQL
tool; all numbers come from the deterministic services.

## 6. Test map (spec § → test)

| § | Test |
|---|---|
| 52 | dry-run: eligible counts correct, 0 provider calls (spy provider) |
| 53 | high combined confidence → merchant/category applied as `AI_MATCH`, ledger untouched |
| 54 | low confidence → review suggestion only |
| 55 | `TRANSFER` proposal → review, ledger unchanged |
| 56 | malformed provider payload → rejected, cluster reviewable, run continues |
| 57 | explicit UNKNOWN → nothing fabricated |
| 58 | unchanged cluster twice → cache hit, no second call |
| 59 | taxonomy version bump → cache miss |
| 26/27 | learned rule and user verification outrank AI on rerun |
| 60 | tampered AI brief numbers rejected by grounding validator |
| 61 | AI off: classification, review, recurring, template brief, advisor tools all work |
| 62 | provider timeout/down: no import failure, no crash, review remains |
| 63 | financial oracle identical before/after AI classification |

## 7. Acceptance order (spec §64)

A. deterministic baseline → B. real-household dry-run (aggregates only) →
C. synthetic real provider call **only if** a key is configured (it is not:
report NOT AUTHORIZED) → D. Brief V2 with AI off → E. Brief V2 with mocked AI →
F. full regression (build/lint/typecheck/tests/E2E/Docker).
