import { test } from "@playwright/test";

/**
 * §5: what a person actually sees when the session is no longer valid.
 *
 * The failure mode to rule out is a page that stays authenticated-looking and
 * fills its cards with unauthorized errors, rather than sending the person to
 * sign in.
 */
for (const route of ["/", "/accounts", "/transactions", "/settings"]) {
  test(`a revoked token on ${route}`, async ({ page }) => {
    const statuses: number[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/api/v1/") && r.status() === 401) statuses.push(401);
    });

    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    // Replace the stored session with a structurally valid but revoked token.
    await page.evaluate(() => {
      localStorage.setItem(
        "ffos.accessToken",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZXZva2VkIiwiZXhwIjo5OTk5OTk5OTk5fQ.not-a-real-signature",
      );
      localStorage.setItem("ffos.refreshToken", "revoked-refresh-token");
    });

    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);

    const path = new URL(page.url()).pathname;
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const leaks = /401|unauthorized|invalid token|jwt|forbidden/i.test(body);
    const spinner = await page.locator('[role="progressbar"], .animate-spin, .animate-pulse').count();

    console.log(
      `  ${route.padEnd(14)} → path=${path.padEnd(10)} 401s=${statuses.length} ` +
        `technicalTextVisible=${leaks} loadingElements=${spinner} ` +
        `body="${body.slice(0, 110)}"`,
    );
  });
}
