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

  test("vehicle candidates: create form persists after refresh", async ({ page }) => {
    await page.goto("/vehicles/candidates");
    await expect(page.getByText(/ny kandidat/i)).toBeVisible({ timeout: 15_000 });
    const name = `E2E Kandidat ${Date.now()}`;
    await page.getByRole("textbox", { name: "Namn", exact: true }).fill(name);
    await page.getByRole("textbox", { name: "Märke", exact: true }).fill("Kia");
    await page.getByRole("textbox", { name: "Modell", exact: true }).fill("Niro");
    await page.getByRole("textbox", { name: "Årsmodell", exact: true }).fill("2021");
    await page.getByRole("textbox", { name: "Utropspris (kr)", exact: true }).fill("289000");
    await page.getByRole("textbox", { name: "Ekonomisk / mån (kr)", exact: true }).fill("4200");
    await page.getByRole("button", { name: /skapa kandidat/i }).click();
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 });
  });

  test("vehicle replacement analysis shows explanation", async ({ page }) => {
    await page.goto("/vehicles/compare");
    await expect(page.getByText(/jämför|behåll|kandidat|rekommendation/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("leasing mileage excess visible on market page", async ({ page }) => {
    await page.goto("/vehicles/market");
    await expect(page.getByText(/privatleasing/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText(/överskrid|excess|månadsnormerad|total/i).first(),
    ).toBeVisible();
  });

  test("vehicle detail mobile metrics grid", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/vehicles");
    const detail = page.locator('a[href*="/vehicles/"]').filter({
      hasNotText: /marknad|kandidat|jämför/i,
    });
    // Prefer UUID detail links
    const uuidLink = page.locator('a[href^="/vehicles/"][href*="-"]').first();
    if (await uuidLink.count()) {
      await uuidLink.click();
    } else {
      await detail.first().click();
    }
    await expect(page.getByText("Kostnad / mil")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Rekommendation")).toBeVisible();
    await expect(page.getByText("Ekonomisk / mån")).toBeVisible();
  });

  test("merchant correction path available on transaction detail", async ({ page }) => {
    await page.goto("/transactions");
    await expect(page.getByRole("heading", { name: /transaktion/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.locator('a[href^="/transactions/"]').first().click();
    await expect(page.getByText(/butik/i).first()).toBeVisible({ timeout: 15_000 });
    // Searchable merchant control from U3 picker
    await expect(
      page.getByPlaceholder(/sök|butik|merchant/i).or(page.getByText(/ICA|butik/i)).first(),
    ).toBeVisible();
  });
});
