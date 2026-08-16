import { test, expect, type Page } from "@playwright/test";
import {
  expectNotFoundPage,
  expectRouteRendered,
  gotoRoute,
} from "./helpers/route-identity";

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

  test("home, transactions, more, settings and review render without horizontal overflow", async ({
    page,
  }) => {
    for (const path of ["/", "/transactions", "/more", "/settings", "/review"]) {
      // gotoRoute proves this route rendered: not the not-found page, and this
      // page's own heading rather than any heading the shell provides.
      await gotoRoute(page, path);
      await expect(page.locator("#main-content")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });

  test("bottom navigation is reachable and More opens overflow IA", async ({
    page,
  }) => {
    await gotoRoute(page, "/");
    const bottomNav = page.getByRole("navigation").first();
    await expect(bottomNav).toBeVisible();

    await gotoRoute(page, "/more");
    const moreNav = page.getByRole("navigation", { name: /fler sidor/i });
    await expect(moreNav).toBeVisible();
    const firstLink = moreNav.getByRole("link").first();
    await expect(firstLink).toBeVisible();
    const target = await firstLink.getAttribute("href");
    await firstLink.click();
    // The More menu is the mobile route into everything else, so a dead link
    // here hides most of the product. Prove the destination itself rendered.
    await expectRouteRendered(page, target ?? "");
    await expectNoHorizontalOverflow(page);
  });

  test("deep pages keep their primary destination selected", async ({ page }) => {
    for (const [path, label] of [
      ["/transactions", "Pengar"],
      ["/budget", "Planera"],
      ["/reports", "Insikter"],
      ["/vehicles", "Mer"],
      ["/review", "Hem"],
    ] as const) {
      await gotoRoute(page, path);
      const current = page
        .getByRole("navigation", { name: /mobilnavigation/i })
        .getByRole("link", { name: new RegExp(`^${label}$`, "i") });
      await expect(current).toHaveAttribute("aria-current", "page");
    }
  });

  test("report controls meet the 44px mobile target", async ({ page }) => {
    await gotoRoute(page, "/reports");
    const controls = page
      .getByRole("group", { name: /^(Mått|Dimension)$/ })
      .getByRole("button");
    const boxes = await controls.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().height),
    );
    expect(boxes.length).toBeGreaterThan(0);
    expect(Math.min(...boxes)).toBeGreaterThanOrEqual(44);
  });

  test("core money mutation: create an account from mobile", async ({ page }) => {
    const name = `Mobil konto ${Date.now()}`;
    await gotoRoute(page, "/accounts");
    await page.getByRole("button", { name: /nytt konto/i }).click();
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
    await gotoRoute(page, "/transactions");
    const firstTx = page.locator('a[href^="/transactions/"]').first();
    await expect(firstTx).toBeVisible({ timeout: 15_000 });
    await firstTx.click();
    await expect(page).toHaveURL(/\/transactions\/[0-9a-f-]{36}/);
    await expectNotFoundPage(page, false);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Unique to a transaction's own page: the back link and its classification
    // section. The shell has neither.
    await expect(page.getByRole("link", { name: /← Transaktioner/ })).toBeVisible();
    await expect(page.getByText(/^Klassificering$/)).toBeVisible({
      timeout: 15_000,
    });
    await expectNoHorizontalOverflow(page);
  });

  test("vehicles: add-vehicle form opens and submits on mobile", async ({
    page,
  }) => {
    const name = `Mobilbil ${Date.now()}`;
    await gotoRoute(page, "/vehicles");
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
