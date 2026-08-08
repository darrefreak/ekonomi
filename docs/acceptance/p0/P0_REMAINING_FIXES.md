# P0 Remaining Fixes (Do Not Implement in This Audit)

Narrow, acceptance-blocking fixes only. No P1 product expansion.

---

## P0-A1 — Ledger persist atomicity

**Status:** FIXED (Batch R1 — 2026-08-08)  
**Evidence:** `persistBalancedEvent` uses `db.transaction`; R1-T1 failure injection; see `docs/completion/batches/R1_REPORT.md`.

**Problem (historical):** sequential inserts without transaction could leave half-written economic state.

---

## P0-A2 — Depreciation idempotency

**Status:** FIXED (Batch R1 — 2026-08-08)  
**Evidence:** `financial_command_idempotency` UNIQUE + payload hash; R1-T2/T3/T4; adversarial re-verify PASS.

**Problem (historical):** `externalId` without source_tx row allowed double write-down.

---

## P0-A3 — Document extract float money

**Status:** FIXED (Batch R2 — 2026-08-08)  
**Evidence:** `parseExtractAmountToken` + `kronorStringToMinor`; scientific/malformed rejected; see `R2_REPORT.md`.

**Problem (historical):** `BigInt(Math.round(Number(raw) * 100))` in mock extract.

---

## P0-A4 — P0-7 product path gaps

**Problem:** Refund exists only as service; general category splits have schema but no write API; no UI/client for ledger mutations.

**Fix scope (minimum):**
1. `POST /api/v1/ledger/refunds` (or equivalent) wired to `createCashRefund` with Zod + authz.
2. Persist/read path for category splits that uses `transactionSplitsSchema` and runs inside the P0-A1 transaction.
3. At least one api-client method + one UI or E2E path that exercises split or refund (minimal).

Do **not** expand into full recon UX beyond making mismatch already shown remain correct.

---

## P0-A5 — Ledger truth residuals (P0-1)

**Status:** FIXED (Batch R2 — 2026-08-08)  
**Evidence:** Accounts list reconstructs ledger; debt detail + mortgage context ledger-aligned; NW history upsert + invalidate on cache refresh. See `R2_REPORT.md`.

**Problem (historical):** list/detail/history could show stale cache.

---

## P0-A6 — Metric registry integrity (P0-8)

**Problem:** Weak `inputHash`; bundle version stuffed into per-metric meta; hardcoded asOf; yearly fake hash; no historical version serve.

**Fix scope:**
- Strengthen `inputHash` with posting aggregate fingerprint (e.g. count + sum of amountMinor + max bookedOn) or event max(updatedAt).
- Set `metricMeta.calculationVersion` from relevant metric defs (or expose both bundle + metric versions).
- Accept `asOf` on dashboard/NW/debt/wealth (or document single global asOf policy and enforce it everywhere).
- Remove fabricated yearly `inputHash`; derive from period inputs.
- Optional: read path that returns stored snapshot for a requested `(metricKey, calculationVersion, asOf)` without silent recompute under a newer formula.

---

## P0-A7 — Vehicle purchase / financed purchase runtime

**Problem:** Cash purchase builder is unit-only; seed uses openings; financed purchase has no ledger builder.

**Fix scope:**
- Runtime `createAssetPurchase` (cash) via domain command + API.
- Financed purchase builder: vehicle asset + cash down + loan liability in one balanced event (or documented two-step with invariants).
- Seed should prefer events over silent openings where claiming purchase semantics.

---

## P0-A8 — Reversal / correction

**Problem:** Status enum unused for economics.

**Fix scope (minimum V1):**
- Define behavior: REVERSED/CORRECTED excluded from reconstruct **or** paired reversing postings.
- Enforce in reconstruct + metrics period totals.
- Tests: reverse must not leave spend; correct must not double-count.

---

## Suggested fix order

1. **P0-A1** atomicity (prevents corruption class)  
2. **P0-A2** depreciation idempotency  
3. **P0-A3** float extract  
4. **P0-A5** ledger-aligned reads / history invalidation  
5. **P0-A4** refund HTTP + split persist  
6. **P0-A6** metric hash/asOf  
7. **P0-A7** vehicle purchase paths  
8. **P0-A8** reversal semantics  

Stop after listing. Implement only when a dedicated fix batch is instructed.
