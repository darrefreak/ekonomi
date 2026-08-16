"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { InvestmentsResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { describeError } from "@/lib/error-message";

export function InvestmentsPage() {
  const [data, setData] = useState<InvestmentsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const id = await ensureHouseholdSession();
      setData(await api.getInvestments(id));
    } catch (err) {
      setError(describeError(err, "Något gick fel"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Hämtar investeringar…" />;
  if (error) {
    return (
      <ErrorState
        title="Kunde inte hämta investeringar"
        description={error}
        onRetry={() => void load()}
      />
    );
  }
  if (!data) {
    return (
      <EmptyState
        title="Inga investeringar"
        description="Lägg till investerings-, pensions- eller kryptokonton under Konton."
        actionLabel="Försök igen"
        onAction={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Investeringar
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Portfölj, pension och krypto · insättningar senaste 12 månaderna · per{" "}
          {data.asOf}
        </p>
        <p className="mt-3 text-sm">
          <Link href="/net-worth" className="text-accent hover:underline">
            Nettoförmögenhet →
          </Link>
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Stat
          label="Totalt saldo"
          value={<MoneyValue value={data.totals.balance} />}
        />
        <Stat
          label="Bidrag 12 mån"
          value={<MoneyValue value={data.totals.trailingContributions} />}
        />
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          title="Inga investeringskonton"
          description="När investeringar finns visas saldo och bidrag här."
        />
      ) : (
        <section className="overflow-hidden rounded-[16px] bg-surface-elevated">
          <ul className="divide-y divide-border">
            {data.items.map((item) => (
              <li
                key={item.id}
                className="flex min-h-14 items-start justify-between gap-3 px-5 py-4"
              >
                <div>
                  <p className="font-medium text-text-primary">{item.name}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {item.accountType}
                    {item.provider ? ` · ${item.provider}` : ""}
                    {item.contributionCount > 0
                      ? ` · ${item.contributionCount} bidrag`
                      : ""}
                  </p>
                  <p className="mt-1 text-xs text-text-secondary">
                    Bidrag 12m{" "}
                    <MoneyValue value={item.trailingContributions} />
                  </p>
                </div>
                <MoneyValue
                  value={item.balance}
                  className="shrink-0 text-text-primary"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.recentContributions.length > 0 ? (
        <section className="rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm font-medium text-text-secondary">
            Senaste bidrag
          </h2>
          <ul className="mt-4 divide-y divide-border">
            {data.recentContributions.map((c) => (
              <li
                key={`${c.id}-${c.occurredOn}`}
                className="flex items-start justify-between gap-3 py-3 text-sm"
              >
                <div>
                  <p className="text-text-primary">
                    {c.description ?? "Investeringsbidrag"}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {c.occurredOn} · {c.accountName}
                  </p>
                </div>
                <MoneyValue value={c.amount} className="shrink-0" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[16px] bg-surface-elevated p-5">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 text-lg font-medium">{value}</p>
    </div>
  );
}
