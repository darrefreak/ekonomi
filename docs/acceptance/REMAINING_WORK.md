# Remaining Work (post-acceptance rejection)

Do **not** implement in the audit run. Grouped for future completion batches.

---

## P0

1. **Ledger source of truth (P0-1)** — Runtime reconstruct or reconcile job; APIs prefer `ledgerCalculated` / postings; wire BullMQ reconcile; stop treating unreconciled cache as sole truth.
2. **Validation breadth (P0-5)** — Zod (or equivalent) on household-scoped query params and remaining write bodies.
3. **Splits / recon / refunds product path (P0-7)** — API (+ minimal UI) to persist/read splits and recon groups; metrics netting path.
4. **Metric registry (P0-8)** — Versioned metric definitions / shared contract beyond informal service reuse.
5. **Financial correctness blockers** — Depreciation ledger builder + seed/runtime alignment; remove float money input; integration tests for transfer/CC/mortgage/investment/vehicle invariants on persisted data.

---

## P1

1. Available-to-invest metric + surfaces  
2. Runtime financial-event write API (not seed-only)  
3. Client refresh-on-401 / refresh wiring  
4. Membership invite/manage UI  
5. Heuristic opportunity savings constants → data-driven or clearly labeled estimates  
6. Real internal jobs beyond HEALTH_CHECK where product claims async work  
7. Category user CRUD  
8. Goal/sinking-fund/source update UX (client methods exist unused)  
9. Vehicle purchase path through builders in seed + equity/valuation coherence  
10. Broader E2E beyond critical path (budget edit, review resolve, vehicles)

---

## P2

1. Dark mode application  
2. Merchant alias / normalization engine  
3. Forecast model depth / backtest richness  
4. Full WCAG pass beyond critical pages  
5. Web unit tests  
6. Doc hygiene: rewrite stale `FALSE_COMPLETENESS.md` / P0_ISSUES statuses  
7. Feature-flag gating consistency for vehicle market  

---

## P3

1. Native Expo app  
2. Push / widgets  
3. Advanced portfolio analytics  
4. Meta-package lint/test stubs cleanup  

---

## Suggested completion batches (small)

| Batch | Scope |
|---|---|
| **A2 — Ledger runtime truth** | Reconcile job + API reads + integration tests for cash invariants |
| **A3 — Money input + depreciation** | Integer öre parsing; depreciation builder; seed alignment |
| **B2 — Splits/recon API** | Minimal write/read for splits + transfer pairing visibility |
| **C2 — Metric registry** | Definitions + version + consumer checklist |
| **S1 — Validation & refresh** | Query Zod + client token refresh |
| **P1 polish** | Available to invest; invite UI; opportunity estimate labeling |

Stop after planning; await explicit implement instruction.
