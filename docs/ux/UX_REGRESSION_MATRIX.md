# UX regression matrix

Every HIGH and MEDIUM finding from `UX_FUNCTIONAL_AUDIT.md` mapped to the test
that fails if it returns. Written down rather than remembered.

---

## Coverage

| Finding | Severity | Test | Asserts |
|---|---|---|---|
| UX-001 sign-in pre-filled with a shared account | HIGH | `e2e/auth-ux.spec.ts` · UX-A01 | Both fields start empty; submitting empty does not sign anyone in |
| UX-001 (live pilot) | HIGH | `ux-audit/pilot-signin.spec.ts` | The pilot screen contains neither the demo address nor its password, and offers no demo button |
| UX-002 revoked session left the shell in place | HIGH | `e2e/session-ux.spec.ts` · UX-S01 | On `/`, `/accounts`, `/transactions`, `/settings`: reaches sign-in, and no `401`/`unauthorized`/`jwt` text is shown |
| UX-002 return to the intended page | HIGH | `e2e/session-ux.spec.ts` · UX-S02 | `?next=%2Faccounts` is set, and signing in lands back on Konton |
| UX-002 return target cannot leave the product | HIGH | `e2e/session-ux.spec.ts` · UX-S03 | A crafted absolute `?next=` does not navigate off-site |
| UX-003 controls under 16px | HIGH | `e2e/auth-ux.spec.ts` · UX-A04 | Computed font size of the sign-in fields is ≥ 16px |
| UX-003 (product-wide) | HIGH | `ux-audit/sweep.spec.ts` | Reports every control under 16px across 27 routes × 3 viewports; currently 0 |
| UX-004 inputs without an accessible name | HIGH | `ux-audit/sweep.spec.ts` | Reports every input, select and textarea without a label; currently 0 |
| UX-004 transaction filter specifically | HIGH | `e2e/walkthrough.spec.ts` · search filter | `getByLabel(/sök transaktioner/i)` resolves |
| UX-005 English API text reached the user | HIGH | `apps/web/src/lib/error-message.test.ts` | The strings the API returns map to Swedish; an untranslated English message never passes through |
| UX-005 at the sign-in surface | HIGH | `e2e/auth-ux.spec.ts` · UX-A02 | A wrong password shows *Fel e-post eller lösenord* and never *Invalid credentials*; the email survives, the password is cleared |
| UX-006 a base currency the engine cannot serve | HIGH | `e2e/walkthrough.spec.ts` · settings | The currency is stated as SEK and no `option[value=EUR]` exists on the page |
| UX-007 unreadable primary buttons in dark mode | HIGH | `ux-audit/contrast-probe.spec.ts` | Measures every coloured control in both schemes against its AA threshold |
| UX-007 (product-wide) | HIGH | `ux-audit/dark-mode.spec.ts` | 28 routes × 2 schemes; currently 0 findings |
| UX-008 English copy | MEDIUM | `ux-audit/sweep.spec.ts` | Word list includes `as of`, `sinking fund`, `Overview` and the rest; currently 0 |
| UX-009 English framework not-found page | MEDIUM | `e2e/error-pages.spec.ts` · UX-E01 | 404 status, Swedish heading, no *This page could not be found*, and the way back works |
| UX-010 `/dashboard` answered 404 | LOW | `e2e/error-pages.spec.ts` · UX-E02 | Status 200 and the URL is no longer `/dashboard` |
| UX-011 two forms sharing one button name | MEDIUM | `e2e/walkthrough.spec.ts` · goal creation | `Skapa mål` resolves uniquely and creates a goal that appears without a reload |
| UX-012 muted text below AA in dark mode | LOW | `ux-audit/dark-mode.spec.ts` | Contrast of every text node against its real background |
| UX-013 tap targets under 40px | LOW | `ux-audit/sweep.spec.ts` | Reports standalone controls under 40px, excluding inline links and the skip link |
| UX-015 the browser wrote the form's validation | MEDIUM | `e2e/form-validation-ux.spec.ts` · UX-V01 | An empty account form shows *Ange ett kontonamn.* and the page never contains *Please fill out this field.* |
| UX-015 an old error survives a good save | MEDIUM | `e2e/form-validation-ux.spec.ts` · UX-V02 | After a valid submit the account appears and the earlier message is gone |
| UX-016 a developer note shown to the participant | MEDIUM | `e2e/form-validation-ux.spec.ts` · UX-V03 | The invite error is Swedish and contains neither *kräver backend-stöd* nor *P1-U1-rapport* |
| UX-014 preflight read the wrong environment | MEDIUM | `pnpm pilot:preflight` | The script pins `APP_ENV=pilot`; the *running API is serving the database this preflight checked* guard catches a polluted shell |

---

## Behaviour cover added beyond the findings

`e2e/walkthrough.spec.ts` executes the §57 flows with assertions specific enough
that a not-found page or an empty shell cannot satisfy them:

| Step | Asserts |
|---|---|
| Dashboard | The position and freshness line, and a named metric |
| Create account | Appears with no reload **and** survives one, so it was persisted rather than shown optimistically |
| Transactions | List → detail on a UUID route → back to the list |
| Search | An honest empty result for a query that matches nothing |
| Budget | Opens and states the period it is showing |
| Create goal | Appears without a reload |
| Vehicle | A vehicle's own page, not the market or compare routes beside it, showing cost or value content |
| Settings | The stated base currency |
| Privacy | Reachable and self-explanatory |
| Sign out | Reaches sign-in, and a protected route no longer opens |

---

## Running it

```bash
# The gate. Both viewports.
docker run --rm --network host -v "$PWD":/work -w /work -e HOME=/tmp \
  mcr.microsoft.com/playwright:v1.62.1-jammy \
  bash -lc 'npx --yes playwright@1.62.1 test'

# The instruments. These report; they are not a gate.
docker run --rm --network host -v "$PWD":/work -w /work -e HOME=/tmp \
  mcr.microsoft.com/playwright:v1.62.1-jammy \
  bash -lc 'npx --yes playwright@1.62.1 test --config=ux-audit/playwright.audit.config.ts'

pnpm --filter @ffos/web test   # the shared error mapping
```

The audit writes `ux-audit/findings.json` and `ux-audit/dark-mode.json`. Both are
expected to be empty of the categories above; anything new in them is a
regression worth reading before it reaches a household.
