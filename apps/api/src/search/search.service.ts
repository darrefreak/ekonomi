import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  accounts,
  categories,
  merchants,
  sourceTransactions,
} from "../db/schema-economic";
import { documents } from "../db/schema-intake";
import { recurringItems } from "../db/schema-planning";
import { vehicles } from "../db/schema-vehicles";
import { HouseholdAccessService } from "../households/household-access.service";

type SearchHit = {
  type:
    | "transaction"
    | "account"
    | "merchant"
    | "category"
    | "subscription"
    | "document"
    | "vehicle"
    | "opportunity"
    | "page";
  id: string;
  title: string;
  subtitle?: string | null;
  href: string;
};

const STATIC_PAGES: Array<{ title: string; href: string; keywords: string[] }> = [
  { title: "Inställningar", href: "/settings", keywords: ["settings", "inställ"] },
  { title: "Integrationer", href: "/integrations", keywords: ["koppling", "integr"] },
  { title: "Dokument", href: "/documents", keywords: ["dokument", "inbox"] },
  { title: "Möjligheter", href: "/opportunities", keywords: ["möjlig", "opportunity"] },
  { title: "Granska", href: "/review", keywords: ["gransk", "review"] },
  { title: "Rapporter", href: "/reports", keywords: ["rapport", "report"] },
  { title: "Onboarding", href: "/onboarding", keywords: ["onboard", "kom igång"] },
  { title: "Kalender", href: "/calendar", keywords: ["kalender", "calendar", "kommande"] },
  { title: "Smart budget", href: "/budget", keywords: ["budget", "smart"] },
  {
    title: "Vad har förändrats?",
    href: "/what-changed",
    keywords: ["förändr", "changed", "jämför"],
  },
  { title: "Likviditet", href: "/liquidity", keywords: ["likviditet", "buffert", "kassa"] },
  { title: "Sparande", href: "/savings", keywords: ["sparande", "spara", "överskott"] },
  { title: "Prognos", href: "/forecast", keywords: ["prognos", "forecast"] },
  { title: "Abonnemang", href: "/subscriptions", keywords: ["abonnemang", "återkommande", "prenumeration"] },
  { title: "Kassaflöde", href: "/cashflow", keywords: ["kassaflöde", "cashflow"] },
  { title: "Insikter", href: "/insights", keywords: ["insikt", "insight", "brief"] },
  { title: "Veckoöversikt", href: "/reports?tab=weekly", keywords: ["vecka", "weekly"] },
  { title: "Månadsrapport", href: "/reports?tab=monthly", keywords: ["månad", "monthly"] },
];

