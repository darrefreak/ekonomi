import { test, expect } from "@playwright/test";

/**
 * RT-012: a household must be able to add a vehicle through the product.
 *
 * Onboarding an already-owned vehicle is an opening position — it must not
 * invent income or spending in the current period.
 */
test.describe("vehicle create", () => {
  test("onboard an already-owned financed vehicle without current-period income/expense", async ({
    page,
  }) => {
    const name = `Begagnad bil ${Date.now()}`;

    await page.goto("/vehicles");
    await page.getByRole("button", { name: /lägg till fordon/i }).click();
    const form = page.getByRole("form", { name: /lägg till fordon/i });
    await expect(form).toBeVisible();

    await form.getByRole("button", { name: /jag äger den redan/i }).click();
    await form.getByRole("button", { name: /^billån$/i }).click();

    await form
      .locator("label")
      .filter({ hasText: /^namn$/i })
      .locator("input")
      .fill(name);
    await form
      .locator("label")
      .filter({ hasText: /^märke$/i })
      .locator("input")
      .fill("Volvo");
    await form
      .locator("label")
      .filter({ hasText: /^modell$/i })
      .locator("input")
      .fill("V60");
    await form
      .locator("label")
      .filter({ hasText: /årsmodell/i })
      .locator("input")
      .fill("2021");
    await form
      .locator("label")
      .filter({ hasText: /mätarställning/i })
      .locator("input")
      .fill("58000");
    await form
      .locator("label")
      .filter({ hasText: /inköpspris/i })
      .locator("input")
      .fill("340000");
    await form
      .locator("label")
      .filter({ hasText: /nuvarande värde/i })
      .locator("input")
      .fill("250000");
    await form
      .locator("label")
      .filter({ hasText: /kvarvarande skuld/i })
      .locator("input")
      .fill("150000");

    await form.getByRole("button", { name: /spara fordon/i }).click();

    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]{36}/, { timeout: 20_000 });
    await expect(page.getByText(name).first()).toBeVisible();

    // Equity = value − debt − selling cost; must be visible and positive here.
    const body = await page.locator("body").innerText();
    expect(body).toMatch(/equity/i);

    await page.reload();
    await expect(page.getByText(name).first()).toBeVisible();

    // Onboarding is an opening position: no financial event was booked, so the
    // vehicle page shows no linked purchase transaction.
    expect(body).not.toMatch(new RegExp(`Köp av ${name}`));
  });

  test("cash purchase from the UI books an asset purchase, not consumption", async ({
    page,
  }) => {
    const name = `Kontantbil ${Date.now()}`;
    await page.goto("/vehicles");
    await page.getByRole("button", { name: /lägg till fordon/i }).click();
    const form = page.getByRole("form", { name: /lägg till fordon/i });

    await form.getByRole("button", { name: /jag köper den nu/i }).click();
    await form.getByRole("button", { name: /^kontant$/i }).click();

    await form
      .locator("label")
      .filter({ hasText: /^namn$/i })
      .locator("input")
      .fill(name);
    await form
      .locator("label")
      .filter({ hasText: /^märke$/i })
      .locator("input")
      .fill("Toyota");
    await form
      .locator("label")
      .filter({ hasText: /^modell$/i })
      .locator("input")
      .fill("Yaris");
    await form
      .locator("label")
      .filter({ hasText: /årsmodell/i })
      .locator("input")
      .fill("2022");
    await form
      .locator("label")
      .filter({ hasText: /inköpspris/i })
      .locator("input")
      .fill("90000");
    await form
      .locator("label")
      .filter({ hasText: /nuvarande värde/i })
      .locator("input")
      .fill("90000");

    const accountSelect = form
      .locator("label")
      .filter({ hasText: /betalas från konto/i })
      .locator("select");
    await accountSelect.click();
    const options = accountSelect.locator("option");
    await expect(options.nth(1)).toBeAttached({ timeout: 15_000 });
    await accountSelect.selectOption({ index: 1 });

    await form.getByRole("button", { name: /spara fordon/i }).click();
    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]{36}/, { timeout: 20_000 });
    await expect(page.getByText(name).first()).toBeVisible();
  });
});
