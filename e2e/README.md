# E2E (Playwright)

Critical-path + axe checks for Workstream O.

## Prerequisites

- API on `http://localhost:3001` (or `PLAYWRIGHT_API_URL`)
- Web on `http://localhost:3000` (or `PLAYWRIGHT_BASE_URL`)
- Seeded demo user (`pnpm db:seed`)
- Chromium system deps (or run via Playwright Docker image)

## Commands

```bash
pnpm test:e2e             # chromium + mobile (acceptance default)
pnpm test:e2e:desktop     # chromium only
pnpm test:e2e:mobile      # mobile viewport only (iPhone 12)
```

Mobile is part of the default run on purpose: mobile-only tests are gated with
`test.skip(testInfo.project.name !== "mobile")`, so a chromium-only default
reports them as skipped and silently drops mobile coverage.

Docker fallback when host libs are missing (e.g. `libatk-1.0.so.0`):

```bash
pnpm test:e2e:docker         # both projects
pnpm test:e2e:docker:mobile  # mobile only
```

## Route identity

A Next.js not-found result still renders the application shell, so `main`,
`#main-content` or "a heading exists" being true does not prove a route exists —
that is defect RT2-004. Use `e2e/helpers/route-identity.ts` instead:

- `gotoRoute(page, path)` navigates and proves that route rendered: not the
  not-found page, its own document title, its own level-1 heading, and where
  declared a control only that page offers.
- `expectNotFoundPage(page, expected)` asserts the not-found state explicitly,
  by title, by the built-in copy, and by `data-testid="not-found"`.
- `route-contract.spec.ts` walks every href the sidebar, bottom navigation, More
  menu and dashboard render, and fails if any of them lands on not-found.

Every routable page declares `metadata.title`, which is what makes the titles
unique and route identity independent of whether the page's data loaded.

Auth uses API login once (`e2e/auth.setup.ts`) and stores `e2e/.auth/demo.json`.
