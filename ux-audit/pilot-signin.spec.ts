import { test, expect } from "@playwright/test";

/**
 * What the live pilot's sign-in screen shows a real participant.
 *
 * The pilot holds a real household's finances, so the demo affordances must be
 * absent there — not merely discouraged.
 */
test.use({ storageState: { cookies: [], origins: [] }, baseURL: process.env.PILOT_WEB_URL });

test("the pilot sign-in screen offers no demo account", async ({ page }) => {
  await page.goto("/login");
  await page.waitForTimeout(2500);

  const body = await page.locator("body").innerText();
  console.log(`\n--- pilot /login ---\n${body.slice(0, 300)}\n`);

  expect(body, "a shared account's address must not appear").not.toContain("demo@ffos.local");
  expect(body, "a shared account's password must not appear").not.toContain("demo-password-123");
  await expect(page.getByRole("button", { name: /demo/i })).toHaveCount(0);

  // And the form is still complete and usable.
  await expect(page.locator('input[name="email"]')).toHaveValue("");
  await expect(page.locator('input[name="password"]')).toHaveValue("");
  await expect(page.getByRole("button", { name: /^logga in$/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^visa$/i })).toBeVisible();

  const size = await page
    .locator('input[name="email"]')
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size, "iOS Safari zooms below 16px").toBeGreaterThanOrEqual(16);
});
