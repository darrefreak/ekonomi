# UX functional audit

**Date:** 2026-08-10
**Scope:** the web product's interactive behaviour. No ledger, accounting or
financial-architecture change.
**Method:** the running application was driven, not read.

---

## 1. How this was produced

`ux-audit/` holds the instruments. They are deliberately outside `e2e/`, because
the E2E suite is a gate that must stay deterministic while these sweep for
problems and are expected to report rather than to pass.

| Instrument | What it does |
|---|---|
| `sweep.spec.ts` | Visits 27 routes and records what the browser reports: console messages, failed requests, controls without accessible names, inputs without labels, tap target sizes, computed font sizes, horizontal overflow, English copy, money-format variants, technical text |
| `interactive.spec.ts` | Types and clicks: the sign-in cases, a dead-control sweep across 10 routes, and whether a mutation appears without a refresh |
| `session-probe.spec.ts` | Replaces the stored session with a revoked token and observes what the person is shown |
| `dark-mode.spec.ts` | 28 routes × light and dark, computing contrast from rendered colours, walking up for the real background where an element is transparent |
| `contrast-probe.spec.ts` | The design tokens and every coloured control, measured as rendered |
| `goals-probe.spec.ts` | Why a specific submission produced nothing |
| `pilot-signin.spec.ts` | What the live pilot's sign-in screen shows a real participant |

**Viewports:** Desktop Chrome 1440×900, iPhone 12 (390×844, `isMobile`), and
375×812.

**Two honest limits.** Playwright's WebKit is not iOS Safari, so the mobile
findings below are the ones reachable by measuring CSS and layout — the 16px
zoom threshold, safe-area handling, tap target geometry — rather than by running
the real browser. And a machine cannot judge whether a surface *feels* finished;
the flows in §57 were executed, but the aesthetic call remains a human one.

---

## 2. Findings

Severity reflects consequence for a household using this with real money.

### UX-001 · The sign-in form arrived with a shared account's credentials — HIGH

- **Route:** `/login` · **Viewport:** both · **Control:** the sign-in form
- **Reproduce:** open `/login` in a clean browser.
- **Expected:** empty fields, ready for the household's own credentials.
- **Actual:** email and password pre-filled with `demo@ffos.local` /
  `demo-password-123`, both also printed under the form, plus an *Använd
  demo-konto* button. Clicking *Logga in* without typing anything signed in as
  the demo user — which is how the audit found it.
- **Consequence:** a deployment holding a real household's finances showed
  somebody else's working credentials on its sign-in screen. A pre-filled
  password field also stops a password manager from filling it, and forces the
  person to clear it before typing.
- **Root cause:** `useState(DEMO_CREDENTIALS.email)` in `login-page.tsx`, a
  development convenience that shipped.

### UX-002 · A session that could not be refreshed left the product looking broken — HIGH

- **Route:** `/`, `/accounts`, `/transactions`, `/settings` · **Viewport:** both
- **Reproduce:** sign in, replace `ffos.accessToken` and `ffos.refreshToken` with
  revoked values, reload.
- **Expected:** the person is asked to sign in again.
- **Actual:** the authenticated shell stayed on screen — sidebar, page title,
  empty cards — while 3–9 API calls answered 401. No redirect, no explanation.
- **Consequence:** an expired or revoked session presented as a product that had
  silently stopped working. This is §5's failure mode almost exactly.
- **Root cause:** `onAuthFailure: clearSession` in `lib/api.ts` discarded the
  tokens but never ended the visit.

### UX-003 · Every form control rendered at 14px — HIGH

- **Route:** all · **Viewport:** mobile
- **Reproduce:** focus any input on an iPhone.
- **Expected:** the field is focused.
- **Actual:** 198 controls across the product computed to 14px. iOS Safari zooms
  the page when a focused input is under 16px, and does not zoom back.
- **Consequence:** on the device this product is meant to be used from, tapping
  any field made the layout jump and pushed the rest of the form off-screen.
- **Root cause:** inputs inherit `text-sm` from the label that wraps them.

### UX-004 · 66 inputs and selects had no accessible name — HIGH

- **Routes:** `/transactions`, `/goals`, `/review`, `/settings`, `/scenarios`,
  `/advisor`, `/documents` · **Viewport:** both
