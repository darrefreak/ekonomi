export type NavItem = {
  href: string;
  label: string;
  section?: string;
};

export const desktopNav: NavItem[] = [
  { href: "/", label: "Översikt", section: "Start" },
  { href: "/transactions", label: "Transaktioner", section: "Pengar" },
  { href: "/accounts", label: "Konton", section: "Pengar" },
  { href: "/cashflow", label: "Kassaflöde", section: "Pengar" },
  { href: "/budget", label: "Budget", section: "Pengar" },
  { href: "/liquidity", label: "Likviditet", section: "Pengar" },
  { href: "/net-worth", label: "Nettoförmögenhet", section: "Förmögenhet" },
  { href: "/investments", label: "Investeringar", section: "Förmögenhet" },
  { href: "/assets", label: "Tillgångar", section: "Förmögenhet" },
  { href: "/debt", label: "Skulder", section: "Förmögenhet" },
  { href: "/vehicles", label: "Fordon", section: "Förmögenhet" },
  { href: "/forecast", label: "Prognos", section: "Planering" },
  { href: "/goals", label: "Mål", section: "Planering" },
  { href: "/scenarios", label: "Scenarier", section: "Planering" },
  { href: "/insights", label: "Insikter", section: "Optimera" },
  { href: "/opportunities", label: "Möjligheter", section: "Optimera" },
  { href: "/subscriptions", label: "Abonnemang", section: "Optimera" },
  { href: "/contracts", label: "Avtal", section: "Optimera" },
  { href: "/risk", label: "Risk", section: "Risk" },
  { href: "/documents", label: "Dokument", section: "Dokument" },
  { href: "/integrations", label: "Kopplingar", section: "Kopplingar" },
  { href: "/imports", label: "Importer", section: "Kopplingar" },
  { href: "/advisor", label: "Rådgivare", section: "AI" },
  { href: "/review", label: "Granska", section: "AI" },
  { href: "/reports", label: "Rapporter", section: "Drift" },
  { href: "/notifications", label: "Notiser", section: "Drift" },
  { href: "/onboarding", label: "Kom igång", section: "Drift" },
  { href: "/settings", label: "Inställningar", section: "Inställningar" },
];

export const mobileNav = [
  { href: "/", label: "Hem" },
  { href: "/transactions", label: "Pengar" },
  { href: "/forecast", label: "Plan" },
  { href: "/insights", label: "Insikter" },
  { href: "/more", label: "Mer" },
] as const;
