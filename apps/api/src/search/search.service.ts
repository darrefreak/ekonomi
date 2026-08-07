import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  accounts,
  merchants,
  sourceTransactions,
} from "../db/schema-economic";
import { documents } from "../db/schema-intake";
import { vehicles } from "../db/schema-vehicles";
import { HouseholdAccessService } from "../households/household-access.service";

type SearchHit = {
  type:
    | "transaction"
    | "account"
    | "merchant"
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
];

@Injectable()
export class SearchService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
  ) {}

  async search(userId: string, householdId: string, q: string) {
    await this.access.requireMembership(userId, householdId);
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
      })
      .from(sourceTransactions)
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
      .limit(8);
    for (const row of txRows) {
      results.push({
        type: "transaction",
        id: row.id,
        title: row.description ?? "Transaktion",
        subtitle: String(row.bookingDate),
        href: `/transactions/${row.id}`,
      });
    }

    const accountRows = await db
      .select({ id: accounts.id, name: accounts.name, provider: accounts.provider })
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
      .limit(6);
    for (const row of accountRows) {
      results.push({
        type: "account",
        id: row.id,
        title: row.name,
        subtitle: row.provider,
        href: `/accounts/${row.id}`,
      });
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
        subtitle: "Merchant",
        href: `/transactions?q=${encodeURIComponent(row.name)}`,
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
