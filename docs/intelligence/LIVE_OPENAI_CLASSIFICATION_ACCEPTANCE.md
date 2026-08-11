# Live OpenAI Classification — Acceptance

**Verdict: PASS.** The already-accepted OpenAI classification architecture was
activated against the real provider in a controlled, bounded, consent-gated
run. The provider works, the privacy boundary held, confidence routing did its
job, unknowns stayed unknown, the cache eliminated repeat calls, and not one
posting, event amount or balance changed. Two real defects were found by the
live run and fixed; both fixes are regression-tested.

Everything here is aggregate: counts, hashes, confidences, tokens. No bank
text, no account identifiers, no API key. The household used is an isolated
pilot household built through the real SEB importer from a synthetic
36-month statement — the same generator and seed as the accepted AI
acceptance run, so every count is directly comparable.

Verification scripts:

- `scripts/intelligence/live-provider-synthetic-check.ts` — connectivity with
  synthetic clusters only, before any household-derived text leaves.
- `scripts/intelligence/live-payload-inspection.ts` — programmatic proof over
  the exact production payload, without printing its content.
- `scripts/intelligence/live-openai-pilot.py` — the bounded pilot itself
  (26 checks, LP-001 … LP-111).

## Secret handling

The API key exists in exactly one place: the local `.env`, which `.gitignore`
covers (`.env`, `.env.*`, with only `.env.example` tracked) and which has
never been tracked. Docker compose passes the variable **names** through to
the api and worker containers; the values come from the ignored file, and the
compose defaults keep every gate closed (`enabled=false`, `dryRun=true`).

Secret scan after all work: tracked files containing the key or its prefix —
**0**. Diff lines — **0**. Staged secret files — **0**.

**OPENAI_API_KEY configured: YES.** Its value appears nowhere in this
repository, this report, the audit trail, or the database.

## Model configuration

`OPENAI_CLASSIFICATION_MODEL` (existing configuration) — `gpt-4o-mini`.
Nothing hardcoded; the architecture was not modified to chase model
performance.

## Synthetic provider connectivity (before any real data)

One request with four synthetic clusters (NETFLIX.COM, ICA MAXI TEST,
SPOTIFY TEST, and a reference-only `[REF] [REF]` cluster) against a synthetic
four-category taxonomy:

| Check | Result |
| --- | --- |
| Provider reachable / authenticated | PASS |
| Structured response (production Zod schema) | PASS |
| clusterRef echo | 4/4 |
| Taxonomy restriction (ids from allowed set or null) | PASS |
| UNKNOWN on reference-only cluster (merchant null, type UNKNOWN) | PASS |
| Usage metadata | PASS (935 prompt / 337 completion tokens) |
| Requests | 1 |

## Real-household dry run and comparison

Dry run against the pilot household, before consent, zero external requests:

| Measure | This pilot | Accepted acceptance |
| --- | --- | --- |
| Transactions analyzed | 581 | 581 |
| Clusters total | 12 | 12 |
| Resolved deterministically | 4 | 4 |
| Resolved learned / user verified | 0 / 0 | 0 / 0 |
| Unresolved | 8 | 8 |
| AI eligible | 7 | 7 |
| Opaque / reference-only excluded | 1 | 1 |
| Estimated requests | 1 | 1 |
| Needs Review | 8 | 8 |

No material difference; nothing unexpectedly large. The bound held: 7
eligible ≤ 10 (`AI_TRANSACTION_CLASSIFICATION_MAX_CLUSTERS=10` for the
pilot), and the pilot script independently stops above 10.

## Consent

Enabled through `PATCH /settings` — the normal product path, never SQL.
Before consent the status endpoint reported `externalCallsAllowed: false`
despite a live environment and configured provider; after consent, `true`.
Consent was switched back off at the end of the pilot.

## Data minimization inspection

The exact production payload (the `eligibility()` output that classify
sends) was inspected programmatically; content was never printed:

- Only the twelve allowed fields per cluster; ≤ 5 redacted sample
  descriptions; an opaque `clusterRef` hash, never a database id.
- Absent, verified by pattern: personnummer, digit runs ≥ 7 (accounts,
  cards, references), phone numbers, IBAN, email addresses, household
  member names.
- Payload on the wire: 3,274 bytes for all 7 clusters + 8 taxonomy entries.
- The opaque reference-only cluster stayed excluded (§12): it redacts to
  placeholders, fails the semantic-text test, and was never sent.

## Bounded live run

One external request classified all 7 eligible clusters (one cluster = one
classification unit). Per-cluster outcomes, by signature hash:

| Cluster | Outcome | Combined confidence |
| --- | --- | --- |
| `c606e5c6fe11` | SUGGESTED | 0.94 |
| `49eb0e94e6f3` | REJECTED (`UNKNOWN_CATEGORY_ID`) | — |
| `8b115c1d445f` | REJECTED (`UNKNOWN_CATEGORY_ID`) | — |
| `0571b2cffd92` | UNKNOWN | 0.26 |
| `2c73aaa3fc29` | UNKNOWN | 0.65 |
| `dab66c419845` | UNKNOWN | 0.29 |
| `dafb0900c284` | UNKNOWN | 0.37 |

- **Thresholds untouched**: auto-apply ≥ 0.95, suggest ≥ 0.75, exactly as
  accepted. In an earlier pilot iteration the same strong cluster reached
  0.96 combined and auto-applied as `AI_MATCH` (95 transactions,
  deterministic count unchanged, oracle unchanged) — the model's confidence
  varies between runs and the routing absorbed both answers correctly.
- **Taxonomy safety live**: two results proposed category ids outside the
  allowed set and were rejected per result with a named reason. No invented
  category ever reached a transaction.
