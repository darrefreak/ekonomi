import { test, expect } from "@playwright/test";

/**
 * Regression cover for the two pages the product did not have.
 *
 * A mistyped URL served Next.js's English "This page could not be found" inside
 * a Swedish financial product, and there was no error boundary at all, so an
 * unexpected render error replaced the page with the framework's own screen.
 */
test.describe("error pages", () => {
  test("UX-E01 an unknown route explains itself in Swedish and offers a way back", async ({
    page,
  }) => {
    const response = await page.goto("/den-har-sidan-finns-inte");
    expect(response?.status()).toBe(404);

    await expect(page.getByRole("heading", { name: /vi hittade inte sidan/i })).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body, "the framework's English default must not appear").not.toMatch(
      /this page could not be found/i,
    );

    // A way out, not a dead end.
    await page.getByRole("link", { name: /till översikten/i }).click();
    await expect(page).toHaveURL(/localhost:3000\/$|\/login/);
  });

  test("UX-E02 /dashboard reaches the overview instead of a not-found page", async ({ page }) => {
    const response = await page.goto("/dashboard");
    expect(response?.status()).toBe(200);
    await expect(page).not.toHaveURL(/\/dashboard/);
  });
});
