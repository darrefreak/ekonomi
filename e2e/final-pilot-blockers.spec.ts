import { test, expect } from "@playwright/test";

/**
 * Browser cover for the two surfaces the final pilot remediation changed.
 *
 * Both are about not offering something the product cannot honour: a currency
 * the totals cannot include (FPA-001), and a destructive action without a
 * deliberate confirmation (FPA-004).
 */
test.describe("final pilot blockers", () => {
  test("accounts — currency is the household's, not a menu of unsupported ones", async ({
    page,
  }) => {
    await page.goto("/accounts");
    await expect(page.getByRole("heading", { name: /konton/i }).first()).toBeVisible({
      timeout: 20_000,
    });

    const currency = page.getByTestId("account-currency");
    await expect(currency).toBeVisible({ timeout: 15_000 });
    await expect(currency).toHaveText("SEK");

    // The old select offered EUR and USD, which the engine cannot aggregate.
    await expect(page.locator("select").filter({ hasText: "EUR" })).toHaveCount(0);
    await expect(page.getByText(/fler valutor kommer senare/i)).toBeVisible();
  });

  test("settings — erasing the household needs its name typed first", async ({
    page,
  }) => {
    await page.goto("/settings");
    const section = page.getByTestId("household-erasure");
    await expect(section).toBeVisible({ timeout: 20_000 });

    await section.getByRole("button", { name: /radera hushållet…/i }).click();

    const confirm = section.getByRole("button", { name: /radera permanent/i });
    await expect(confirm).toBeDisabled();

    await section.getByRole("textbox").fill("Fel namn");
    await expect(
      confirm,
      "a mismatched name must not arm the destructive action",
    ).toBeDisabled();

    // Backing out leaves the household alone, which is the whole point of the
    // two-step flow.
    await section.getByRole("button", { name: /avbryt/i }).click();
    await expect(confirm).toHaveCount(0);
    await expect(
      section.getByRole("button", { name: /radera hushållet…/i }),
    ).toBeVisible();
  });
});
