import { expect, type Page } from "@playwright/test";

/**
 * Route identity for end-to-end assertions.
 *
 * RT2-004: a mobile spec asserted `getByRole("heading").first()` and passed on
 * a route that returns HTTP 404, because the not-found result still renders
 * inside the application shell and the shell has headings of its own. "A
 * heading exists" therefore proves nothing about which page loaded.
 *
 * Identity here has two layers, and both are checked:
 *
 *   title    Each route declares its own `metadata.title`, so the document
 *            title names the route that rendered. This does not depend on any
 *            request succeeding, which makes it a reliable answer to "which
 *            page is this?" even when the page's data is missing.
 *   content  The page's own level-1 heading, and for the critical surfaces a
 *            control only that page offers. This answers the second question,
 *            "did the page actually render its content?".
 *
 * The not-found result is excluded explicitly rather than inferred, because a
 * client-side navigation can land on it with no navigation response to inspect.
 */

export type RouteIdentity = {
  /** The route's own document title, before the shared suffix. */
  title: string;
  /** Exact level-1 heading the page renders once its data is present. */
  heading?: RegExp;
  /** A control or landmark only this route puts on screen. */
  control?: (page: Page) => ReturnType<Page["locator"]>;
};

export const ROUTE_IDENTITY: Record<string, RouteIdentity> = {
  // The dashboard heads with the household's own name, and only it links to
  // net worth from the position card.
  // The home now leads with the family summary, whose headline is dynamic; its
  // "what should we do next" section title is the stable proof this page loaded.
  "/": {
    title: "Översikt",
    control: (page) =>
      page.getByRole("heading", { name: /vad bör vi göra härnäst\?/i }),
  },
  "/liquidity": {
    title: "Likviditet",
    heading: /^Likviditet$/,
    // Only this page explains the buffer in terms of the household's own months.
    control: (page) => page.getByText(/räknat ur din egen historik/i).first(),
  },
  "/transactions": {
    title: "Transaktioner",
    heading: /^Transaktioner$/,
    control: (page) => page.getByPlaceholder(/sök/i).first(),
  },
  "/accounts": {
    title: "Konton",
    heading: /^Konton$/,
    control: (page) => page.getByRole("button", { name: /nytt konto/i }),
  },
  "/cashflow": { title: "Kassaflöde", heading: /^Kassaflöde$/ },
  "/budget": {
    title: "Smart budget",
    heading: /^Budget$/,
    // Only the budget page offers the smart/detailed mode switch.
    control: (page) => page.getByRole("button", { name: /^Smart budget$/ }),
  },
  "/money": {
    title: "Pengar",
    heading: /^Pengar$/,
    control: (page) => page.getByRole("navigation", { name: /^Pengar$/ }),
  },
  "/plan": {
    title: "Planera",
    heading: /^Planera$/,
    control: (page) => page.getByRole("navigation", { name: /^Planera$/ }),
  },
  "/calendar": {
    title: "Finansiell kalender",
    heading: /^Finansiell kalender$/,
    // Only the calendar offers the horizon toggle.
    control: (page) => page.getByRole("group", { name: /tidshorisont/i }),
  },
  "/what-changed": {
    title: "Vad har förändrats?",
    heading: /^Vad har förändrats\?$/,
    control: (page) => page.getByRole("group", { name: /^Jämförelse$/ }),
  },
  "/savings": { title: "Sparande", heading: /^Sparande$/ },
  "/weekly": { title: "Veckan", heading: /^Veckan$/ },
  "/net-worth": { title: "Nettoförmögenhet", heading: /^Nettoförmögenhet$/ },
  "/investments": { title: "Investeringar", heading: /^Investeringar$/ },
  "/assets": { title: "Tillgångar", heading: /^Tillgångar$/ },
  "/debt": { title: "Skulder", heading: /^Skulder$/ },
  "/vehicles": {
    title: "Fordon",
    heading: /^Fordon$/,
    control: (page) => page.getByRole("button", { name: /lägg till fordon/i }),
  },
  "/vehicles/market": { title: "Fordonsmarknad", heading: /^Marknad$/ },
  "/vehicles/candidates": { title: "Kandidater", heading: /^Kandidater$/ },
  "/vehicles/compare": { title: "Jämför fordon", heading: /^Jämför$/ },
  "/forecast": { title: "Prognos", heading: /^Prognos$/ },
  "/goals": { title: "Mål", heading: /^Mål$/ },
  "/scenarios": { title: "Scenarier", heading: /^Scenarier$/ },
  "/insights": { title: "Insikter", heading: /^Insikter$/ },
  "/opportunities": { title: "Möjligheter", heading: /^Möjligheter$/ },
  "/subscriptions": {
    title: "Abonnemang",
    heading: /^Abonnemang & återkommande$/,
    // Only the recurring surface shows the separated totals.
    control: (page) => page.getByTestId("recurring-totals"),
  },
  "/contracts": { title: "Avtal", heading: /^Avtal$/ },
  "/risk": { title: "Risk", heading: /^Risk & hälsa$/ },
  "/documents": { title: "Dokument", heading: /^Dokument \/ inbox$/ },
  "/integrations": { title: "Kopplingar", heading: /^Kopplingar$/ },
  "/imports": { title: "Importer", heading: /^Importer$/ },
  "/advisor": { title: "Rådgivare", heading: /^Rådgivare$/ },
  "/review": { title: "Granska", heading: /^Granska$/ },
  "/atgarder": { title: "Att göra", heading: /^Att göra$/ },
  "/lagg-till": {
    title: "Lägg till",
    heading: /^Lägg till i din ekonomi$/,
    control: (page) =>
      page.getByRole("navigation", { name: /lägg till i din ekonomi/i }),
  },
  "/reports": { title: "Rapporter", heading: /^Rapporter$/ },
  "/notifications": { title: "Notiser", heading: /^Notiser$/ },
  "/onboarding": { title: "Onboarding", heading: /^Kom igång$/ },
  "/settings": {
    title: "Inställningar",
    heading: /^Inställningar$/,
  },
  "/more": {
    title: "Mer",
    heading: /^Mer$/,
    control: (page) => page.getByRole("navigation", { name: /fler sidor/i }),
  },
  "/login": { title: "Logga in" },
};

