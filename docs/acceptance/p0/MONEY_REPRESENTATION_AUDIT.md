# Money Representation Audit

**Date:** 2026-08-07

---

## UNSAFE_MONEY (V1 financial relevance)

| Location | Classification | Notes |
|---|---|---|
| `apps/api/src/intake/mock-extract.ts:41` | **UNSAFE_MONEY** | `BigInt(Math.round(Number(raw) * 100))` → persisted `documents.amountMinor` |
| `apps/api/src/db/seed/demo-household.ts:580,661` | UNSAFE_MONEY (seed) | Float scaling in seed generation — not runtime API, still pollutes demo ledger construction |
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

**PASS** for ledger/budget/goal forms.  
**FAIL** if amount flows through document mock extract.

---

## Acceptance bar

> zero known unsafe money paths in V1 financial flows

**Not met** while `mock-extract.ts` remains.
