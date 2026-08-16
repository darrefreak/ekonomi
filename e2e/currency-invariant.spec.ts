import { test, expect } from "@playwright/test";

/**
 * The screen where the impossible household used to be created.
 *
 * Onboarding offered SEK, EUR and NOK for a household's currency while every
 * account was refused in anything but SEK, so a participant could build a
 * household that could never hold an account (FPR-001). The choice is gone;
 * this checks it stays gone, in the browser rather than in the source.
 */
test.describe("household currency", () => {
  test("onboarding states the currency instead of offering unsupported ones", async ({
    page,
  }) => {
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: /kom igång/i })).toBeVisible({
      timeout: 20_000,
    });

    const currency = page.getByTestId("household-currency");
    await expect(currency).toBeVisible();
    await expect(currency).toContainText("SEK");

    await page.getByRole("button", { name: /fortsätt/i }).first().click();
    await expect(
      page.getByRole("heading", { name: /vad vill ni börja med/i }),
    ).toBeVisible();

    // The old step 2 was a select carrying EUR and NOK.
    await expect(page.locator("select")).toHaveCount(0);
    for (const unsupported of ["EUR", "NOK", "USD", "DKK"]) {
      await expect(
        page.getByRole("option", { name: unsupported }),
        `${unsupported} must not be offered as a household currency`,
      ).toHaveCount(0);
    }
  });
});