const TITLE_SUFFIX = " · Family Financial OS";

/**
 * Whether the current page is a Next.js not-found result.
 *
 * Several signals, because any one of them can be absent: the built-in page is
 * recognised by its title and its English copy, and `data-testid="not-found"`
 * is honoured in advance so a custom not-found page stays detectable.
 */
export async function isNotFoundPage(page: Page): Promise<boolean> {
  if (/404/.test(await page.title())) return true;
  if (await page.locator('[data-testid="not-found"]').count()) return true;
  if (await page.getByText(/this page could not be found/i).count()) return true;
  if (await page.getByText(/sidan kunde inte hittas/i).count()) return true;
  return false;
}

/** Fail when the not-found state is not what this assertion expects. */
export async function expectNotFoundPage(page: Page, expected: boolean) {
  await expect
    .poll(() => isNotFoundPage(page), {
      message: expected
        ? `expected ${page.url()} to render the not-found page`
        : `${page.url()} rendered the not-found page`,
      timeout: 10_000,
    })
    .toBe(expected);
}

function identityFor(path: string): RouteIdentity {
  const identity = ROUTE_IDENTITY[path];
  if (!identity) {
    throw new Error(
      `No route identity is declared for "${path}". A surface reachable from the product without an identity here is a gap in the contract, not a pass.`,
    );
  }
  return identity;
}

/**
 * Assert that this route — not merely some route — is the one loaded.
 *
 * `content: false` checks route identity only, for walks long enough that the
 * API's rate limit can legitimately leave a page without its data. Identity
 * still holds in that case; the data assertions belong to the specs that
 * exercise one surface at a time.
 */
export async function expectRouteRendered(
  page: Page,
  path: string,
  options: { content?: boolean } = {},
) {
  const identity = identityFor(path);
  await expectNotFoundPage(page, false);
  await expect(page, `${path} should title itself "${identity.title}"`).toHaveTitle(
    `${identity.title}${TITLE_SUFFIX}`,
    { timeout: 20_000 },
  );

  if (options.content === false) return;

  if (identity.heading) {
    await expect(
      page.getByRole("heading", { level: 1, name: identity.heading }),
      `${path} should render its own heading ${identity.heading}`,
    ).toBeVisible({ timeout: 20_000 });
  }
  if (identity.control) {
    await expect(
      identity.control(page).first(),
      `${path} should render its route-specific control`,
    ).toBeVisible({ timeout: 20_000 });
  }
}

/** Navigate to `path` and prove that page rendered. */
export async function gotoRoute(
  page: Page,
  path: string,
  options: { content?: boolean } = {},
) {
  identityFor(path);
  await page.goto(path);
  await expectRouteRendered(page, path, options);
}
