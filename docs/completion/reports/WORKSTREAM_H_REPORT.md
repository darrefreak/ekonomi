# Workstream H Report — Vehicles

**Date:** 2026-08-07  
**Branch:** `cursor/workstream-h-vehicles-9c58`  
**Status:** COMPLETE for scoped H goals

---

## Completed requirements

1. **Full vehicle IA**
   - Household nav: overview / market / candidates / compare
   - Detail nav: overview · costs · maintenance · valuation · replacement
   - Real `/costs` and `/maintenance` pages (no redirect/placeholder)

2. **Link costs to vehicleId**
   - `persistBalancedEvent` accepts `vehicleId`
   - Demo Circle K fuel events linked after vehicle seed
   - FK migration `0012_workstream_h_vehicles.sql`
   - Transactions expose/filter/update `vehicleId` via financial event link
   - Vehicle detail returns `linkedEvents`, full `costs`, `odometerHistory`

3. **Compare / replace / sell window from live analysis over mock listings**
   - Seed stores mock snapshots + candidates only
   - `GET /api/v1/vehicle-market` recomputes `keepVsReplace` + `sellWindowHint` from live TCO/equity/finance end
   - `analysisSource: live_over_mock_listings`

---

## Remaining / deferred

- Vehicle scenario CRUD (P2)
- Lease agreement depth
- Marketplace feed still mock (by design)
- Transaction detail UI control to assign vehicle (API ready)

---

## Schema / API / UI

| Area | Change |
|---|---|
| Migration | `0012_workstream_h_vehicles.sql` FKs |
| API | Live vehicle-market; vehicle detail costs/odo/linked; txn vehicleId |
| Seed | Listings only; fuel → vehicleId |
| UI | Costs/maintenance + focused market IA |

---

## Gate results

| Gate | Result |
|---|---|
| `pnpm build` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ (vehicle-intel live analysis test) |
| `pnpm lint` | ✅ (echo stubs — known) |
| `pnpm db:migrate` | ✅ (`0012_workstream_h_vehicles`) |

---

## STOP

Workstream H complete for its scope.  
Do **not** auto-start I. Await: `START WORKSTREAM I`
