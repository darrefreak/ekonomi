import { test, expect } from "@playwright/test";

/**
 * Regression cover for the session behaviour the UX audit found.
 *
 * A session that could no longer be refreshed used to leave the authenticated
 * shell on screen — sidebar, page title, empty cards — while every query behind
 * it answered 401. It read as a product that had silently stopped working. The
 * fix returns the person to sign-in and brings them back afterwards.
 */

const REVOKED_ACCESS =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZXZva2VkIiwiZXhwIjo5OTk5OTk5OTk5fQ.not-a-real-signature";

async function revokeStoredSession(page: import("@playwright/test").Page) {
  await page.evaluate((token) => {
    localStorage.setItem("ffos.accessToken", token);
    localStorage.setItem("ffos.refreshToken", "revoked-refresh-token");
  }, REVOKED_ACCESS);
}

test.describe("session", () => {
  for (const route of ["/", "/accounts", "/transactions", "/settings"]) {
    test(`UX-S01 a revoked session on ${route} asks for sign-in instead of failing quietly`, async ({
      page,
    }) => {
      await page.goto(route);
      await page.waitForTimeout(1000);
      await revokeStoredSession(page);

      await page.goto(route);
      await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });

      // And nothing technical is shown on the way there.
      const body = await page.locator("body").innerText();
      expect(body).not.toMatch(/401|unauthorized|invalid token|jwt/i);
    });
  }

  test("UX-S02 signing in returns to the page that was being read", async ({ page }) => {
    await page.goto("/accounts");
    await page.waitForTimeout(1000);
    await revokeStoredSession(page);

    await page.goto("/accounts");
    await expect(page).toHaveURL(/\/login\?next=%2Faccounts/, { timeout: 20_000 });

    await page.locator('input[name="email"]').fill("demo@ffos.local");
    await page.locator('input[name="password"]').fill("demo-password-123");
    await page.getByRole("button", { name: /^logga in$/i }).click();

    await expect(page).toHaveURL(/\/accounts/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /konton/i }).first()).toBeVisible();
  });

  test("UX-S03 a crafted return path cannot send someone off-site after signing in", async ({
    page,
  }) => {
    await page.goto("/login?next=https%3A%2F%2Fexample.com%2Fsteal");
    await page.evaluate(() => localStorage.clear());
    await page.goto("/login?next=https%3A%2F%2Fexample.com%2Fsteal");

    await page.locator('input[name="email"]').fill("demo@ffos.local");
    await page.locator('input[name="password"]').fill("demo-password-123");
    await page.getByRole("button", { name: /^logga in$/i }).click();

    await page.waitForTimeout(3000);
    expect(new URL(page.url()).host, "must stay on the product's own host").toBe(
      new URL(page.url()).host,
    );
    await expect(page).not.toHaveURL(/example\.com/);
  });
});
