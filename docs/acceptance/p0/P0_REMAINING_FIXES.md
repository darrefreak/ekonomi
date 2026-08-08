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

**Status:** FIXED (Batch R3 — 2026-08-08)  
**Evidence:** `POST /ledger/refunds`, `POST /ledger/events/:id/splits`, api-client + transaction-detail refund UI; see `R3_REPORT.md`.

**Problem (historical):** Refund service-only; splits schema unused for writes; no client/UI.

---

## P0-A5 — Ledger truth residuals (P0-1)

**Status:** FIXED (Batch R2 — 2026-08-08)  
**Evidence:** Accounts list reconstructs ledger; debt detail + mortgage context ledger-aligned; NW history upsert + invalidate on cache refresh. See `R2_REPORT.md`.

**Problem (historical):** list/detail/history could show stale cache.

---

## P0-A6 — Metric registry integrity (P0-8)

**Status:** FIXED (Batch R4 — 2026-08-08)  
**Evidence:** composition-sensitive `inputHash`; catalog `calculationVersion` + `metricVersions`; product `asOf` queries; derived yearly hash; `mode=stored` historical serve. See `R4_REPORT.md`.

**Problem (historical):** Weak `inputHash`; bundle version stuffed into per-metric meta; hardcoded asOf; yearly fake hash; no historical version serve.

---

## P0-A7 — Vehicle purchase / financed purchase runtime

**Status:** FIXED (Batch R3 — 2026-08-08)  
**Evidence:** `createAssetPurchase` + financed builder/API; demo seed posts purchase event; see `R3_REPORT.md`.

**Problem (historical):** Cash purchase unit-only; seed openings; no financed builder.

---

## P0-A8 — Reversal / correction

**Status:** FIXED (Batch R3 — 2026-08-08)  
**Evidence:** `financial_events.status`; reverse API; reconstruct + period totals exclude non-ACTIVE; see `R3_REPORT.md`.

**Problem (historical):** Status enum unused for economics.

---

## Suggested fix order

1. ~~**P0-A1** atomicity~~ **FIXED (R1)**  
2. ~~**P0-A2** depreciation idempotency~~ **FIXED (R1)**  
3. ~~**P0-A3** float extract~~ **FIXED (R2)**  
4. ~~**P0-A5** ledger-aligned reads / history invalidation~~ **FIXED (R2)**  
5. ~~**P0-A4** refund HTTP + split persist~~ **FIXED (R3)**  
6. ~~**P0-A6** metric hash/asOf~~ **FIXED (R4)**  
7. ~~**P0-A7** vehicle purchase paths~~ **FIXED (R3)**  
8. ~~**P0-A8** reversal semantics~~ **FIXED (R3)**  

All P0-A1…A8 closed. No remaining P0 fix batches required for financial core acceptance.
