import { test } from "@playwright/test";

/** Is the empty-submit feedback the browser's, or the product's? */
const CASES = [
  { route: "/accounts", button: /^skapa konto$/i },
  { route: "/settings", button: /^bjud in$/i },
  { route: "/goals", button: /^skapa mål$/i },
];

for (const { route, button } of CASES) {
  test(`empty submit on ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: button }).first().click();
    await page.waitForTimeout(1000);

    const state = await page.evaluate(() => {
      const invalid = Array.from(document.querySelectorAll("input:invalid, select:invalid"));
      return {
        invalidControls: invalid.length,
        // The browser's own wording, which is in the browser's language.
        nativeMessages: invalid
          .map((el) => (el as HTMLInputElement).validationMessage)
          .filter(Boolean)
          .slice(0, 3),
        productMessages: Array.from(document.querySelectorAll('[role="alert"], .text-negative'))
          .map((el) => (el as HTMLElement).innerText.trim())
          .filter(Boolean)
          .slice(0, 3),
      };
    });
    console.log(`\n  ${route}: ${JSON.stringify(state)}`);
  });
}