@Injectable()
export class SearchService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
  ) {}

  async search(userId: string, householdId: string, q: string) {
    const viewer = await this.access.requireMembership(userId, householdId);
    const query = q.trim();
    if (query.length < 2) {
      return { query, results: [] as SearchHit[] };
    }
    const pattern = `%${query}%`;
    const db = getDb();
    const results: SearchHit[] = [];

    const txRows = await db
      .select({
        id: sourceTransactions.id,
        description: sourceTransactions.description,
        bookingDate: sourceTransactions.bookingDate,
        isShared: accounts.isShared,
        ownerMemberId: accounts.ownerMemberId,
      })
      .from(sourceTransactions)
      .innerJoin(accounts, eq(sourceTransactions.accountId, accounts.id))
      .where(
        and(
          eq(sourceTransactions.householdId, householdId),
          or(
            ilike(sourceTransactions.description, pattern),
            sql`cast(${sourceTransactions.amountMinor} as text) like ${pattern}`,
          ),
        ),
      )
      .orderBy(desc(sourceTransactions.bookingDate))
      .limit(16);
    for (const row of txRows) {
      const visibility = await this.access.accountVisibility(viewer, row);
      if (visibility !== "full") continue;
      results.push({
        type: "transaction",
        id: row.id,
        title: row.description ?? "Transaktion",
        subtitle: String(row.bookingDate),
        href: `/transactions/${row.id}`,
      });
      if (results.filter((r) => r.type === "transaction").length >= 8) break;
    }

    const accountRows = await db
      .select({
        id: accounts.id,
        name: accounts.name,
        provider: accounts.provider,
        isShared: accounts.isShared,
        ownerMemberId: accounts.ownerMemberId,
      })
      .from(accounts)
      .where(
        and(
          eq(accounts.householdId, householdId),
          or(
            ilike(accounts.name, pattern),
            ilike(accounts.provider, pattern),
          ),
        ),
      )
      .limit(12);
    let accountHits = 0;
    for (const row of accountRows) {
      const visibility = await this.access.accountVisibility(viewer, row);
      if (visibility === "hidden" || visibility === "aggregate") continue;
      const title =
        visibility === "balance" ? "Personligt konto (saldo)" : row.name;
      results.push({
        type: "account",
        id: row.id,
        title,
        subtitle: visibility === "full" ? row.provider : null,
        href: `/accounts/${row.id}`,
      });
      accountHits += 1;
      if (accountHits >= 6) break;
    }

    const merchantRows = await db
      .select({ id: merchants.id, name: merchants.canonicalName })
      .from(merchants)
      .where(
        and(
          eq(merchants.householdId, householdId),
          ilike(merchants.canonicalName, pattern),
        ),
      )
      .limit(6);
    for (const row of merchantRows) {
      results.push({
        type: "merchant",
        id: row.id,
        title: row.name,
        subtitle: "Mottagare",
        href: `/transactions?merchantId=${row.id}`,
      });
    }

    const categoryRows = await db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(
        and(
          eq(categories.householdId, householdId),
          ilike(categories.name, pattern),
        ),
      )
      .limit(6);
    for (const row of categoryRows) {
      results.push({
        type: "category",
        id: row.id,
        title: row.name,
        subtitle: "Kategori",
        href: `/reports?measure=spending&dimension=merchant&categoryId=${row.id}`,
      });
    }

    const recurringRows = await db
      .select({
        id: recurringItems.id,
        name: recurringItems.name,
        isSubscription: recurringItems.isSubscription,
      })
      .from(recurringItems)
      .where(
        and(
          eq(recurringItems.householdId, householdId),
          ilike(recurringItems.name, pattern),
          sql`${recurringItems.status} in ('DETECTED', 'CONFIRMED')`,
        ),
      )
      .limit(6);
    for (const row of recurringRows) {
      results.push({
        type: "subscription",
        id: row.id,
        title: row.name,
        subtitle: row.isSubscription ? "Abonnemang" : "Återkommande",
        href: "/subscriptions",
      });
    }

    const docRows = await db
      .select({
        id: documents.id,
        title: documents.title,
        status: documents.status,
      })
      .from(documents)
      .where(
        and(
          eq(documents.householdId, householdId),
          or(
            ilike(documents.title, pattern),
            ilike(documents.issuer, pattern),
          ),
        ),
      )
      .limit(6);
    for (const row of docRows) {
      results.push({
        type: "document",
        id: row.id,
        title: row.title,
        subtitle: row.status,
        href: "/documents",
      });
    }

    const vehicleRows = await db
      .select({
        id: vehicles.id,
        name: vehicles.name,
        make: vehicles.make,
        model: vehicles.model,
      })
      .from(vehicles)
      .where(
        and(
          eq(vehicles.householdId, householdId),
          or(
            ilike(vehicles.name, pattern),
            ilike(vehicles.make, pattern),
            ilike(vehicles.model, pattern),
          ),
        ),
      )
      .limit(4);
    for (const row of vehicleRows) {
      results.push({
        type: "vehicle",
        id: row.id,
        title: row.name || `${row.make} ${row.model}`,
        subtitle: `${row.make} ${row.model}`,
        href: `/vehicles/${row.id}`,
      });
    }

    const qLower = query.toLowerCase();
    for (const page of STATIC_PAGES) {
      if (
        page.title.toLowerCase().includes(qLower) ||
        page.keywords.some((k) => qLower.includes(k) || k.includes(qLower))
      ) {
        results.push({
          type: "page",
          id: page.href,
          title: page.title,
          subtitle: "Sida",
          href: page.href,
        });
      }
    }

    return { query, results: results.slice(0, 25) };
  }
}
