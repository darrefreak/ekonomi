import { test, expect } from "@playwright/test";

test.describe("P1-U6 vehicle & merchant depth", () => {
  test("vehicle market shows analytics ask copy", async ({ page }) => {
    await page.goto("/vehicles/market");
    await expect(
      page.getByRole("heading", { name: /marknad|kandidater/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/annonseras för|mock-annonser/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("vehicle candidates page has create form", async ({ page }) => {
    await page.goto("/vehicles/candidates");
    await expect(page.getByText(/ny kandidat/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /skapa kandidat/i })).toBeVisible();
  });

  test("vehicle replacement section visible", async ({ page }) => {
    await page.goto("/vehicles");
    const firstLink = page.locator('a[href^="/vehicles/"]').first();
    if (await firstLink.count()) {
      await firstLink.click();
      await expect(page.getByText(/ekonomisk \/ mån|rekommendation/i).first()).toBeVisible({
        timeout: 15_000,
      });
    }
  });

  test("vehicle detail mobile metrics grid", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/vehicles");
    const firstLink = page.locator('a[href^="/vehicles/"]').first();
    if (await firstLink.count()) {
      await firstLink.click();
      await expect(page.getByText(/rekommendation/i).first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(/kostnad \/ mil/i).first()).toBeVisible();
    }
  });
});
