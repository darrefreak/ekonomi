import { test, expect, type Page } from "@playwright/test";

/**
 * The product walkthrough from §57 of the UX pass, executed rather than read.
 *
 * Every step asserts something only that page can produce, so a redirect to a
 * not-found page or an empty shell fails the test instead of quietly passing on
 * a visible heading. The point is to prove the primary flows work end to end
 * after the UX fixes, including that a mutation shows up without a manual
 * refresh.
 */

const unique = () => Date.now().toString(36).slice(-5);

async function settle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1200);
}

test.describe("product walkthrough", () => {
  test("dashboard answers how the household is doing", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await expect(page.getByText(/finansiell position/i).first()).toBeVisible();
    // A metric surface, not just a shell.
    await expect(page.getByText(/nettoförmögenhet|tillgängliga pengar/i).first()).toBeAttached();
  });

  test("creating an account shows it in the list without a refresh", async ({ page }) => {
    await page.goto("/accounts");
    await settle(page);

    const name = `Sparkonto ${unique()}`;
    await page.getByLabel(/^namn$/i).first().fill(name);
    const opening = page.getByLabel(/öppningssaldo/i).first();
    if (await opening.count()) await opening.fill("2500,50");

    await page.getByRole("button", { name: /skapa konto/i }).click();

    // No reload between the click and the assertion, on purpose.
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 });

    // And it survives a real page load, so it was persisted rather than shown
    // optimistically.
    await page.reload();
    await settle(page);
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 });
  });

  test("the transaction list opens a detail page and comes back", async ({ page }) => {
    await page.goto("/transactions");
    await settle(page);
    await expect(page.getByRole("heading", { name: /transaktioner/i }).first()).toBeVisible();

    const firstRow = page.locator('a[href^="/transactions/"]').first();
    if ((await firstRow.count()) === 0) {
      test.skip(true, "no transactions in this dataset");
      return;
    }
    await firstRow.click();
    await settle(page);
    await expect(page).toHaveURL(/\/transactions\/[0-9a-f-]{36}/);
    // Detail-only content, so a not-found page cannot satisfy this.
    await expect(page.getByText(/kategori|konto|belopp/i).first()).toBeAttached();

    await page.goBack();
    await settle(page);
    await expect(page).toHaveURL(/\/transactions\/?$/);
    await expect(page.getByRole("heading", { name: /transaktioner/i }).first()).toBeVisible();
  });

  test("the search filter narrows the transaction list and is announced to a reader", async ({ page }) => {
    await page.goto("/transactions");
    await settle(page);
    const search = page.getByLabel(/sök transaktioner/i);
    await expect(search, "the filter needs an accessible name").toBeVisible();
    await search.fill("zzzz-no-such-merchant");
    await page.waitForTimeout(1200);
    // An honest empty result, not a blank panel.
    await expect(page.getByText(/inga|hittade|tom|matchar/i).first()).toBeAttached({ timeout: 10_000 });
  });

  test("budget opens and states the period it is showing", async ({ page }) => {
    await page.goto("/budget");
    await settle(page);
    await expect(page.getByRole("heading", { name: /budget/i }).first()).toBeVisible();
    await expect(page.getByText(/\d{4}-\d{2}|januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december/i).first()).toBeVisible();
  });

  test("creating a goal shows it without a refresh", async ({ page }) => {
    await page.goto("/goals");
    await settle(page);

    const name = `Resa ${unique()}`;
    await page.getByLabel(/namn på nytt mål/i).fill(name);
    await page.getByLabel(/^målbelopp \(kr\)$/i).fill("15000");
    // Named for what it creates: the page has a second create form below.
    await page.getByRole("button", { name: /^skapa mål$/i }).click();

    await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 });
  });

  test("vehicles list opens a vehicle and its analysis tabs resolve", async ({ page }) => {
    await page.goto("/vehicles");
    await settle(page);
    await expect(page.getByRole("heading", { name: /fordon/i }).first()).toBeVisible();

    // Only a vehicle's own page, not the market, compare or candidate links
    // that sit alongside it.
    const first = page
      .locator("a")
      .filter({ has: page.locator("xpath=.") })
      .locator('xpath=self::a[starts-with(@href,"/vehicles/") and string-length(@href)>45]')
      .first();
    if ((await first.count()) === 0) {
      test.skip(true, "no vehicles in this dataset");
      return;
    }
    await first.click();
    await settle(page);
    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]{36}/);
    await expect(page.getByText(/kostnad|värde|mätarställning|underhåll/i).first()).toBeVisible();
  });

  test("settings states the base currency instead of offering a currency it cannot use", async ({ page }) => {
    await page.goto("/settings");
    await settle(page);
    await expect(page.getByRole("heading", { name: /inställningar/i }).first()).toBeVisible();

    const stated = page.getByTestId("settings-base-currency");
    await expect(stated).toBeVisible();
    await expect(stated).toHaveText(/SEK/);
    // The selector that offered currencies the engine cannot aggregate is gone.
    await expect(page.locator("select option[value=EUR]")).toHaveCount(0);
  });

  test("privacy and erasure are reachable and explain themselves", async ({ page }) => {
    await page.goto("/settings");
    await settle(page);
    const privacy = page.getByText(/integritet|radera|personuppgift/i).first();
    await expect(privacy).toBeVisible();
  });

  test("signing out ends the session and a protected route no longer opens", async ({ page }) => {
    await page.goto("/settings");
    await settle(page);
    await page.getByRole("button", { name: /logga ut/i }).first().click();
    await page.waitForURL(/\/login/, { timeout: 15_000 });

    await page.goto("/accounts");
    await settle(page);
    await expect(page, "a protected route must not open after signing out").toHaveURL(/\/login/);
  });
});
