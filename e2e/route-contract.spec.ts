import { test, expect, type Page } from "@playwright/test";
import {
  expectNotFoundPage,
  expectRouteRendered,
  ROUTE_IDENTITY,
} from "./helpers/route-identity";

/**
 * The navigation contract: every href the product offers must lead somewhere.
 *
 * RT2-004 was possible because a spec navigated to `/money`, a route that has
 * never existed, and still passed. The defence is to enumerate the links the
 * application itself renders — sidebar, bottom navigation, More menu, dashboard
 * quick actions — and prove each destination renders its own page. A primary
 * navigation href that lands on not-found is a HIGH defect, so it fails here.
 *
 * The hrefs are read out of the live DOM rather than imported from the source,
 * so a link that exists only in a config file, or only after a render branch,
 * is judged as the user meets it.
 */

async function internalHrefs(page: Page, scope: ReturnType<Page["locator"]>) {
  const hrefs = await scope.getByRole("link").evaluateAll((nodes) =>
    nodes
      .map((node) => node.getAttribute("href") ?? "")
      .filter((href) => href.startsWith("/") && !href.startsWith("//")),
  );
  // Strip the query string: identity belongs to the route, not its parameters.
  return [...new Set(hrefs.map((href) => href.split("?")[0]!))];
}

test.describe("navigation route contract", () => {
  test("desktop sidebar hrefs all resolve to their own page", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop project only");

    await page.goto("/");
    const sidebar = page.getByRole("navigation", { name: /huvudnavigation/i });
    await expect(sidebar).toBeVisible();
    const hrefs = await internalHrefs(page, sidebar);
    expect(hrefs.length, "the sidebar should expose the product's sections").toBeGreaterThan(
      15,
    );

    for (const href of hrefs) {
      await page.goto(href);
      // Route identity only: walking two dozen pages in one minute can trip the
      // API's rate limit, which leaves a real page without its data. Whether
      // each page renders its content is asserted by the specs that visit one
      // surface at a time.
      await expectRouteRendered(page, href, { content: false });
    }
  });

  test("mobile bottom navigation and More menu hrefs all resolve", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile project only");

    await page.goto("/");
    const bottomNav = page.getByRole("navigation", { name: /mobilnavigation/i });
    await expect(bottomNav).toBeVisible();
    const bottom = await internalHrefs(page, bottomNav);
    expect(bottom.length, "the bottom navigation should expose the primary tabs")
      .toBeGreaterThanOrEqual(4);

    await page.goto("/more");
    const moreNav = page.getByRole("navigation", { name: /fler sidor/i });
    await expect(moreNav).toBeVisible();
    const more = await internalHrefs(page, moreNav);
    expect(more.length, "the More menu should expose the overflow sections").toBeGreaterThan(
      15,
    );

    for (const href of [...new Set([...bottom, ...more])]) {
      await page.goto(href);
      await expectRouteRendered(page, href, { content: false });
    }
  });

  test("dashboard quick actions all resolve", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop project only");

    await page.goto("/");
    await expectRouteRendered(page, "/");
    const hrefs = await internalHrefs(page, page.locator("#main-content"));
    expect(hrefs.length, "the dashboard should link onward").toBeGreaterThan(3);

    for (const href of hrefs) {
      // Dashboard cards link to entity pages as well as sections; those have no
      // static identity, so the contract for them is only that they exist.
      await page.goto(href);
      if (ROUTE_IDENTITY[href]) {
        await expectRouteRendered(page, href, { content: false });
      } else {
        await expectNotFoundPage(page, false);
      }
    }
  });

  test("a route that does not exist is detected as not-found", async ({
    page,
  }) => {
    // The guard's own calibration: if this passed against a real page, every
    // other assertion in this file would be worthless.
    const response = await page.goto("/definitely-does-not-exist");
    expect(response?.status()).toBe(404);
    await expectNotFoundPage(page, true);

    // And the historical false positive: /money never existed.
    const money = await page.goto("/money");
    expect(money?.status()).toBe(404);
    await expectNotFoundPage(page, true);
  });
});
