export type NavItem = {
  href: string;
  label: string;
  section?: string;
};

export const desktopNav: NavItem[] = [
  { href: "/", label: "Översikt", section: "Overview" },
  { href: "/transactions", label: "Transaktioner", section: "Money" },
  { href: "/accounts", label: "Konton", section: "Money" },
  { href: "/cashflow", label: "Kassaflöde", section: "Money" },
  { href: "/budget", label: "Budget", section: "Money" },
  { href: "/net-worth", label: "Nettoförmögenhet", section: "Wealth" },
  { href: "/investments", label: "Investeringar", section: "Wealth" },
  { href: "/assets", label: "Tillgångar", section: "Wealth" },
  { href: "/debt", label: "Skulder", section: "Wealth" },
  { href: "/vehicles", label: "Fordon", section: "Wealth" },
  { href: "/forecast", label: "Prognos", section: "Planning" },
  { href: "/goals", label: "Mål", section: "Planning" },
  { href: "/scenarios", label: "Scenarier", section: "Planning" },
  { href: "/insights", label: "Insikter", section: "Optimize" },
  { href: "/opportunities", label: "Möjligheter", section: "Optimize" },
  { href: "/subscriptions", label: "Abonnemang", section: "Optimize" },
  { href: "/contracts", label: "Avtal", section: "Optimize" },
  { href: "/risk", label: "Risk", section: "Risk" },
  { href: "/documents", label: "Dokument", section: "Documents" },
  { href: "/integrations", label: "Kopplingar", section: "Connections" },
  { href: "/imports", label: "Importer", section: "Connections" },
  { href: "/advisor", label: "Rådgivare", section: "AI" },
  { href: "/review", label: "Granska", section: "AI" },
  { href: "/reports", label: "Rapporter", section: "Ops" },
  { href: "/notifications", label: "Notiser", section: "Ops" },
  { href: "/onboarding", label: "Onboarding", section: "Ops" },
  { href: "/settings", label: "Inställningar", section: "Settings" },
];

export const mobileNav = [
  { href: "/", label: "Hem" },
  { href: "/transactions", label: "Pengar" },
  { href: "/forecast", label: "Plan" },
  { href: "/insights", label: "Insikter" },
  { href: "/more", label: "Mer" },
] as const;
