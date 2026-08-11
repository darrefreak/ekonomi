import { test, expect, type Page } from "@playwright/test";
import { gotoRoute } from "./helpers/route-identity";

/**
 * Financial Brief V2 and the AI states through the real product (§49–§50).
 *
 * External AI is OFF in every test environment, which is itself the state
 * under test: the brief must render from templates, the status line must say
 * calmly that AI is off and the deterministic analysis still works, and the
 * settings page must offer the opt-in with an honest Swedish explanation.
 * On mobile everything must hold at 390×844 without horizontal overflow.
 */

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

test.describe("Financial Brief V2 on the dashboard", () => {
  test("the brief card renders with headline, items and an honest AI status", async ({
    page,
  }) => {
    await gotoRoute(page, "/");

    const card = page.getByTestId("financial-brief-card");
    await expect(card).toBeVisible();

    // The headline is the deterministic severity summary — never empty.
    await expect(card.getByTestId("brief-headline")).toBeVisible({ timeout: 20_000 });
    const headline = (await card.getByTestId("brief-headline").textContent()) ?? "";
    expect(headline.trim().length).toBeGreaterThan(5);

    // §50: AI off is a normal state with a normal sentence, not an error.
    const status = card.getByTestId("brief-ai-status");
    await expect(status).toBeVisible();
    await expect(status).toContainText("Extern AI-analys är avstängd");
    await expect(status).toContainText("fungerar fortfarande");

    // 3–5 items when findings exist; every item explains itself (§41).
    const items = card.getByTestId("brief-items").locator("li");
    const count = await items.count().catch(() => 0);
    expect(count).toBeLessThanOrEqual(5);
    for (let i = 0; i < count; i += 1) {
      const item = items.nth(i);
      await expect(item.getByRole("link", { name: /varför ser jag detta/i })).toBeVisible();
    }

    await expectNoHorizontalOverflow(page);
  });

  test("a brief item's explain link leads to a real supporting page", async ({ page }) => {
    await gotoRoute(page, "/");
    const card = page.getByTestId("financial-brief-card");
    await expect(card).toBeVisible();
    // Wait for the query to resolve before counting links, or the count races
    // the loading state and reads zero.
    await expect(card.getByTestId("brief-headline")).toBeVisible({ timeout: 20_000 });

    const links = card.getByRole("link", { name: /varför ser jag detta/i });
    const count = await links.count();
    test.skip(count === 0, "the demo household produced no brief items today");

    await links.first().click();
    await page.waitForLoadState("domcontentloaded");
    // Wherever the finding points, it must not be a dead end.
    await expect(page.locator("body")).not.toContainText(/could not be found/i);
    expect(page.url()).not.toContain("/404");
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("AI settings and status UX", () => {
  test("settings offers the AI opt-in with the honest Swedish explanation", async ({
    page,
  }) => {
    await gotoRoute(page, "/settings");

    const section = page.getByTestId("ai-analysis-section");
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();

    // The §21 explanation: minimized text, never the full bank history.
    await expect(section).toContainText("Extern AI-analys av transaktioner");
    await expect(section).toContainText("minimerad transaktionstext");

    // Default OFF, with the §50 reassurance visible.
    await expect(section.getByTestId("ai-analysis-state")).toContainText("Avstängd");
    await expect(section.getByTestId("ai-analysis-off-note")).toContainText(
      "Systemets automatiska analys fungerar fortfarande",
    );

    await expectNoHorizontalOverflow(page);
  });

  test("the household can switch AI analysis on and off again", async ({ page }) => {
    await gotoRoute(page, "/settings");

    const section = page.getByTestId("ai-analysis-section");
    await section.scrollIntoViewIfNeeded();
    const toggle = section.getByTestId("ai-analysis-toggle");
    const state = section.getByTestId("ai-analysis-state");

    await expect(state).toContainText("Avstängd");
    await toggle.click();
    await expect(state).toContainText("Aktiverad för hushållet", { timeout: 15_000 });
    await expect(section.getByTestId("ai-analysis-off-note")).toHaveCount(0);

    // Restore: the demo household must leave the test as it entered it.
    await toggle.click();
    await expect(state).toContainText("Avstängd", { timeout: 15_000 });
    await expect(section.getByTestId("ai-analysis-off-note")).toBeVisible();
  });
});
