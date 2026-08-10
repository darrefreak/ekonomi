# UX remediation report

**Date:** 2026-08-10
**Companion documents:** `UX_FUNCTIONAL_AUDIT.md` (what was found),
`UX_REGRESSION_MATRIX.md` (what holds it in place)

Nothing in this pass changed the ledger, accounting semantics, or the financial
architecture. Every accepted invariant was re-run afterwards.

---

## 1. Result

**UX quality pass: COMPLETE**, with the qualifications in §6 stated plainly
rather than buried.

| | Found | Fixed | Remaining |
|---|---|---|---|
| BLOCKER | 0 | 0 | 0 |
| HIGH | 7 | 7 | 0 |
| MEDIUM | 6 | 6 | 0 |
| LOW | 3 | 3 | 0 |

Two findings the open-findings register had carried since the red-team work —
RT-014 and RT2-010 — were closed as part of this pass, taking that register from
4 pass / 8 fail to 6 pass / 6 fail. The six that remain are financial and domain
semantics, out of scope here by instruction.

---

## 2. What changed

### Sign-in and session

`login-page.tsx`, `lib/api.ts`, `Dockerfile.web`, `docker-compose.yml`

The form no longer arrives with anyone's credentials. Demo affordances — the
pre-filled fields, the printed credentials, the *Använd demo-konto* button — are
now opt-in per build through `NEXT_PUBLIC_FFOS_SHOW_DEMO`, which development sets
and no other deployment does. The live pilot was rebuilt and verified: no demo address, no demo
password, no demo button, empty fields, a working reveal control, and 16px
inputs — checked against the running deployment on port 3020, not only in
development.

A session that can no longer be refreshed now ends the visit and returns the
person to sign-in, carrying the intended URL so they come back to the page they
were reading. Only in-product paths are accepted as a return target, so a crafted
`?next=` cannot bounce someone off-site immediately after authenticating. The
navigation is a full document load on purpose: it discards the React tree holding
the previous household's data rather than trusting every cache to drop it.

The form also gained a show/hide password control, autofocus on the email field,
`inputMode="email"` so the mobile keyboard is the right one, and it now keeps the
email while clearing only the password after a failure, so a retry is one field.

### Reading on a phone

`globals.css`

Form controls render at 16px. This was one rule, and it fixed 198 controls at
once — which is also the only way it stays fixed as new forms are added. Below
16px, iOS Safari zooms on focus and does not zoom back, so every form in the
product jumped and pushed itself off-screen on the device this is meant to be
used from.

### Being announced

Seven components

The 66 unnamed controls now have accessible names: the transaction search and
account filter, the per-row category pickers in review, the member role and
data-policy selects (named per member, so a reader hears *whose* role it is), the
goal and buffer-post fields, the scenario fields, the advisor question box, and
the file input.

### Errors in the participant's language

`lib/error-message.ts` and 28 components

`describeError()` maps what the API actually returns to Swedish. The 52 call sites
that rendered `err.message` verbatim now pass through it, keeping their existing
Swedish fallback. The rule is narrow on purpose: a known API message is
translated, a message the product wrote itself passes through unchanged, and
anything else becomes the caller's fallback — so no untranslated English can
reach a person even from a code path nobody anticipated.

### Forms that answer in the product's own words

`accounts-page.tsx`, `settings-page.tsx`

The account and invite forms left native `required` in charge, so the browser
blocked submission and showed *"Please fill out this field."* — its wording, its
language — while the correct Swedish message each form already carried could
never run. `noValidate` hands validation back to the product; the attributes stay
for assistive technology. A Swedish household on an English-configured phone now
reads Swedish.

Settings appended `(kräver backend-stöd, se P1-U1-rapport)` to seven error paths,
naming an internal report in front of the participant. Those paths also bypassed
the shared mapping, so they carried untranslated API text too. All seven go
through `describeError` now.

### A currency the product can actually serve

`settings-page.tsx`, `lib/account-labels.ts`

The base currency is stated, not offered, with a sentence explaining why it cannot
change for a household that already holds bookkeeping. The `CURRENCIES` list of
five currencies the engine cannot aggregate was unused afterwards and is gone.

### Dark mode

`packages/design-tokens/src/tokens.css`, `globals.css`, 23 components

A `--ffos-on-accent` token flips with the accent, so the label on a primary button
is white on the light scheme's dark green and near-black on the dark scheme's
light sage. Measured on the rendered control: 9.63:1 light, 7.97:1 dark, replacing
2.06:1. `--ffos-text-muted` was nudged for 4.82:1 on the elevated surface.

