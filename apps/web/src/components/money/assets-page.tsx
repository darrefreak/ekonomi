"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { AssetsResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { describeError } from "@/lib/error-message";

export function AssetsPage() {
  const [data, setData] = useState<AssetsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const id = await ensureHouseholdSession();
      setData(await api.getAssets(id));
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

  if (loading) return <LoadingState label="Hämtar tillgångar…" />;
  if (error) {
    return (
      <ErrorState
        title="Kunde inte hämta tillgångar"
        description={error}
        onRetry={() => void load()}
      />
    );
  }
  if (!data) {
    return (
      <EmptyState
        title="Inga tillgångar"
        description="Lägg till tillgångskonton under Konton, eller koppla fordon."
        actionLabel="Försök igen"
        onAction={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Tillgångar
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Reala tillgångar och fordonskopplingar · as of {data.asOf}
        </p>
        <p className="mt-3 flex flex-wrap gap-4 text-sm">
          <Link href="/net-worth" className="text-accent hover:underline">
            Nettoförmögenhet →
          </Link>
          <Link href="/vehicles" className="text-accent hover:underline">
            Fordon →
          </Link>
        </p>
      </div>

      <Stat
        label="Uppskattat värde"
        value={<MoneyValue value={data.totals.estimatedValue} />}
      />

      {data.items.length === 0 ? (
        <EmptyState
          title="Inga tillgångskonton"
          description="När tillgångar finns visas uppskattat värde och fordonslänkar här."
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
                  </p>
                  {item.vehicleName ? (
                    <p className="mt-1 text-xs text-text-secondary">
                      Fordon: {item.vehicleName}
                      {item.vehicleValueLow && item.vehicleValueHigh ? (
                        <>
                          {" "}
                          · spann{" "}
                          <MoneyValue value={item.vehicleValueLow} /> –{" "}
                          <MoneyValue value={item.vehicleValueHigh} />
                        </>
                      ) : null}
                      {item.vehicleId ? (
                        <>
                          {" "}
                          ·{" "}
                          <Link
                            href={`/vehicles/${item.vehicleId}`}
                            className="text-accent hover:underline"
                          >
                            öppna
                          </Link>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                <MoneyValue
                  value={item.estimatedValue}
                  className="shrink-0 text-text-primary"
                />
              </li>
            ))}
          </ul>
        </section>
      )}
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
