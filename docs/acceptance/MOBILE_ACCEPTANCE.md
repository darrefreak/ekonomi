# Mobile Acceptance

**Viewports:** 375×812 (Playwright iPhone 12 project); larger modern iPhone not separately automated.  
**Date:** 2026-08-07

## Global checks

| Check | Result | Notes |
|---|---|---|
| Bottom navigation | PASS | Primary routes |
| More overflow IA | PASS | E2E Mer; links desktop IA |
| Horizontal overflow (critical) | PASS | E2E pages; not every route measured |
| Touch targets (critical UI) | PASS | min-h-11 patterns common |
| Sticky UI obstruction | PARTIAL | Bottom nav + safe-area CSS present |
| Forms / keyboard | PARTIAL | Login/settings/accounts forms usable patterns |
| Long money values | PARTIAL | `tabular-nums` / MoneyValue; not stress-tested all pages |
| Charts usable | PARTIAL | Mini charts; limited a11y text |

---

## Per-route (375)

Method: route exists + mobile IA reachable via Mer/bottom nav. Full visual PASS/FAIL per route not instrumented; mark **PASS*** = inferred from module + shared shell, **PASS** = covered by mobile E2E.

| Route | 375 |
|---|---|
| `/` | PASS |
| `/accounts` | PASS |
| `/login` | PASS |
| `/more` | PASS |
| `/transactions` | PASS* |
| `/transactions/[id]` | PASS* |
| `/accounts/[id]` | PASS* |
| `/cashflow` | PASS* |
| `/budget` | PASS* |
| `/net-worth` | PASS* |
| `/investments` | PASS* |
| `/assets` | PASS* |
| `/debt` | PASS* |
| `/forecast` | PASS* |
| `/goals` | PASS* |
| `/scenarios` | PASS* |
| `/insights` | PASS* |
| `/opportunities` | PASS* |
| `/subscriptions` | PASS* |
| `/contracts` | PASS* |
| `/risk` | PASS* |
| `/documents` | PASS* |
| `/integrations` | PASS* |
| `/imports` | PASS* |
| `/advisor` | PASS* |
| `/review` | PASS* |
| `/settings` | PASS* |
| `/vehicles` (+ subroutes) | PASS* |
| `/reports` `/notifications` `/onboarding` | PASS* |

**Mobile gate:** **PASS** for navigation completeness (P0-6 closed). Residual: not every dense table/chart audited for overflow.

---

## Desktop (1440×900) — summary

| Check | Result |
|---|---|
| Sidebar / global nav | PASS (AppShell) |
| Cmd/Ctrl+K search | PASS (module; API search 200) |
| Dense tables/charts | PARTIAL (not visually re-audited) |
| Settings / dialogs | PASS patterns |
| Placeholder leftovers | PASS (none) |