Sweeping 28 routes in both schemes now reports **no** text below its AA
threshold, from two findings per route before.

### Swedish throughout

`nav-config.ts`, `goals-page.tsx`, `dashboard-view.tsx`

The sidebar's group headings are Swedish; *Risk* and *AI* read the same in both.
The goals surface calls its entries *buffertposter*. The dashboard subtitle says
*per*. The navigation entry is *Kom igång*.

### The two screens that did not exist

`app/not-found.tsx`, `app/error.tsx`, `app/dashboard/page.tsx`

A wrong URL and a failed render are the two moments a person most needs to know
their money is intact, and they were the least finished screens in the product.
Both now say so in Swedish and offer a way onward. The error boundary surfaces
Next.js's digest — not a stack trace, and the one technical detail that makes a
report actionable. `/dashboard` reaches the overview.

### Buttons that say what they do

`goals-page.tsx`

The second create form's button is *Skapa buffertpost*, so the two forms on that
page no longer offer the same word for different outcomes.

### The operator's first instruction

`package.json`, `docs/pilot/PILOT_OPERATING.md`

`pilot:preflight` and `pilot:check` pin `APP_ENV=pilot`, so the documented command
reads the pilot's own configuration. The shell-pollution trap is written down with
the symptom to recognise it by.

---

## 3. Verification

| Gate | Result |
|---|---|
| Build | PASS — 11 tasks |
| Lint | PASS — 18 tasks, 0 errors, 0 warnings |
| Typecheck | PASS — 18 tasks |
| Unit tests | PASS — 355 tests, 0 failures |
| E2E | PASS — 113 passed, 0 failed, 10 skipped (viewport gating: mobile-only specs on desktop and vice versa) |
| Docker | PASS — dev and pilot stacks build and run |

### Pilot invariants (§56)

| Suite | Result |
|---|---|
| Accounting integrity / financial oracle | **12/12** |
| Currency invariant | **23/23** |
| Erasure invariant | **14/14** |
| Budget bootstrap | **17/17** |
| Production secret | **14/14** |
| Invariant re-acceptance | **27/27** |
| Pilot preflight | **PASS** — 25 mandatory checks, 0 failed, 0 advisories |

**107 invariant checks, 0 failures**, re-run against the finished code. No UI
change regressed an accepted invariant.

One regression did occur during this pass and was caught: the new not-found page
broke the navigation route contract, which distinguishes a real page from a
not-found one by the framework's English copy. That helper already anticipated a
custom page via `data-testid="not-found"`, and the page now declares it —
otherwise every route assertion in that suite would have been checking nothing.

Four probes report pre-existing failures unrelated to this pass, all in API and
domain behaviour this workstream did not touch: an orphan-row count in
`erasure.py` (ERA-014), password strength and rate limiting in `security-probe.py`
(SEC-011, SEC-014 — the latter noting the development stack raises the limit to
2000 for E2E runs), and large-amount validation in `data-robustness.py` (ROB-004).
They are held in the open-findings register, and the register was re-run to
confirm this pass changed none of them except the two it closed.

### Measured before and after

| | before | after |
|---|---|---|
| Controls under 16px | 198 | **0** |
| Inputs without an accessible name | 66 | **0** |
| Tap targets under 40px (mobile) | 106 | **0** |
| Contrast failures | 2 per route, dark | **0** across 28 routes × 2 schemes |
| English copy in the UI | 4 surfaces | **0** |
| React console errors | 0 | **0** |
| Horizontal overflow at 375px | 0 | **0** |
| Raw API text reachable by a user | 52 sites | **0** |

---

## 4. Area results

