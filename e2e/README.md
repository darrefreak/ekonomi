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

Note that a Next.js 404 still renders the app shell, so `main` / `#main-content`
being visible does not prove a route exists. Assert page-specific content too.

Auth uses API login once (`e2e/auth.setup.ts`) and stores `e2e/.auth/demo.json`.
