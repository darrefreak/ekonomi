import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function assertNoSeriousA11y(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test.describe("critical path", () => {
  test("dashboard → accounts → logout", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#main-content")).toBeVisible();
    await expect(page.getByRole("heading").first()).toBeVisible();

    await page.goto("/accounts");
    await expect(page).toHaveURL(/\/accounts/);
    await expect(page.locator("#main-content")).toBeVisible();

    await page.getByRole("button", { name: /logga ut/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("a11y: login, dashboard, accounts (serious+)", async ({ page }) => {
    await page.goto("/login");
    await assertNoSeriousA11y(page);

    await page.goto("/");
    await expect(page.locator("#main-content")).toBeVisible();
    await assertNoSeriousA11y(page);

    await page.goto("/accounts");
    await expect(page.getByRole("heading", { name: /konton/i })).toBeVisible();
    await assertNoSeriousA11y(page);
  });

  test("mobile Mer overflow IA", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile project only");
    await page.goto("/more");
    await expect(page).toHaveURL(/\/more/);
    await expect(page.getByRole("heading", { name: /^mer$/i })).toBeVisible();
    await expect(page.getByRole("navigation", { name: /fler sidor/i })).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: /fler sidor/i })
        .getByRole("link")
        .first(),
    ).toBeVisible();
  });
});