- **Expected:** every control is announced.
- **Actual:** 66 controls had no label, no `aria-label` and no wrapping label.
  The transaction search and account filter, the per-row category pickers in
  review, the member role and data-policy selects, the goal and buffer forms, the
  scenario fields, the advisor question box and the file input were all silent. A
  `placeholder` is not a label, and a `<select>` cannot have one at all.
- **Consequence:** the product is unusable with a screen reader on those
  surfaces, and clicking a label does not focus its field.

### UX-005 · The API's English reached the participant in 52 places — HIGH

- **Routes:** most · **Viewport:** both
- **Reproduce:** sign in with a wrong password; open an entity that has been
  deleted; try to demote the last owner.
- **Expected:** an explanation in Swedish.
- **Actual:** `Invalid credentials`, `Account not found`, `Budget line not
  found`, `Cannot demote the last OWNER` rendered verbatim. 52 call sites did
  `err instanceof Error ? err.message : "…"`.
- **Consequence:** this is the defect reported from the pilot as *"Ladda demo
  data resulterar i invalid credentials"* — English backend wording where the
  person expected Swedish.

### UX-006 · Settings offered a base currency it could not honour — HIGH

- **Route:** `/settings` · **Viewport:** both
- **Expected:** the household's currency, which is immutable.
- **Actual:** a selector labelled *Hushållets basvaluta* listing SEK, EUR, USD,
  NOK and DKK. The engine only aggregates SEK, a household's base currency
  cannot change once it holds bookkeeping, and choosing another wrote
  `financialPolicies.currency` — a different field from the one the label names.
- **Consequence:** a control that appeared to offer something the product had
  already, deliberately, refused. It could put a policy currency out of step with
  every amount around it.
- **Note:** the same class of defect as FPR-001, in a surface that pass did not
  reach.

### UX-007 · Primary buttons were nearly unreadable in dark mode — HIGH

- **Route:** all · **Viewport:** both, dark scheme
- **Expected:** a legible label on every primary action.
- **Actual:** the accent inverts between schemes — `#1f4d3a` in light, `#8fbfa8`
  in dark — while 50 controls drew their label in fixed `text-white`. Measured on
  the rendered button, white on the dark scheme's accent is **2.06:1**, against
  4.5:1 required. Light mode measured 9.63:1.
- **Consequence:** in dark mode, the label on every primary button in the
  product — *Skapa konto*, *Spara*, *Logga in* — was close to invisible.

### UX-008 · English copy in surfaces the product shows on every page — MEDIUM

- **Routes:** all (`nav-config.ts`), `/goals`, `/` · **Viewport:** both
- **Actual:** the desktop sidebar grouped every page under `OVERVIEW`, `MONEY`,
  `PLANNING`, `WEALTH`, `OPTIMIZE`, `DOCUMENTS`, `CONNECTIONS`, `OPS`,
  `SETTINGS`. The goals page called its entries *sinking funds* in headings,
  empty states and errors, including the hybrid *"Kunde inte spara sinking
  funden"*. The dashboard subtitle read *as of*. A navigation entry was called
  *Onboarding*.
- **Consequence:** the section headings were the most persistent English in the
  product, visible on every single page.

### UX-009 · A mistyped URL served the framework's English not-found page — MEDIUM

- **Route:** any unknown path · **Viewport:** both
- **Actual:** no `not-found.tsx` existed, so Next.js served *This page could not
  be found*, with nothing to do next. No `error.tsx` existed either, so an
  unexpected render error replaced the page with the framework's screen.
- **Consequence:** the two moments a person most needs reassurance that their
  money is intact were the two least finished screens in the product.
- **Note:** carried in the open-findings register as RT2-010.

### UX-010 · `/dashboard` answered 404 — LOW

- **Actual:** the overview lives at `/`; `/dashboard` is the address people guess
  and bookmark, and it returned not-found.
- **Note:** carried in the open-findings register as RT-014.

### UX-011 · Two different create forms shared one button name — MEDIUM

- **Route:** `/goals` · **Viewport:** both
- **Reproduce:** submit the page's first *Skapa* button with a goal name typed
  into the goal form.
- **Actual:** the page has two create forms and both offered a button called
  *Skapa*. Submitting produced *"Ange namn och målbelopp för fonden"* — the other
  form's validation — with no request sent.
- **Consequence:** the label did not say what would be created, and a screen
  reader heard the same name twice on one page. This is what made the
  walkthrough's goal step impossible to write unambiguously, which is a fair
  proxy for a person hitting the wrong one.

