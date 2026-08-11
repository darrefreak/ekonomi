export type NavItem = {
  href: string;
  label: string;
  section?: string;
};

export const desktopNav: NavItem[] = [
  { href: "/", label: "Översikt", section: "Start" },
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
  { href: "/opportunities", label: "Möjligheter" },
  { href: "/reports", label: "Rapporter" },
  { href: "/liquidity", label: "Likviditet" },
  { href: "/savings", label: "Sparande" },
  { href: "/risk", label: "Risk & motståndskraft" },
];
