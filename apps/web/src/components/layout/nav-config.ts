export type NavItem = {
  href: string;
  label: string;
  section?: string;
};

export const desktopNav: NavItem[] = [
  { href: "/", label: "Översikt", section: "Start" },
  { href: "/atgarder", label: "Att göra", section: "Start" },
  { href: "/review", label: "Granska", section: "Start" },
  { href: "/transactions", label: "Transaktioner", section: "Pengar" },
  { href: "/accounts", label: "Konton", section: "Pengar" },
  { href: "/subscriptions", label: "Återkommande", section: "Pengar" },
  { href: "/cashflow", label: "Kassaflöde", section: "Pengar" },
  { href: "/contracts", label: "Avtal", section: "Pengar" },
  { href: "/budget", label: "Smart budget", section: "Planera" },
  { href: "/calendar", label: "Kalender", section: "Planera" },
  { href: "/forecast", label: "Prognos", section: "Planera" },
  { href: "/goals", label: "Mål", section: "Planera" },
  { href: "/scenarios", label: "Scenarier", section: "Planera" },
  { href: "/insights", label: "Insikter", section: "Insikter" },
  { href: "/what-changed", label: "Vad har förändrats?", section: "Insikter" },
  { href: "/weekly", label: "Veckan", section: "Insikter" },
  { href: "/opportunities", label: "Möjligheter", section: "Insikter" },
  { href: "/reports", label: "Rapporter", section: "Insikter" },
  { href: "/liquidity", label: "Likviditet", section: "Insikter" },
  { href: "/savings", label: "Sparande", section: "Insikter" },
  { href: "/risk", label: "Risk", section: "Insikter" },
  { href: "/net-worth", label: "Nettoförmögenhet", section: "Förmögenhet" },
  { href: "/investments", label: "Investeringar", section: "Förmögenhet" },
  { href: "/assets", label: "Tillgångar", section: "Förmögenhet" },
  { href: "/debt", label: "Skulder", section: "Förmögenhet" },
  { href: "/vehicles", label: "Fordon", section: "Förmögenhet" },
  { href: "/advisor", label: "Rådgivare", section: "AI" },
  { href: "/lagg-till", label: "Lägg till", section: "Data" },
  { href: "/documents", label: "Dokument", section: "Data" },
  { href: "/integrations", label: "Kopplingar", section: "Data" },
  { href: "/imports", label: "Importer", section: "Data" },
  { href: "/notifications", label: "Notiser", section: "Drift" },
  { href: "/onboarding", label: "Kom igång", section: "Drift" },
  { href: "/settings", label: "Inställningar", section: "Inställningar" },
];

export const mobileNav = [
  { href: "/", label: "Hem" },
  { href: "/money", label: "Pengar" },
  { href: "/plan", label: "Planera" },
  { href: "/insights", label: "Insikter" },
  { href: "/more", label: "Mer" },
] as const;

/** The same five outcome-oriented destinations anchor desktop and mobile. */
export const primaryNav: NavItem[] = mobileNav.map((item) => ({ ...item }));

/** The Money hub: everything about what has happened with the money. */
export const moneyHub: NavItem[] = [
  { href: "/transactions", label: "Transaktioner" },
  { href: "/accounts", label: "Konton" },
  { href: "/subscriptions", label: "Återkommande & abonnemang" },
  { href: "/cashflow", label: "Kassaflöde" },
  { href: "/contracts", label: "Avtal" },
];

/** The Plan hub: everything about what happens next. */
export const planHub: NavItem[] = [
  { href: "/budget", label: "Smart budget" },
  { href: "/calendar", label: "Finansiell kalender" },
  { href: "/forecast", label: "Prognos" },
  { href: "/goals", label: "Mål" },
  { href: "/scenarios", label: "Scenarier" },
];

/** The Insights hub: everything the intelligence has to say. */
export const insightsHub: NavItem[] = [
  { href: "/what-changed", label: "Vad har förändrats?" },
  { href: "/weekly", label: "Veckan" },
  { href: "/opportunities", label: "Möjligheter" },
  { href: "/reports", label: "Rapporter" },
  { href: "/liquidity", label: "Likviditet" },
  { href: "/savings", label: "Sparande" },
  { href: "/risk", label: "Risk & motståndskraft" },
];

const hubChildren = new Set(
  [...moneyHub, ...planHub, ...insightsHub].map((item) => item.href),
);
const primaryHrefs = new Set(primaryNav.map((item) => item.href));

/**
 * "Mer" is true overflow, not a second copy of the Money and Plan hubs.
 * Review remains discoverable here as well as from the action-first home view.
 */
export const moreNav: NavItem[] = desktopNav.filter(
  (item) => !primaryHrefs.has(item.href) && !hubChildren.has(item.href),
);

function routeMatches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Resolve a feature route back to the primary destination it belongs to. */
export function primaryHrefForPathname(pathname: string): string {
  if (
    pathname === "/" ||
    pathname === "/dashboard" ||
    routeMatches(pathname, "/review") ||
    routeMatches(pathname, "/atgarder")
  ) {
    return "/";
  }
  if (pathname === "/money" || moneyHub.some((item) => routeMatches(pathname, item.href))) {
    return "/money";
  }
  if (pathname === "/plan" || planHub.some((item) => routeMatches(pathname, item.href))) {
    return "/plan";
  }
  if (
    pathname === "/insights" ||
    insightsHub.some((item) => routeMatches(pathname, item.href))
  ) {
    return "/insights";
  }
  return "/more";
}

/** Context links shown below the five primary destinations on desktop. */
export function contextNavForPathname(pathname: string): NavItem[] {
  switch (primaryHrefForPathname(pathname)) {
    case "/":
      return desktopNav.filter(
        (item) => item.href === "/atgarder" || item.href === "/review",
      );
    case "/money":
      return moneyHub;
    case "/plan":
      return planHub;
    case "/insights":
      return insightsHub;
    default:
      return moreNav;
  }
}
