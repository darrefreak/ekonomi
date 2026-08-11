# Recurring + Subscriptions + Expected Transactions — Completion Plan

Slice 2 of the financial intelligence pipeline. The previous slice delivered
signatures → clusters → system rules → learned rules → cluster review. This
slice connects the already-written recurrence engine to persistence, semantic
classification, subscriptions, price intelligence, expected transactions and
the forecast — deterministically, with no AI.

## What already exists (do not rebuild)

| Piece | Where | State |
| --- | --- | --- |
| Recurrence detection (cadence, confidence, evidence) | `packages/financial-engine/src/intelligence/recurring.ts` `detectRecurrence` | Complete, tested. WEEKLY/BIWEEKLY/FOUR_WEEKLY/MONTHLY/QUARTERLY/SEMIANNUAL/ANNUAL/VARIABLE/NONE. Grocery false-positive protection via interval-spread gate. |
| Semantic recurring kind | `classifyRecurringKind` | Complete: SUBSCRIPTION, UTILITY_BILL, INSURANCE, MORTGAGE, LOAN_PAYMENT, SALARY, BENEFIT, TELECOM, MEMBERSHIP, CHILDCARE, ANNUAL_BILL, VARIABLE_RECURRING, OTHER_RECURRING. |
| Subscription subset | `isSubscriptionKind` | Complete (SUBSCRIPTION, MEMBERSHIP, TELECOM). |
| Price history + annual impact | `detectPriceChanges` | Complete: level-based regimes, holds-check, exact bigint money. |
| Annualisation / monthly equivalent | `normaliseRecurringCost` | Complete: ×52/×26/×13/×12/×4/×2/×1, integer-safe. |
| Next-occurrence projection (date + amount ranges) | `projectNextOccurrence` | Complete. |
| Missing-occurrence detection | `detectMissingOccurrence` | Complete: grace window, conservative. |
| Clusters (identity, stats, direction) | `merchant_clusters` + `TransactionClusteringService` | Complete, idempotent. |
| `recurring_items` / `subscriptions` tables + UI | `schema-planning.ts`, `/subscriptions` | Exist but **nothing populates them from detected data** — only seeds. Cadence enum already has EVERY_4_WEEKS / SEMIANNUAL / VARIABLE_RECURRING. |
| Upcoming obligations | `HouseholdMetricsService.upcomingObligations` | Reads only the seeded `subscriptions`/`contracts` tables + a hardcoded day-25 salary guess. |

The gap is wiring: nothing persists detections, nothing generates expected
transactions, nothing matches actuals, nothing feeds the forecast from real
detected streams.

## Data-flow map (what this slice builds)

```
cluster (merchant_clusters, stable signature + direction)
  → recurrence detection            detectRecurrence over the cluster's dated amounts
  → persisted recurring stream      recurring_items row keyed (household, signature, direction)
  → semantic recurring type         classifyRecurringKind over merchant + category + description
  → subscription                    isSubscriptionKind ∧ stable amount ∧ fixed cadence, user override wins
  → price history                   detectPriceChanges, stable-price streams only
  → expected transaction            expected_transactions row per (stream, expected_from) window
  → match / missing                 actual import fulfils; passed window + grace ⇒ MISSED; late arrival resolves
  → forecast / upcoming UI          upcomingObligations + /subscriptions page + review items
```

## Schema (migration 0032)

`recurring_items` is extended, not duplicated (§7): stream identity
`(household_id, signature, direction)` via partial unique index (legacy manual
rows keep NULL signature and are untouched). New columns: `signature`,
`signature_version`, `cluster_id`, `direction`, `recurring_type` (semantic,
separate from cadence), `is_subscription`, `user_marked_subscription`
(tri-state override), `user_verified`, occurrence/interval/amount evidence
(`occurrence_count`, `first_seen_on`, `median_amount_minor`, min/max,
`amount_volatility_bps`, `median_interval_days`, `interval_spread_days`,
`amount_stable`), price intelligence (`price_changes` jsonb,
`original_amount_minor`, `annual_price_impact_minor`), `evidence` jsonb,
`detection_version`, `first_detected_at`.

New table `expected_transactions`: household, recurring item, date window
(`expected_from`/`expected_to`), amount window (low/expected/high, bigint
minor), direction, confidence, status `PENDING | FULFILLED | MISSED`,
`matched_transaction_id`, `generated_at`, `model_version`. Identity
`(recurring_item_id, expected_from)` — reruns upsert, never duplicate.
Expected rows are forecasts only: **no ledger events, no postings, no balance
changes** (§21, §53).

## Cadence + semantics rules

- Engine `FOUR_WEEKLY` → cadence `EVERY_4_WEEKS` (never MONTHLY, 13 ≠ 12).
- Engine `SEMIANNUAL` → `SEMIANNUAL` (never ANNUAL). `VARIABLE` → `VARIABLE_RECURRING`.
- Cadence answers WHEN; `recurring_type` answers WHAT KIND. A stream whose
  merchant is unknown can still be `UNKNOWN_RECURRING` with a confident cadence (§42).
