# S1 — Runtime Validation Audit

**Batch:** S1 Runtime Validation Breadth (P0-5)  
**Branch:** `cursor/batch-s1-runtime-validation-9c58`  
**Date:** 2026-08-07

Classification legend:

| Status | Meaning |
|---|---|
| VALIDATED | Zod (+ domain) on untrusted input; authz separate; safe for V1 |
| PARTIAL | Schema present but gaps remain (non-critical for V1 writes) |
| UNVALIDATED | No runtime parse before use |
| UNSAFE | Can corrupt financial state / trust client identity |
| INTERNAL_ONLY | Non-production or system path (demo reseed, health) |

Policy: write bodies use `.strict()`; GET query schemas strip unknown keys.

---

## Write boundaries (mutations)

| Route / action | Input schema | Runtime Zod | Authz | Household scope | Domain | Money | Dates | Enums | IDs | Unknown fields | Status | Required fix |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `POST /auth/register` | `registerSchema` | Y | N/A | N/A | — | — | — | — | — | strict | VALIDATED | — |
| `POST /auth/login` | `loginSchema` | Y | N/A | N/A | — | — | — | — | — | strict | VALIDATED | — |
| `POST /auth/refresh` | `refreshSchema` | Y | token | — | — | — | — | — | — | strict | VALIDATED | — |
| `POST /auth/logout` | `logoutSchema` | Y | auth | — | — | — | — | — | — | strict | VALIDATED | — |
| `POST /auth/revoke-all` | — | N body | auth | — | — | — | — | — | — | n/a | VALIDATED | no body |
| `POST /households` | `createHouseholdSchema` | Y | auth | creates | — | — | — | — | — | strict | VALIDATED | — |
| `POST /accounts` | `createAccountSchema` | Y | write | body+authz | type | opening/credit | — | accountType | household | strict | VALIDATED | — |
| `PATCH /accounts/:id` | `updateAccountSchema` + `idParam` | Y | write | body+authz | — | credit limit | — | connection | id | strict | VALIDATED | — |
| `DELETE /accounts/:id` | query+param | Y | write | query+authz | archive | — | — | — | id | strip | VALIDATED | — |
| `PATCH /transactions/:id` | `updateTransactionSchema` + id | Y | write | body+authz | rebuild path | n/a (no amount edit) | — | — | ids | strict | VALIDATED | amount edits via ledger cmds |
| `POST /ledger/transfers/internal` | `createInternalTransferSchema` | Y | write | body+authz | event builder | positiveMinor | ISO | — | accounts | strict | VALIDATED | — |
| `POST /ledger/credit-card/purchase` | `createCreditCardPurchaseSchema` | Y | write | body+authz | event | Y | Y | — | Y | strict | VALIDATED | — |
| `POST /ledger/credit-card/payment` | `createCreditCardPaymentSchema` | Y | write | body+authz | event | Y | Y | — | Y | strict | VALIDATED | — |
| `POST /ledger/mortgage/payment` | `createMortgagePaymentSchema` | Y | write | body+authz | split sum | Y | Y | — | Y | strict | VALIDATED | — |
| `POST /ledger/investments/transfer` | `createInvestmentTransferSchema` | Y | write | body+authz | event | Y | Y | — | Y | strict | VALIDATED | — |
| `POST /ledger/assets/depreciation` | `createAssetDepreciationSchema` | Y | write | body+authz | ≤ ledger bal | Y | Y | — | Y | strict | VALIDATED | — |
| `POST /ledger/reconcile` | `ledgerReconcileBodySchema` | Y | write | body+authz | reconcile | — | asOf | — | household | strict | VALIDATED | — |
| `POST /goals` | `createGoalSchema` | Y | write | body+authz | type/priority | target | targetDate | goalType | Y | strict | VALIDATED | — |
| `PATCH /goals/:goalId` | `updateGoalSchema` | Y | write | body+authz | status | Y | Y | status | Y | strict | VALIDATED | — |
| `POST /goals/:goalId/contributions` | `contributeGoalSchema` | Y | write | body+authz | — | positive | date | — | Y | strict | VALIDATED | — |
| `POST /sinking-funds` | `createSinkingFundSchema` | Y | write | body+authz | — | Y | Y | — | Y | strict | VALIDATED | — |
| `PATCH /sinking-funds/:fundId` | `updateSinkingFundSchema` | Y | write | body+authz | — | Y | Y | — | Y | strict | VALIDATED | — |
| `POST /sinking-funds/:fundId/contributions` | `contributeSinkingFundSchema` | Y | write | body+authz | — | Y | Y | — | Y | strict | VALIDATED | — |
| `PATCH /budget/lines/:lineId` | `updateBudgetLineSchema` | Y | write | body+authz | — | ≥0 | — | — | Y | strict | VALIDATED | — |
| `POST /review/resolve` | `resolveReviewSchema` | Y | write | body+authz | — | — | — | — | Y | strict | VALIDATED | — |
| `POST /scenarios` | `createScenarioSchema` | Y | write | body+authz | assumptions | deltas | — | — | Y | strict | VALIDATED | — |
| `POST /scenarios/:id/simulate` | `simulateScenarioSchema` | Y | write | body+authz | no ledger mutate | Y | — | — | Y | strict | VALIDATED | — |
| `POST /documents/upload` | `uploadDocumentSchema` | Y | write | body+authz | type | — | — | docType | Y | strict | VALIDATED | OCR untrusted |
| `PATCH /documents/:id` | `updateDocumentSchema` | Y | write | body+authz | status | — | — | enums | Y | strict | VALIDATED | — |
| `POST /documents/:id/extract` | query+param | Y | write | query+authz | mock extract | — | — | — | Y | strip | VALIDATED | extracted≠trusted |
| `POST /sources` | `createSourceSchema` | Y | write | body+authz | provider | — | — | domain/status | Y | strict | VALIDATED | — |
| `PATCH /sources/:id` | `updateSourceSchema` | Y | write | body+authz | — | — | — | enums | Y | strict | VALIDATED | — |
| `DELETE /sources/:id` | query+param | Y | write | query+authz | archive | — | — | — | Y | strip | VALIDATED | — |
| `POST /sources/:id/reconnect` | `reconnectSourceSchema` | Y | write | body+authz | — | — | — | — | Y | strict | VALIDATED | — |
| `POST /sources/:id/sync` | `syncSourceSchema` | Y | write | body+authz | fake sync | — | — | — | Y | strict | VALIDATED | — |
| `POST /integrations/sync` | household query | Y | write | query+authz | fake sync | — | — | — | Y | strip | VALIDATED | — |
| `PATCH /settings` | `updateSettingsSchema` | Y | write | body+authz | — | — | — | prefs | Y | strict | VALIDATED | — |
| `POST /privacy/export` | `privacyExportRequestSchema` | Y | admin/write | body+authz | — | — | — | — | Y | strict | VALIDATED | — |
| `POST /privacy/delete-request` | `privacyDeleteRequestSchema` | Y | admin | body+authz | — | — | — | — | Y | strict | VALIDATED | — |
| `POST /notifications/read-all` | household query | Y | member | query+authz | — | — | — | — | Y | strip | VALIDATED | — |
| `POST /notifications/:id/read` | query+param | Y | member | query+authz | — | — | — | — | Y | strip | VALIDATED | — |
| `POST /advisor/chat` | `advisorChatRequestSchema` | Y | member | body+authz | tools RO | — | — | — | Y | strict | VALIDATED | AI tools read-only |
| `POST /advisor/outcomes` | `trackRecommendationOutcomeSchema` | Y | write | body+authz | — | — | — | status | Y | strict | VALIDATED | — |
| `PATCH /advisor/outcomes/:id` | `updateRecommendationOutcomeSchema` | Y | write | body+authz | — | — | — | status | Y | strict | VALIDATED | — |
| `POST /demo/load` | env gate | N | auth | — | reseed | — | — | — | — | n/a | INTERNAL_ONLY | disabled in prod |
| BullMQ enqueue/worker | `jobPayloadSchema` | Y | internal | payload | reconcile | — | asOf | job type | household | strict | VALIDATED | — |

