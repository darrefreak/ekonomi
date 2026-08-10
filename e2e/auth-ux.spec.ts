import { test, expect } from "@playwright/test";

/**
 * Regression cover for the sign-in problems the UX audit found.
 *
 * Each test corresponds to a specific defect: the form arrived with the shared
 * demo account already typed in, a wrong password produced the API's English
 * "Invalid credentials" inside a Swedish product, there was no way to see what
 * you had typed, and every field rendered at 14px which makes iOS Safari zoom
 * and never zoom back.
 *
 * These run unauthenticated, so they clear the stored session first.
 */
test.describe("sign-in", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto("/login");
  });

  test("UX-A01 the form does not arrive with someone else's credentials", async ({ page }) => {
    const email = page.locator('input[name="email"]');
    const password = page.locator('input[name="password"]');

    await expect(email, "the email field must start empty").toHaveValue("");
    await expect(password, "a pre-filled password stops a password manager working").toHaveValue("");

    // Clicking sign in with nothing typed must not sign anybody in.
    await page.getByRole("button", { name: /^logga in$/i }).click();
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/login/);
  });

  test("UX-A02 a wrong password is explained in Swedish, not in backend English", async ({ page }) => {
    await page.locator('input[name="email"]').fill("demo@ffos.local");
    await page.locator('input[name="password"]').fill("this-is-not-the-password");
    await page.getByRole("button", { name: /^logga in$/i }).click();

    const alert = page.locator('form [role="alert"]');
    await expect(alert).toBeVisible({ timeout: 15_000 });
    await expect(alert).toContainText(/fel e-post eller lösenord/i);
    await expect(alert, "the API's own wording must not reach the participant").not.toContainText(
      /invalid credentials/i,
    );

    // The email survives so a retry is one field, and the password is cleared.
    await expect(page.locator('input[name="email"]')).toHaveValue("demo@ffos.local");
    await expect(page.locator('input[name="password"]')).toHaveValue("");
  });

  test("UX-A03 the password can be revealed and hidden again", async ({ page }) => {
    const password = page.locator('input[name="password"]');
    await password.fill("hemligt");
    await expect(password).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: /^visa$/i }).click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(password, "revealing must not discard what was typed").toHaveValue("hemligt");

    await page.getByRole("button", { name: /^dölj$/i }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("UX-A04 form controls are at least 16px so iOS Safari does not zoom", async ({ page }) => {
    for (const name of ["email", "password"]) {
      const size = await page
        .locator(`input[name="${name}"]`)
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(size, `${name} renders at ${size}px`).toBeGreaterThanOrEqual(16);
    }
  });

  test("UX-A05 Enter submits the form", async ({ page }) => {
    await page.locator('input[name="email"]').fill("demo@ffos.local");
    const password = page.locator('input[name="password"]');
    await password.fill("wrong-on-purpose");
    await password.press("Enter");
    await expect(page.locator('form [role="alert"]')).toBeVisible({ timeout: 15_000 });
  });

  test("UX-A06 signing in with the right password reaches the product", async ({ page }) => {
    await page.locator('input[name="email"]').fill("demo@ffos.local");
    await page.locator('input[name="password"]').fill("demo-password-123");
    await page.getByRole("button", { name: /^logga in$/i }).click();

    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
    await expect(page.getByText(/finansiell position/i).first()).toBeVisible({ timeout: 20_000 });

    // And the session survives a reload rather than bouncing back to sign-in.
    await page.reload();
    await expect(page.getByText(/finansiell position/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page).not.toHaveURL(/\/login/);
  });
});