- Subscription = `isSubscriptionKind(type)` ∧ fixed cadence ∧ stable current
  amount. Utilities/mortgages/insurance are recurring bills, not subscriptions (§10).
- Price-change intelligence only for stable-price, fixed-cadence streams —
  a varying electricity bill never produces a "price increase" alert (§16).
- Minimum evidence: `detectRecurrence` already refuses < 3 occurrences and
  irregular schedules; persistence additionally requires confidence ≥ 60 for a
  fixed cadence stream to auto-activate; 40–59 becomes a stream-level review
  item (POSSIBLE_RECURRING / POSSIBLE_SUBSCRIPTION), not a fact.

## Service: `RecurringIntelligenceService`

`apps/api/src/intelligence/recurring-intelligence.service.ts`, all methods
household-scoped and idempotent:

1. `detectAndPersistStreams(householdId)` — clusters + their dated amounts →
   `detectRecurrence` → upsert `recurring_items`. User decisions survive
   reruns: `user_verified` DISMISSED never resurrects, CONFIRMED stays
   confirmed, `user_marked_subscription` outranks the detector (§11, §36).
   Amount change on the same stream is a price change, not a new stream (§13).
2. `refreshSubscriptions(householdId)` — re-derives semantic type +
   subscription flag from current merchant/category truth (learned rules may
   have improved since detection).
3. `refreshPriceIntelligence(householdId)` — `detectPriceChanges` per eligible
   stream; persists regimes + annualized impact.
4. `generateExpectedTransactions(householdId, asOf)` — `projectNextOccurrence`
   per active confident stream → upsert window rows; stale PENDING windows for
   a stream are replaced, FULFILLED/MISSED history is kept.
5. `matchExpectedTransactions(householdId, asOf)` — matches actual imported
   transactions (same signature, direction, date window ± grace, amount range
   ± 10 %) to PENDING/MISSED expectations → FULFILLED. Late arrival resolves a
   MISSED warning (§24). One transaction fulfils at most one expectation.
6. `detectMissingExpected(householdId, asOf)` — PENDING past
   `expected_to` + 3 grace days with confidence ≥ 0.7 → MISSED
   ("Förväntad … har inte identifierats ännu"). Never before the window ends (§23).
7. `overview` / `expectedUpcoming` / `verify` — read surfaces + user
   correction endpoint (confirm / not recurring / is / is-not subscription),
   audited.

Pipeline order (§37): clustering `analyse()` runs steps 1–6 synchronously
after cluster resolution, and the same steps exist as BullMQ jobs for
background reruns after imports: `DETECT_RECURRING_STREAMS` (detection and its
write phase are one atomic pass — a separate PERSIST job would have to re-run
detection, so persistence lives inside it), `DETECT_SUBSCRIPTIONS`,
`CALCULATE_RECURRING_PRICE_CHANGES`, `GENERATE_EXPECTED_TRANSACTIONS`,
`MATCH_EXPECTED_TRANSACTIONS`, `DETECT_MISSING_EXPECTED` — all in the typed
registry with deterministic job ids (§38, §39).

## Forecast integration (§25–27)

`upcomingObligations` gains high-confidence PENDING expectations (expenses and
income). Deduplication: an expectation is skipped when a known scheduled
obligation (subscriptions table row, contract) already covers the same
merchant in the horizon — known obligation > planned > expectation. The
hardcoded day-25 salary guess is only used when no detected salary stream
exists; a real expected income window replaces it.

## UI

`/subscriptions` becomes the recurring surface (§28–33): subscription cards
(merchant, current cost, monthly equivalent, annual cost, cadence, last
charge, next expected window, price change, confidence, "inte ett
abonnemang"), recurring overview grouped
Subscriptions / Housing & debt / Utilities / Insurance / Income / Other with
separate expense/income/subscription totals (never netted), price-increase
insights ("N abonnemang har blivit dyrare …", summed annual impact), upcoming
expected windows and missing-expected notices, and stream-level review items
with confirm/dismiss. Mobile 390×844 without horizontal scroll (§55).

## Tests

- Engine: add SEMIANNUAL and missing-window unit cases (most scenarios already covered).
- API integration: persistence idempotency (×3), every-4-weeks and semiannual
  cadence persistence, grocery false positive, price-change history, variable
  electricity (no price alert, not subscription), expected generate + match +
  missing + late resolution, user override survives rerun, household
  isolation, financial oracle before/after equality.
- E2E (desktop + 390×844): open recurring page, see subscription with price
  history and next expected window, mark not-subscription, view upcoming.
- Acceptance probe: extend `scripts/intelligence/acceptance.py` with the
  recurring section against the current real-data household; report actual
  counts, no hardcoded expectations (§56).
