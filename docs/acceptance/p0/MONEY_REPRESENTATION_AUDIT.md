# Money Representation Audit

**Date:** 2026-08-07

---

## UNSAFE_MONEY (V1 financial relevance)

| Location | Classification | Notes |
|---|---|---|
| `apps/api/src/intake/mock-extract.ts` | **SAFE (R2)** | Uses `kronorStringToMinor` / `parseExtractAmountToken`; rejects scientific / >2dp |
| `apps/api/src/db/seed/demo-household.ts:580,661` | UNSAFE_MONEY (seed) | Float scaling in seed generation — not runtime API |
| Engine ratio helpers (`risk.ts`, `lifestyle-creep.ts`, `period-metrics.ts` runway) | SAFE_EXACT_DECIMAL_POLICY / display-ratio | Converts minors via `Number` for **ratios only**; does not persist money |
| `packages/utils/src/format-money.ts` | Display float | Presentation only; not write path |

---

## Core write path (SAFE)

| Path | Status |
|---|---|
| `kronorStringToMinor` / web `money-input.ts` | SAFE_EXACT_DECIMAL_POLICY |
| Zod `amountMinorStringSchema` + ledger/account/planning schemas | SAFE |
| API `BigInt(input.*Minor)` ledger commands | SAFE |
| Domain `addMoney` / `subMoney` bigint | SAFE |

---

## Roundtrip expectation

User strings `0,01` / `12,10` / `1 234,56` → `kronorStringToMinor` → string minor DTO → `BigInt` persist → string JSON out.

**PASS** for ledger/budget/goal forms and document mock extract (R2).  
Seed seasonality float remains seed-only (not a V1 runtime API path).

---

## Acceptance bar

> zero known unsafe money paths in V1 financial flows

**Met for runtime V1 extract + ledger writes (R2).** Seed float scaling is out of runtime path.
