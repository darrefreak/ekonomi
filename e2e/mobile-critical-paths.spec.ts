import { test, expect, type Page } from "@playwright/test";

/**
 * Mobile-web acceptance for the critical paths a household actually uses.
 * Runs only in the `mobile` Playwright project (iPhone-class viewport).
 *
 * Scope is responsive web. Native Expo/iOS stays out of scope.
 */
test.describe("mobile critical paths", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile project only");
  });

  async function expectNoHorizontalOverflow(page: Page) {
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
      };
    });
    // 1px tolerance for sub-pixel layout rounding.
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  }

  test("home, money, more and settings render without horizontal overflow", async ({
    page,
  }) => {
    for (const path of ["/", "/money", "/more", "/settings", "/review"]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });

  test("bottom navigation is reachable and More opens overflow IA", async ({
    page,
  }) => {
    await page.goto("/");
    const bottomNav = page.getByRole("navigation").first();
    await expect(bottomNav).toBeVisible();

    await page.goto("/more");
    const moreNav = page.getByRole("navigation", { name: /fler sidor/i });
    await expect(moreNav).toBeVisible();
    const firstLink = moreNav.getByRole("link").first();
    await expect(firstLink).toBeVisible();
    await firstLink.click();
    await expect(page.locator("main")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("core money mutation: create an account from mobile", async ({ page }) => {
    const name = `Mobil konto ${Date.now()}`;
    await page.goto("/accounts");
    const form = page.locator("form").filter({ hasText: /nytt konto/i });
    await form
      .locator("label")
      .filter({ hasText: /^namn$/i })
      .locator("input")
      .fill(name);
    await form
      .locator("label")
      .filter({ hasText: /öppningssaldo/i })
      .locator("input")
      .fill("1000");
    await form.getByRole("button", { name: /skapa konto/i }).click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalOverflow(page);
  });

  test("transaction detail opens and stays usable", async ({ page }) => {
    await page.goto("/money");
    const firstTx = page.locator('a[href^="/transactions/"]').first();
    await expect(firstTx).toBeVisible({ timeout: 15_000 });
    await firstTx.click();
    await expect(page).toHaveURL(/\/transactions\//);
    await expect(page.locator("main")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("vehicles: add-vehicle form opens and submits on mobile", async ({
    page,
  }) => {
    const name = `Mobilbil ${Date.now()}`;
    await page.goto("/vehicles");
    await page.getByRole("button", { name: /lägg till fordon/i }).click();

    const form = page.getByRole("form", { name: /lägg till fordon/i });
    await expect(form).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await form.getByRole("button", { name: /jag äger den redan/i }).click();
    await form
      .locator("label")
      .filter({ hasText: /^namn$/i })
      .locator("input")
      .fill(name);
    await form
      .locator("label")
      .filter({ hasText: /^märke$/i })
      .locator("input")
      .fill("Kia");
    await form
      .locator("label")
      .filter({ hasText: /^modell$/i })
      .locator("input")
      .fill("Ceed");
    await form
      .locator("label")
      .filter({ hasText: /årsmodell/i })
      .locator("input")
      .fill("2019");
    await form
      .locator("label")
      .filter({ hasText: /inköpspris/i })
      .locator("input")
      .fill("180000");
    await form
      .locator("label")
      .filter({ hasText: /nuvarande värde/i })
      .locator("input")
      .fill("120000");

    await form.getByRole("button", { name: /spara fordon/i }).click();
    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]{36}/, { timeout: 20_000 });
    await expect(page.getByText(name).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
