# False Completeness — Final Sweep

**Audit date:** 2026-08-07  
Prior `docs/completion/FALSE_COMPLETENESS.md` is **stale** and must not be used for acceptance.

---

## Cleared (do not re-open)

| Former claim | Reality |
|---|---|
| Hardcoded dashboard / NW SEK | Metrics/engine-driven |
| Fake opportunity detectors | `source: "live-engine"` |
| `PagePlaceholder` / Mer broken | Removed / real More page |
| Echo lint on product packages | Real ESLint (WS O) |
| Privacy never enforced | Roles + projection + tests |

---

## ALLOWED EXTERNAL MOCK

| Area | Evidence |
|---|---|
| Open banking / BankID connectors | Provider catalog mock IDs |
| Integration fake sync | Explicit UX + API |
| OCR extract | `mock-extract.ts` |
| Vehicle market listings | Mock asks; compare/replace live |

---

## INVALID INTERNAL / misleading

| Item | Severity | Evidence |
|---|---|---|
| Contract renewal saving `1_200_00n` heuristic | P1 | `packages/financial-engine/src/opportunities.ts` |
| Other detector effort/confidence strings | P2 | Same file |
| BullMQ job catalog mostly no-op | P1 | `jobs/queue.ts` — only `HEALTH_CHECK` |
| Seed flag text “Vehicle recommendation UI stubs” | P2 | `seed.ts` wording stale |
| Feature flag `vehicleMarketIntelligence` not gating UI | P2 | Seeded false; UI still served |
| Meta packages `echo 'lint ok'` / no tests | P3 | mobile, config |
| Unused api-client methods (`updateGoal`, `updateSinkingFund`, `updateSource`, `revokeAll`, `getCoverage`, `health`) | P2 | Incomplete surfaces / dead client |
| Float money conversion on input | P0/P1 | `apps/web/src/lib/money-input.ts` |
| Cache presented as live ledger truth | P0 | Position APIs |

---

## Marker sweep (product code)

| Marker | Hits |
|---|---|
| TODO / FIXME / coming soon / not implemented | None in product runtime |
| PagePlaceholder | Removed |
| console.log in web | None (API uses structured logger) |
| Disabled buttons / empty handlers | None found |
| Static financial values in UI | None found |

---

## Distinction rule

- External connectors may remain mocked for V1.
- Internal household financial analysis must be deterministic from household data (engine/DB), not invented constants — heuristics in opportunity savings remain a residual defect.