- **UNKNOWN is success**: four clusters lacked evidence and stayed unknown.
  No retries, no leading prompts, no hallucinated merchants.
- **High-risk types**: none proposed in the live run; the guard (never
  auto-apply TRANSFER/INVESTMENT/CREDIT_CARD_PAYMENT/LOAN_PRINCIPAL/REFUND)
  is enforced in routing and pinned by integration tests.
- **Asymmetric confidence** is preserved end to end: merchant and category
  candidates carry separate confidences into the review card.

## Needs Review

Before AI: 8. After AI: 8 — reduced only by auto-classification (0 in the
final run), never by suggestions. One review card now carries the full AI
suggestion (merchant candidate, category candidate, confidence 0.94, short
Swedish explanation) and the person keeps Accept / Correct / Remember rule /
Skip. No suggestion was auto-accepted on ambiguous data; the review
integration was exercised by correcting a cluster in the synthetic pilot
household.

## Learned-rule precedence (live)

Correcting the suggested cluster through the normal review flow (with
"remember rule") resolved 95 transactions as USER_VERIFIED and created a
learned rule. The next classification run had one fewer eligible cluster and
made **zero** external calls: person > learned rule > AI, live.

## Cache

Second identical run: **7 cache hits, 0 external requests, 0 duplicate
result rows** (uniqueness verified on the full cache identity: household,
signature, direction, signature version, taxonomy version, prompt version,
model). Review and coverage unchanged by the rerun. Cache invalidation on
taxonomy/prompt change is pinned by the existing synthetic integration tests;
no live cache was intentionally invalidated (§23).

## Financial safety

Oracle snapshot (posting count + summed amounts, event count, balance sum)
before and after the live run: **bit-identical** —
`1162:661484878|581|661484878`. Merchant/category classification wrote no
posting, no event amount, no balance, no net-worth change.

Recurring after AI enrichment: 12 streams and 2 subscriptions before and
after a full pipeline rerun — no duplicated streams, subscriptions or
expected transactions.

## Financial Brief V2, live

With consent on, the brief was generated by the AI language pass
(`generator: AI`, model `gpt-4o-mini`): only ranked structured findings left
the system (the brief provider receives finding keys, fragments and template
sentences — never transaction history; separate code path, verified in the
accepted Brief V2 slice). Numeric grounding on the live output: every
numeric fragment of every finding appears verbatim in the rendered text — no
drift. Every item keeps its explain link. Advisor smoke test: four safe
Swedish questions, every answer produced through deterministic tools (2, 2,
1 and 3 tool calls respectively), no invented financial values — the advisor
has no generative path.

## Provider failure fallback

Proven live, unintentionally and perfectly: the first live batch failed
validation (see below), was recorded as ERROR per cluster, the pipeline
continued, review stayed intact, and nothing financial happened. The mocked
failure modes (UNAVAILABLE, TIMEOUT, RATE_LIMIT, NOT_CONFIGURED) remain
pinned by the integration suite. The real key was never invalidated.

## Real defects found by the live run — and fixed

1. **One bad value killed the whole batch.** OpenAI's strict structured
   output guarantees shape, types and enums — not string lengths, array
   lengths or numeric ranges. The pilot household (a fresh household, which
   has no categories until someone creates them) yielded an empty taxonomy,
   the model answered with a non-uuid `categoryId`, and the wire schema's
   `.uuid()` check turned seven per-cluster questions into seven ERRORs.
   Fix: values are normalized at the boundary (empty string → null,
   confidence clamped to [0,1], overlong text truncated) so an invented id
   survives parsing and is rejected **per result** by the existing taxonomy
   validation. Structural violations still fail loudly. Prompt bumped to
   `transaction-classifier-v2` with an explicit empty-taxonomy rule.
   Regression-tested in `packages/schemas/src/ai-classification.test.ts`.
2. **Token metrics overcounted by the batch size.** Usage was persisted per
   cluster row and summed, reporting 7× the real tokens. Requests and tokens
   now come from the provider-call audit rows (one per actual external
   call).

## Audit

One `intelligence.ai.provider_call` audit row per external call, carrying
cluster count, model, prompt version, usage and latency — no API key, no
cluster text (verified by scanning the audit trail for key-like strings and
for the synthetic cluster descriptions: zero hits).

## Cost and performance

| Measure | Value |
| --- | --- |
| External requests (first run) | 1 |
| Clusters sent | 7 |
| Cache hits (second run) | 7 |
| External requests (second run) | 0 |
| Input tokens | 1,480 |
| Output tokens | 526 |
| Estimated cost | ~$0.0005 (gpt-4o-mini) |
| Dry-run duration | ~0.01 s |
| Live classification duration | ~8.7 s |
| Second (cached) run duration | ~0.02 s |

## Classification-source accounting

Meaningful = deterministic + learned + user-verified + AI_MATCH; DEFAULTED
and UNKNOWN never count. Final pilot run: 217/581 meaningful (37.3 %) before
and after AI — the strong cluster landed in the suggestion band, so coverage
moves only when a person accepts (or, as in the earlier iteration where it
auto-applied at 0.96, to 312/581 = 53.7 %). Quality was measured, not
percentage: unknown remained better than wrong.

## End state

`AI_CLASSIFICATION_DRY_RUN=true` is forced back on in the local environment:
the key stays configured, but no external call is possible until the flag is
deliberately flipped. Pilot household consent was switched back off.

## Gates

Build, lint, typecheck, unit + integration tests, E2E (Docker) and Docker
image builds all pass on this revision; the numbers are recorded in the
final report of the pilot run.
