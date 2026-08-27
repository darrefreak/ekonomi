import { test, expect } from "@playwright/test";
import { gotoRoute } from "./helpers/route-identity";

/**
 * The Decision Center: the one surface that answers "what should I do?".
 *
 * The demo household's exact actions vary with its data, so the contract is
 * about the surface — it renders, it either lists concrete actions or says
 * honestly that nothing is pressing, and every action is a link to its
 * evidence — not about a specific recommendation.
 */

test.describe("decision center", () => {
  test("lists concrete actions or an honest empty state, each drillable", async ({
    page,
  }) => {
    await gotoRoute(page, "/atgarder");

    const actions = page.getByTestId("decision-action");
    const empty = page.getByText(/inget brådskande just nu/i);
    await expect(actions.first().or(empty)).toBeVisible({ timeout: 20_000 });

    if ((await actions.count()) > 0) {
      // Every action is a link to where the evidence lives.
      await expect(actions.first()).toHaveAttribute("href", /\//);
    }
  });

  test("the add-everything on-ramp lists the ways to get data in", async ({
    page,
  }) => {
    await gotoRoute(page, "/lagg-till");
    const nav = page.getByRole("navigation", { name: /lägg till i din ekonomi/i });
    await expect(nav.getByRole("link", { name: /konton, lån & tillgångar/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /bilar & fordon/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /importera transaktioner/i })).toBeVisible();
  });

  test("the home view surfaces the top actions when there are any", async ({
    page,
  }) => {
    await gotoRoute(page, "/");
    const next = page.getByTestId("next-actions");
    test.skip((await next.count()) === 0, "no pressing actions in the demo household today");
    await expect(next.getByRole("link", { name: /alla \(\d+\)/i })).toBeVisible();
  });
});