### UX-012 · Muted text missed AA in dark mode — LOW

- **Actual:** `--ffos-text-muted: #8a877d` measured 4.40:1 on the elevated
  surface, against 4.5:1 required for normal text. Present on every route.

### UX-015 · Two create forms let the browser write their validation — MEDIUM

- **Routes:** `/accounts`, `/settings` (invite) · **Viewport:** both
- **Reproduce:** submit either form empty.
- **Expected:** the product's own Swedish message, as `/goals` shows.
- **Actual:** the browser blocked submission and displayed **"Please fill out
  this field."** — its own wording, in its own language, in its own chrome. Each
  form already carried a correct Swedish message (*"Ange ett kontonamn."*, *"Ange
  en e-postadress att bjuda in."*) that could never run, because native
  `required` validation fires before the submit handler.
- **Consequence:** the product's most-used create form explained itself in
  English, and its validation looked and behaved unlike every other form. A
  Swedish household on an English-configured phone sees English.
- **Note:** the dead-control sweep flagged these as producing no feedback. That
  was nearly right and diagnostically wrong: the feedback existed, in the
  browser's voice rather than the product's. Confirmed by reading
  `validationMessage` off the invalid controls.

### UX-016 · Settings showed a note meant for developers — MEDIUM

- **Route:** `/settings` · **Viewport:** both
- **Actual:** seven error paths appended `(kräver backend-stöd, se
  P1-U1-rapport)` to whatever the API said, naming an internal report. Visible on
  any settings failure — role change, data policy, invite, member removal.
- **Consequence:** internal engineering notes in front of the participant. These
  sites also bypassed the shared error mapping, so they carried untranslated API
  text as well.

### UX-013 · Tap targets under 40px on mobile — LOW

- **Actual:** 106 controls on mobile measured under 40px in at least one
  dimension. Once inline links inside a sentence are excluded — exempt under WCAG
  2.5.8 — and the skip link, which is deliberately off-screen until focused, the
  remainder were standalone action links.

### UX-014 · `pnpm pilot:preflight` read the wrong environment — MEDIUM (operational)

- **Reproduce:** run the documented command from a shell that has exported
  `.env.test`.
- **Actual:** a real process variable beats `.env.pilot`, so preflight inspected
  the test database and failed on names it should never have seen. The command as
  documented also defaulted `APP_ENV` to `development`.
- **Consequence:** the operator's first instruction did not do what it said. The
  guard *the running API is serving the database this preflight checked* is what
  exposed it, so the check itself was working.

---

## 3. What was checked and found sound

Recording these matters as much as the defects, because they were verified rather
than assumed.

| Area | Result |
|---|---|
| React console health | **0** errors or warnings across 27 routes × 3 viewports. The 242 console entries in one run were 401s from the audit's own token expiring mid-run, not product errors |
| Network | No duplicate mutations, no polling loops, no requests to obsolete endpoints. The 59 apparent failures were all `?_rsc=` prefetch aborts — normal App Router cancellation |
| Horizontal overflow | **0** at 375px across all routes |
| Technical text on screen | **0** — no stack traces, JSON dumps or raw status codes |
| Mutation freshness | Creating an account appeared in the list with no reload, cleared the form, and showed a confirmation. It also survived a real reload, so it was persisted rather than shown optimistically |
| Money formatting | Consistent `12 450 kr`. The two `SEK` occurrences are a currency being named, not an amount being formatted |
| Controls without accessible names | **0** buttons or links |
| Navigation | Every sidebar, bottom-nav and More href resolves to its own page; the existing route-contract suite covers this and passes |
| Dead controls | The sweep flagged 8 candidates. Each was clicked individually with the page text captured before and after: 5 were working controls showing inline validation or revealing a form, 1 was not present at the time of the sweep, and 2 turned out to be UX-015 — real, but a different defect than "dead" |

---

## 4. Counts

| Severity | Found | Fixed | Remaining |
|---|---|---|---|
| BLOCKER | 0 | 0 | 0 |
| HIGH | 7 | 7 | 0 |
| MEDIUM | 6 | 6 | 0 |
| LOW | 3 | 3 | 0 |
| COSMETIC | 0 | 0 | 0 |

Remediation and evidence: `UX_REMEDIATION_REPORT.md`. Regression cover:
`UX_REGRESSION_MATRIX.md`.
