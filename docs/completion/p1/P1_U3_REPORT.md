# P1-U3 Report — Product polish

**Branch:** `cursor/p1-u3-product-polish-9c58`  
**Base:** `cursor/p1-u2-product-completion-9c58`  
**Date:** 2026-08-08  
**Scope:** [`P1_U3_SCOPE.md`](./P1_U3_SCOPE.md) · Audit: [`P1_U3_AUDIT.md`](./P1_U3_AUDIT.md)

## Status

**P1-U3: COMPLETE (owned batch)**

P0 financial core remains protected (no float money, no Metric Registry bypass, no ledger architecture rewrite).

## Delivered

### 1. Vehicle purchase UX + seed narrative

- Demo seed uses **financed** purchase (`buildFinancedAssetPurchase`) at **389 000 SEK** on **2022-04-15** with **109 000** down / **280 000** financed — matches vehicle metadata + finance agreement.
- Historical principal paydown **85 000** → loan remaining **195 000**; depreciation **109 000** → asset mid **280 000**.
- Purchase event linked to `vehicleId` after vehicle row creation.
- api-client: `createFinancedAssetPurchase` (+ schema-validated cash purchase).
- Web: `VehiclePurchaseForm` (cash | financed) on vehicle detail; DTO exposes linked asset/loan account ids.

### 2. Dark theme application

- `ThemeApplicator` + FOUC script apply settings / localStorage / system to `<html class="dark">`.
- Settings copy updated; save applies immediately.

### 3. Merchant search

- API `GET /merchants?q=` filters canonical name **or** JSON aliases (ILIKE).
- Transaction detail uses searchable `MerchantPicker` (deferred query + alias hint).
- API test: `P1-U3: merchants q matches canonical name or aliases`.

### 4. Scoped E2E

- `e2e/p1-u3-polish.spec.ts`: budget edit persist, review dismiss, vehicles detail + purchase form.

## Explicitly deferred (not U3)

- Opportunity detector math rewrite (remain labeled)
- Jobs catalog beyond reconcile
- Full merchant import normalizer / merge
- Audit UI, recurring depth, leasing / market depth

## Gates

Recorded after commit/push in this batch:

| Gate | Result |
|---|---|
| typecheck / lint / build | (see CI / local run) |
| API + engine tests | (see local run) |
| E2E | Prefer `pnpm test:e2e:docker` if host Chromium libs missing |
| Docker compose | Smoke if services available |

## Stop

**Do not start U4** until instructed. Remaining themes: opportunity models, jobs UI, import normalizer, audit UI, deeper vehicle market/leasing, localization en-US, full WCAG.
