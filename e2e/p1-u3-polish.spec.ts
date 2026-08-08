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
    const heading = page.getByRole("heading", { name: /granska|inget att granska/i });
    await expect(heading).toBeVisible({ timeout: 20_000 });

    const empty = page.getByRole("heading", { name: /inget att granska/i });
    if (await empty.isVisible().catch(() => false)) {
      test.info().annotations.push({
        type: "note",
        description: "Review queue empty in demo — UI smoke only",
      });
      return;
    }

    const dismiss = page.getByRole("button", { name: /avfärda/i }).first();
    await expect(dismiss).toBeVisible();
    const beforeCount = await page
      .locator("ul li")
      .filter({ has: page.getByRole("button", { name: /avfärda/i }) })
      .count();
    await dismiss.click();
    await expect
      .poll(async () => {
        return page
          .locator("ul li")
          .filter({ has: page.getByRole("button", { name: /avfärda/i }) })
          .count();
      }, { timeout: 15_000 })
      .toBeLessThan(beforeCount);
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
