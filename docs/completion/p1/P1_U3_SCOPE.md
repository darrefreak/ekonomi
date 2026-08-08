# P1-U3 Scope — Product polish

**Branch:** `cursor/p1-u3-product-polish-9c58`  
**Base:** `cursor/p1-u2-product-completion-9c58`  
**Audit:** [`P1_U3_AUDIT.md`](./P1_U3_AUDIT.md)

## OWN (this batch)

1. **Vehicle purchase UX + seed narrative** — financed (preferred) demo coherence; cash + financed forms; `createFinancedAssetPurchase` api-client
2. **Dark theme application** — apply settings `appearance` to `<html>` via design tokens `.dark`
3. **Merchant search** — implement list `q` (name + aliases); searchable assign on transaction detail
4. **Scoped E2E** — budget edit, review resolve, vehicles detail

## DEFER (explicit)

- Opportunity model rewrite (remain labeled heuristics)
- Jobs catalog beyond reconcile
- Full merchant alias / import normalizer
- Audit UI, recurring depth, leasing / market depth
- Documents / integrations / AI polish

## Constraints

- P0 financial core protected (no float money, no Metric Registry bypass, no ledger rewrite)
- Stop after U3 OWN items + gates — do not start U4
