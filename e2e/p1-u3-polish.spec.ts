import { test, expect } from "@playwright/test";

/**
 * Browser E2E for P1-U3 product polish flows.
 * Uses demo storageState from auth.setup.ts.
 */
test.describe("P1-U3 product polish", () => {
  test("budget — edit planned line persists after reload", async ({ page }) => {
    await page.goto("/budget");
    await expect(page.getByRole("heading", { name: /budget/i })).toBeVisible({
      timeout: 20_000,
    });
    // The category-level budget lives behind the "Detaljerad" mode since
    // Smart Budget became the default experience.
    await page.getByRole("button", { name: /^Detaljerad$/ }).click();

    const firstLine = page.locator("li").filter({ has: page.getByText(/planerat \(kr\)/i) }).first();
    await expect(firstLine).toBeVisible({ timeout: 15_000 });
    const input = firstLine.locator('input[inputmode="decimal"]');
    const current = await input.inputValue();
    const next = current === "12345" ? "12346" : "12345";
    await input.fill(next);
    await firstLine.getByRole("button", { name: /spara/i }).click();
    await expect(input).toHaveValue(next, { timeout: 15_000 });

    await page.reload();
    await expect(page.getByRole("heading", { name: /budget/i })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: /^Detaljerad$/ }).click();
    const reloaded = page
      .locator("li")
      .filter({ has: page.getByText(/planerat \(kr\)/i) })
      .first()
      .locator('input[inputmode="decimal"]');
    await expect(reloaded).toHaveValue(next, { timeout: 15_000 });
  });

  test("review — dismiss or resolve control present and works", async ({
    page,
  }) => {
    await page.goto("/review");
    // .first(): once review data loads, the section heading "Mönster att
    // granska" also matches /granska/ and a strict locator would be ambiguous.
    const heading = page
      .getByRole("heading", { name: /granska|inget att granska/i })
      .first();
    await expect(heading).toBeVisible({ timeout: 20_000 });

    const empty = page.getByRole("heading", { name: /inget att granska/i });
    if (await empty.isVisible().catch(() => false)) {
      test.info().annotations.push({
        type: "note",
        description: "Review queue empty in demo — UI smoke only",
      });
      return;
    }

    const firstItem = page
      .locator("ul li")
      .filter({ has: page.getByRole("button", { name: /avfärda/i }) })
      .first();
    await expect(firstItem).toBeVisible();
    // Title is the second paragraph in the item body (kind label is first).
    const title = (
      await firstItem.locator("p.font-medium, p.mt-1.font-medium").first().textContent()
    )?.trim();
    expect(title && title.length > 0).toBeTruthy();
    await firstItem.getByRole("button", { name: /avfärda/i }).click();
    // Queue is capped; total count may stay stable while this entity leaves.
    await expect(firstItem).not.toContainText(title!, { timeout: 15_000 });
  });

  test("vehicles — list to detail with purchase form", async ({ page }) => {
    await page.goto("/vehicles");
    await expect(page.getByRole("heading", { name: /fordon|vehicles/i })).toBeVisible({
      timeout: 20_000,
    });

    const link = page.getByRole("link").filter({ hasText: /volvo|familjebil|xc60/i }).first();
    if (await link.count()) {
      await link.click();
    } else {
      await page.locator('a[href^="/vehicles/"]').first().click();
    }

    await expect(page).toHaveURL(/\/vehicles\/[^/]+/, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: /registrera köp i ledger/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /finansierat/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /bokför köp/i })).toBeVisible();
  });
});