| Area | Result | Basis |
|---|---|---|
| Login | PASS | 13 tests, both viewports: empty submit, wrong password, Enter, reveal, autocomplete, 16px, valid sign-in, reload |
| Logout | PASS | Ends the session; a protected route no longer opens |
| Session restore | PASS | Reload keeps the session; a revoked one returns to sign-in on 4 routes and comes back to the intended page |
| Navigation | PASS | Route-contract suite: every sidebar, bottom-nav, More and quick-action href resolves; no 404 |
| Mobile bottom nav | PASS | Existing mobile suite passes on the iPhone 12 project |
| Forms | PASS | Account, goal, buffer post, vehicle, settings, invite, scenario, document and sign-in forms exercised |
| Money inputs | PASS | `2500,50` accepted and persisted through account creation; minor-unit representation unchanged |
| Dates / selects | PASS | Date inputs are native and locale-driven; every select has a name |
| Buttons | PASS | Every button has an accessible name; the ambiguous pair is distinguished |
| Dead actions | **0 critical** | Each of the sweep's 8 candidates was clicked individually with page text captured before and after: 5 working controls, 1 not present at sweep time, 2 were UX-015 (real, but the browser answering instead of the product) — now fixed |
| Mutation refresh | PASS | Account creation appears with no reload and survives one |
| Dialogs / sheets | PASS, with a note | Existing dialog suites pass. Probing the vehicle form found it is an expanding inline form rather than a `role="dialog"`, so focus-trap semantics do not apply; focus does move into it on open, to *Stäng formuläret*. Escape does not close it — reasonable for an inline form, and recorded rather than changed |
| Loading | PASS | No bare "Loading…" anywhere (the English word list returns 0). `/documents`, `/imports`, `/opportunities` and `/notifications` were read 250ms after navigation and none showed `0 kr` while still loading |
| Empty states | PASS, partially verified | Surfaces name themselves and none render a blank card. `/documents` offers a primary action; on `/imports`, `/opportunities` and `/notifications` the settled copy did not match the action-verb check, and these were read rather than reworked — see §6 |
| Errors | PASS | Human Swedish, no stack traces, no raw status codes; an error boundary now exists |
| Transactions | PASS | List → detail → back, filter, grouping, per-row category pickers |
| Dashboard | PASS | States position and freshness; deduction rows read in Swedish |
| Budget | PASS | Opens and states its period; bootstrap invariants 17/17 |
| Vehicles | PASS | List → detail with cost, value and maintenance content |
| Settings | PASS | Every control has a name; the one decorative control is gone |
| Privacy UI | PASS | Reachable and explains itself; erasure semantics untouched, 14/14 |
| Dark mode | PASS | 28 routes × 2 schemes, 0 contrast failures |
| Keyboard / a11y | PASS for critical workflows | Every input labelled, every control named, focus visible, existing axe checks pass |
| Mobile | PASS | 390×844 and 375×812; no overflow, no sub-16px control, no small target |
| Desktop | PASS | 1440×900 across 27 routes |
| Console | PASS | No product errors |
| Network | PASS | No duplicate mutations, no 404s, no polling loops |

---

## 5. Routes covered

27 in the passive sweep and 28 in the dark-mode sweep: `/`, `/accounts`,
`/transactions`, `/budget`, `/goals`, `/net-worth`, `/forecast`, `/cashflow`,
`/insights`, `/opportunities`, `/review`, `/vehicles`, `/debt`, `/investments`,
`/assets`, `/documents`, `/imports`, `/integrations`, `/contracts`,
`/subscriptions`, `/reports`, `/risk`, `/scenarios`, `/advisor`,
`/notifications`, `/settings`, `/more`, `/login`. Dynamic routes were reached by
navigation: `/transactions/:id`, `/vehicles/:id`, `/accounts/:id`.

---

## 6. What this pass does not claim

Stated because a green suite is not the same as a finished product.

1. **Playwright's WebKit is not iOS Safari.** The mobile findings are those
   reachable by measuring CSS and layout. Momentum scrolling, keyboard
   behaviour over a focused field, and `100vh` under a collapsing toolbar need a
   real iPhone.
2. **Aesthetic judgement was not automated.** Spacing, hierarchy and whether a
   surface feels premium were left as they are. This pass fixed function and
   legibility and deliberately did not redesign.
3. **The dead-control sweep clicked at most 25 buttons per route on 10 routes**,
   and skipped anything whose name suggested it destroyed data. It is a
   reasonable net, not a proof of coverage.
4. **Query invalidation was verified by observation, not by audit of every
   mutation.** Account creation was confirmed to refresh its list without a
   reload. A key-by-key review of every mutation against every dependent query
   was not performed, and remains the most likely place for a stale-UI defect to
   survive.
5. **Three empty surfaces were not improved.** `/imports`, `/opportunities` and
   `/notifications` explain themselves but did not clearly offer a next action.
   They are legitimately empty for this dataset rather than broken, and inventing
   calls-to-action for them edges toward product design rather than repair.
6. **Six findings in the open register remain**, all financial or domain
   semantics: RT-006, RT-007, RT-008, RT-009, RT-010, RT-011. Out of scope by
   instruction, unchanged by this pass.
