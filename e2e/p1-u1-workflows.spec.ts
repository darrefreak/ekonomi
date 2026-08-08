import { test, expect } from "@playwright/test";

/**
 * Browser E2E for P1-U1 core workflows.
 * Uses demo storageState from auth.setup.ts.
 */
test.describe("P1-U1 core workflows", () => {
  test("Flow 1 — create account with opening balance persists after refresh", async ({
    page,
  }) => {
    const name = `U1 Konto ${Date.now()}`;
    await page.goto("/accounts");
    await expect(page.getByRole("heading", { name: /konton/i })).toBeVisible();

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
      .fill("50000");
    await form.getByRole("button", { name: /skapa konto/i }).click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });
  });

  test("Flow 4 — create goal persists after refresh", async ({ page }) => {
    const name = `U1 Mål ${Date.now()}`;
    await page.goto("/goals");
    await expect(page.getByRole("heading", { name: /mål/i })).toBeVisible();

    const form = page.locator("form").filter({ hasText: /nytt mål|skapa mål/i }).first();
    await form.locator("input").first().fill(name);
    const target = form
      .locator("label")
      .filter({ hasText: /målbelopp|target|belopp/i })
      .locator("input");
    if (await target.count()) {
      await target.first().fill("10000");
    } else {
      await form.locator('input[inputmode="decimal"]').first().fill("10000");
    }
    await page.getByRole("button", { name: /skapa mål/i }).click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });
  });

  test("Flow 5 — settings category create persists", async ({ page }) => {
    const name = `U1 Kat ${Date.now()}`;
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: /inställningar/i }),
    ).toBeVisible();

    const section = page.locator("section, div").filter({
      has: page.getByRole("heading", { name: /^kategorier$/i }),
    });
    await expect(section.getByRole("heading", { name: /^kategorier$/i })).toBeVisible();
    await section.getByPlaceholder(/ny kategori/i).fill(name);
    await section.getByRole("button", { name: /lägg till|skapa/i }).click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });
  });

  test("settings members invite control present", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: /medlemmar/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /bjud in/i })).toBeVisible();
  });

  test("transactions new event entry present", async ({ page }) => {
    await page.goto("/transactions");
    await expect(
      page.getByRole("heading", { name: /transaktioner/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /ny händelse|ny utgift|lägg till/i }),
    ).toBeVisible();
  });

  test("mobile accounts form usable at 375", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile project only");
    await page.goto("/accounts");
    await expect(page.getByRole("heading", { name: /konton/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /skapa konto/i })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2,
    );
    expect(overflow).toBeFalsy();
  });
});
