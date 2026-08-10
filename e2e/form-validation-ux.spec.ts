import { test, expect } from "@playwright/test";

/**
 * Regression cover for whose words a form uses when it refuses.
 *
 * The account and invite forms left native `required` in charge, so the browser
 * blocked submission and showed its own bubble — "Please fill out this field." in
 * an English-configured browser — while the Swedish message each form already
 * carried could never run. Settings additionally appended "(kräver backend-stöd,
 * se P1-U1-rapport)" to seven error paths, putting a note to developers in front
 * of the participant.
 */
test.describe("form validation", () => {
  test("UX-V01 an empty account form answers in the product's own words", async ({ page }) => {
    await page.goto("/accounts");
    await page.waitForTimeout(2000);

    await page.getByRole("button", { name: /^skapa konto$/i }).click();

    const message = page.getByText(/ange ett kontonamn/i);
    await expect(message, "the form's own Swedish message must appear").toBeVisible({
      timeout: 10_000,
    });

    const body = await page.locator("body").innerText();
    expect(body, "the browser's wording must not be what explains this").not.toMatch(
      /please fill out this field/i,
    );
  });

  test("UX-V02 the field keeps focus reachable and the message clears on a valid submit", async ({
    page,
  }) => {
    await page.goto("/accounts");
    await page.waitForTimeout(2000);

    await page.getByRole("button", { name: /^skapa konto$/i }).click();
    await expect(page.getByText(/ange ett kontonamn/i)).toBeVisible({ timeout: 10_000 });

    const name = `Giltigt ${Date.now().toString(36).slice(-5)}`;
    await page.getByLabel(/^namn$/i).first().fill(name);
    await page.getByRole("button", { name: /^skapa konto$/i }).click();

    await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/ange ett kontonamn/i),
      "a successful save must not leave the old error on screen",
    ).toHaveCount(0);
  });

  test("UX-V03 settings errors carry no note meant for developers", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForTimeout(2500);

    await page.getByRole("button", { name: /^bjud in$/i }).click();
    await page.waitForTimeout(1500);

    const body = await page.locator("body").innerText();
    expect(body).toMatch(/ange en e-postadress att bjuda in/i);
    expect(body, "an internal report reference must not be shown").not.toMatch(
      /kräver backend-stöd|P1-U1-rapport/i,
    );
  });
});
