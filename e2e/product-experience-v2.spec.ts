import { test, expect, type Page } from "@playwright/test";
import { gotoRoute } from "./helpers/route-identity";

/**
 * Product Experience V2: the new surfaces walked as a user would.
 *
 * The demo household's exact numbers vary, so the assertions are about the
 * contract of each surface — the page renders its own controls, explains its
 * numbers, and every insight keeps a drill path — never about specific
 * amounts.
 */

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

test.describe("hubs and navigation", () => {
  test("Money, Plan and Insights expose their user jobs", async ({ page }) => {
    await gotoRoute(page, "/money");
    const moneyLinks = page
      .getByRole("navigation", { name: /^Pengar$/ })
      .getByRole("link");
    expect(await moneyLinks.count()).toBeGreaterThanOrEqual(4);

    await gotoRoute(page, "/plan");
    const planNav = page.getByRole("navigation", { name: /^Planera$/ });
    await expect(planNav.getByRole("link", { name: /smart budget/i })).toBeVisible();
    await expect(planNav.getByRole("link", { name: /finansiell kalender/i })).toBeVisible();

    await gotoRoute(page, "/insights");
    const insightsNav = page.getByRole("navigation", { name: /^Insikter$/ });
    await expect(
      insightsNav.getByRole("link", { name: /vad har förändrats/i }),
    ).toBeVisible();
    await expect(insightsNav.getByRole("link", { name: /rapporter/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("the command palette offers actions and navigates", async ({ page }) => {
    await gotoRoute(page, "/");
    await page.keyboard.press("ControlOrMeta+k");
    const dialog = page.getByRole("dialog", { name: /global sök/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /öppna kalendern/i }).click();
    await expect(page).toHaveURL(/\/calendar/);
  });
});

test.describe("financial calendar", () => {
  test("renders horizon toggle, summary and its own method", async ({ page }) => {
    await gotoRoute(page, "/calendar");

    // The four-window summary is always present, even for an empty horizon.
    await expect(page.getByText(/^Saldo om 30 dagar$/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("group", { name: /tidshorisont/i }).getByRole("button", { name: /90 d/i }).click();
    await expect(page.getByText(/^Saldo om 90 dagar$/)).toBeVisible();

    // Explainability is part of the page, not a tooltip.
    await expect(page.getByRole("heading", { name: /så räknade vi/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("timeline events carry confidence labels", async ({ page }) => {
    await gotoRoute(page, "/calendar");
    const timeline = page.getByTestId("calendar-timeline");
    const hasTimeline = (await timeline.count()) > 0;
    test.skip(!hasTimeline, "the demo household has no upcoming events today");

    // Every event is honestly labeled Känd/Förväntad/Uppskattad.
    const badges = timeline.locator("span").filter({ hasText: /^(Känd|Förväntad|Uppskattad)$/ });
    expect(await badges.count()).toBeGreaterThan(0);
    // Each day states the projected balance after the day.
    await expect(timeline.getByText(/saldo efter dagen/i).first()).toBeVisible();
  });
});

test.describe("what changed", () => {
  test("compares against the baseline and can switch mode", async ({ page }) => {
    await gotoRoute(page, "/what-changed");

    await expect(
      page.getByText(/utgifter, förändring per månad/i).or(page.getByText(/för lite data/i)).first(),
    ).toBeVisible({ timeout: 20_000 });

    await page
      .getByRole("group", { name: /^Jämförelse$/ })
      .getByRole("button", { name: /mot förra månaden/i })
      .click();
    await expect(
      page.getByText(/utgifter, förändring per månad/i).or(page.getByText(/för lite data/i)).first(),
    ).toBeVisible({ timeout: 20_000 });
    await expectNoHorizontalOverflow(page);
  });

  test("one-offs are declared as included in the totals", async ({ page }) => {
    await gotoRoute(page, "/what-changed");
    const hasData = (await page.getByText(/engångsköp/i).count()) > 0;
    test.skip(!hasData, "comparison had too little data today");
    await expect(page.getByText(/ingår.*i summorna/i).first()).toBeVisible();
  });

  test("a category driver keeps context and reaches its transactions", async ({
    page,
  }) => {
    await gotoRoute(page, "/what-changed");
    const categorySection = page.locator("section").filter({
      has: page.getByRole("heading", {
        name: /största förändringarna per kategori/i,
      }),
    });
    const driver = categorySection.getByRole("link").first();
    test.skip((await driver.count()) === 0, "comparison had no category driver");

    await driver.click();
    await expect(page).toHaveURL(/\/reports\?/);
    await expect(page.getByText(/du granskar/i)).toBeVisible();

    const row = page.getByTestId("report-drill-row").first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.click();
    await expect(page).toHaveURL(/\/transactions\?/);
    await expect(page.getByTestId("drill-filters")).toBeVisible();
  });
});

test.describe("smart budget", () => {
  test("smart mode is the default, with flex number and explanations", async ({ page }) => {
    await gotoRoute(page, "/budget");

    const smartToggle = page.getByRole("button", { name: /^Smart budget$/ });
    await expect(smartToggle).toHaveAttribute("aria-pressed", "true");

    const insufficient = page.getByText(/för lite historik/i);
    const flex = page.getByText(/kvar att använda/i).first();
    await expect(flex.or(insufficient).first()).toBeVisible({ timeout: 25_000 });

    if ((await insufficient.count()) === 0) {
      // Every group explains its own amount deterministically.
      const why = page.getByText(/varför detta belopp\?/i);
      expect(await why.count()).toBeGreaterThanOrEqual(3);
      await why.first().click();
      await expect(page.getByText(/median \(upp till 24 mån\)/i).first()).toBeVisible();
      // The flex number is explicitly not the account balance.
      await expect(page.getByText(/inte ditt kontosaldo/i)).toBeVisible();
    }
  });

  test("the detailed budget remains one toggle away", async ({ page }) => {
    await gotoRoute(page, "/budget");
    await page.getByRole("button", { name: /^Detaljerad$/ }).click();
    // The category-level budget renders its own totals or its empty state.
    await expect(
      page.getByText(/^Planerat$/).first().or(page.getByTestId("budget-empty-state")),
    ).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("savings", () => {
  test("shows the waterfall in priority order, or an honest empty state", async ({
    page,
  }) => {
    await gotoRoute(page, "/savings");
    const waterfall = page.getByTestId("savings-waterfall");
    const negative = page.getByText(/utgifterna är större än inkomsterna/i);
    await expect(waterfall.or(negative).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /så räknade vi/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("reports V2", () => {
  test("explorer renders, switches dimension, and rows drill down", async ({ page }) => {
    await gotoRoute(page, "/reports");

    const explore = page.getByTestId("report-explore");
    const empty = page.getByText(/inget att rapportera/i);
    await expect(explore.or(empty).first()).toBeVisible({ timeout: 25_000 });
    test.skip((await explore.count()) === 0, "no report data in the window today");

    await page.getByRole("group", { name: /^Dimension$/ }).getByRole("button", { name: /^Mottagare$/ }).click();
    await expect(explore.or(empty).first()).toBeVisible({ timeout: 25_000 });

    const drillRow = page.getByTestId("report-drill-row").first();
    test.skip((await drillRow.count()) === 0, "no drillable rows for this dimension today");
    await drillRow.click();
    // Merchant rows land on the filtered transaction list.
    await expect(page).toHaveURL(/\/(transactions|reports)\?/);
  });
});

test.describe("weekly review", () => {
  test("summarises the week and points to what comes next", async ({ page }) => {
    await gotoRoute(page, "/weekly");
    const main = page.getByRole("main");
    await expect(main.getByText(/^Utgifter$/).first()).toBeVisible({ timeout: 20_000 });
    await expect(main.getByRole("heading", { name: /nästa vecka/i })).toBeVisible();
    await expect(main.getByRole("link", { name: /kalender/i }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("dashboard V2", () => {
  test("answers what changed and what happens next, with drill paths", async ({
    page,
  }) => {
    await gotoRoute(page, "/");

    // Position first, then the month, then change, then the future.
    const main = page.getByRole("main");
    await expect(main.getByText(/^Nettoförmögenhet$/).first()).toBeVisible({ timeout: 20_000 });
    const vsNormal = page.getByTestId("spending-vs-normal");
    await expect(vsNormal).toBeVisible();
    await expect(vsNormal.getByRole("link", { name: /vad har förändrats/i })).toBeVisible();
    await expect(main.getByRole("link", { name: /kalender/i }).first()).toBeVisible();
  });
});

test.describe("review V2", () => {
  test("shows the countdown when patterns are open", async ({ page }) => {
    await gotoRoute(page, "/review");
    const progress = page.getByTestId("review-progress");
    test.skip((await progress.count()) === 0, "nothing to review in the demo household today");
    await expect(progress).toContainText(/kvar/i);
  });

  test("decision surfaces hide internal enums and tool names", async ({ page }) => {
    await gotoRoute(page, "/review");
    await expect(page.locator("body")).not.toContainText(/UNKNOWN TRANSACTION/i);
    await expect(page.locator("body")).not.toContainText(/POSSIBLE INTERNAL TRANSFER/i);

    await gotoRoute(page, "/advisor");
    await expect(page.locator("body")).not.toContainText(/Källverktyg:/i);
    await expect(page.locator("body")).not.toContainText(/Tool trace/i);
    await expect(page.locator("body")).not.toContainText(/Recommendation outcomes/i);
  });
});

test.describe("contextual advisor", () => {
  test("the panel opens with page-aware suggestions when AI is on", async ({ page }) => {
    await gotoRoute(page, "/liquidity");
    const trigger = page.getByTestId("advisor-panel-trigger");
    test.skip((await trigger.count()) === 0, "AI feature flag is off in this environment");

    await trigger.click();
    const panel = page.getByTestId("advisor-panel");
    await expect(panel).toBeVisible();
    // Liquidity-specific suggestion, not a generic one.
    await expect(panel.getByRole("button", { name: /buffert/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible();
  });
});