**Write boundaries audited:** 45  
**Unsafe / unvalidated writes remaining:** 0 (demo INTERNAL_ONLY)

---

## Read boundaries (important query validation)

| Route | Schema | Status |
|---|---|---|
| `GET /dashboard` | `householdIdQuerySchema` | VALIDATED |
| `GET /accounts` | `listAccountsQuerySchema` | VALIDATED |
| `GET /transactions` | `listTransactionsQuerySchema` (limit 1–200, dates, sort) | VALIDATED |
| `GET /ledger/balances` | `ledgerBalancesQuerySchema` | VALIDATED |
| `GET /search` | `searchQuerySchema` (q ≤ 200) | VALIDATED |
| `GET /reports/*` | monthly/yearly query schemas | VALIDATED |
| `GET /debt/:accountId` | household + accountId UUID | VALIDATED |
| `GET /vehicles/:id` | household + id UUID | VALIDATED |
| `GET /vehicle-market` | `vehicleMarketQuerySchema` | VALIDATED |
| All other household GETs | `householdIdQuerySchema` | VALIDATED |
| `GET /feature-flags` | none | INTERNAL_ONLY / no input |
| `GET /health*` | none | INTERNAL_ONLY |

---

## Shared schemas added/reused

| Module | Role |
|---|---|
| `packages/schemas/src/common.ts` | uuid, ISO date, currency, amountMinor, pagination, param helpers |
| `packages/schemas/src/ledger.ts` | strict domain command schemas |
| `packages/schemas/src/jobs.ts` | BullMQ payload discriminated union |
| `packages/schemas/src/splits.ts` | split total = source amount |
| `packages/schemas/src/vehicles.ts` | `vehicleWriteSchema` (seed/future writes) |
| Existing account/tx/planning/intake/auth schemas | tightened to strict + exact money |

---

## Architecture notes

1. **householdId in body/query is validated as UUID, then authorized via membership** — never trusted alone.
2. **No generic ledger posting endpoint** — only domain commands.
3. **Depreciation** rejects write-down > current ledger ASSET balance.
4. **AI advisor tools** remain read-only allowlist (no mutation tools).
5. **Error envelope:** `{ error: { code, message, fields?, requestId } }` via `ValidationExceptionFilter`.
6. **DB:** migration `0018_batch_s1_validation.sql` adds currency format + non-negative interest_rate_bps checks.

---

## Remaining limitations (accepted for S1)

- Vehicle/contract/subscription **HTTP write APIs** are not exposed in V1; write schemas exist for shared validation / future use.
- OCR/extracted document fields remain untrusted until user confirmation workflow (out of S1 scope).
- Not every Zod rule is mirrored as SQL CHECK (by design).
- Metric Registry (P0-8) untouched.
