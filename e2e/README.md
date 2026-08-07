# E2E (Playwright)

Critical-path + axe checks for Workstream O.

## Prerequisites

- API on `http://localhost:3001` (or `PLAYWRIGHT_API_URL`)
- Web on `http://localhost:3000` (or `PLAYWRIGHT_BASE_URL`)
- Seeded demo user (`pnpm db:seed`)
- Chromium system deps (or run via Playwright Docker image)

## Commands

```bash
pnpm test:e2e            # chromium project
pnpm test:e2e:mobile     # mobile viewport project
```

Docker fallback when host libs are missing:

```bash
docker run --rm --network host \
  -v "$PWD":/work -w /work \
  -e PLAYWRIGHT_BASE_URL=http://localhost:3000 \
  -e PLAYWRIGHT_API_URL=http://localhost:3001 \
  mcr.microsoft.com/playwright:v1.62.1-jammy \
  bash -lc 'npx --yes playwright@1.62.1 test --config=playwright.config.ts'
```

Auth uses API login once (`e2e/auth.setup.ts`) and stores `e2e/.auth/demo.json`.
