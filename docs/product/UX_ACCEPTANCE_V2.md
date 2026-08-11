# UX Acceptance V2

Product Experience V2 is accepted by running real user journeys, not by
inspecting screenshots. The journeys below are automated in
`e2e/product-experience-v2.spec.ts` (plus the existing E2E suites) and are also
the manual acceptance script.

## Journeys

### 1. First import

Seed/import a safe household → the import commits → **analysis progress**
shows real stages → **completion summary** shows transactions analyzed,
percent understood, recurring found, subscriptions, items needing help →
**Slutför analysen** → review clusters (largest impact first, countdown
decrements) → done state → dashboard is populated.

Friction target: from "import done" to "review done" the user makes one
navigation choice.

### 2. Daily use

Home → read position + this month + brief (≈20 seconds of reading) → "Mot
normalt" card → `/what-changed` → drill a category driver → merchant report →
transaction list. Every step is one click/tap; back retraces.

### 3. Planning

Home → Kommande → `/calendar` → switch horizon 30/60/90 → read projected
balance and lowest point → open an event's drill target.

### 4. Budget

`/budget` → Smart Budget suggestion renders with per-group basis → open
"Varför detta belopp?" → adjust the flexible frame → **Anta förslaget** →
plan persists (page reload keeps planned amounts) → month-end forecast and
likely deviation visible per group.

### 5. Liquidity

Home → available surplus → `/liquidity` → recommendation with range and
confidence → components ("Vad summan består av") → "Så räknade vi" → ask the
advisor panel why → the answer cites the deterministic liquidity tool.

### 6. Mobile review (390×844)

Bottom nav → review → resolve a cluster (accept/correct with remember-rule) →
countdown decrements → next card. Touch targets ≥ 44px, no horizontal
overflow.

## Cross-cutting checks

- **Empty states**: every new page has a stated empty state (no blank screens).
- **Partial data**: currency-excluded accounts and low-history households get
  explicit notices instead of silently wrong numbers.
- **Error UX**: failures render human Swedish text via `describeError`; no
  HTTP status codes reach the UI.
- **Loading**: skeleton/loading labels, no spinner-walls.
- **Dark mode & viewports**: visual pass at 390×844, 430×932, tablet and 1440.
- **Accessibility**: focus states, `aria-pressed` on toggles, `role="dialog"`
  overlays, screen-reader labels on icon buttons, tabular numerals for all
  financial figures.

## Regression gates

The financial oracle, currency invariant, household isolation, classification
invariants, recurring idempotency, AI numeric grounding and privacy/erasure
suites must pass unchanged — V2 adds read models and presentation only.
