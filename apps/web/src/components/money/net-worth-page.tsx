"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { NetWorthResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { describeError } from "@/lib/error-message";

export function NetWorthPage() {
  const [data, setData] = useState<NetWorthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const id = await ensureHouseholdSession();
      setData(await api.getNetWorth(id));
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

  const historyBars = useMemo(() => {
    if (!data?.history.length) return [];
    const values = data.history.map((h) => BigInt(h.netWorth.amountMinor));
    const max = values.reduce((a, b) => (a > b ? a : b), 0n);
    const min = values.reduce((a, b) => (a < b ? a : b), values[0]!);
    const span = max - min || 1n;
    return data.history.map((h) => {
      const v = BigInt(h.netWorth.amountMinor);
      const pct = Number(((v - min) * 100n) / span);
      return { ...h, heightPct: Math.max(8, Math.min(100, pct)) };
    });
  }, [data]);

  if (loading) return <LoadingState label="Hämtar nettoförmögenhet…" />;
  if (error) {
    return (
      <ErrorState
        title="Kunde inte hämta nettoförmögenhet"
        description={error}
        onRetry={() => void load()}
      />
    );
  }
  if (!data) {
    return (
      <EmptyState
        title="Ingen nettoförmögenhet"
        description="När konton finns beräknas NW från ledger och snapshots."
        actionLabel="Försök igen"
        onAction={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Nettoförmögenhet
        </h1>
        <p className="mt-2 text-3xl font-medium">
          <MoneyValue value={data.current} />
        </p>
        <p className="mt-2 text-sm text-positive">
          <MoneyValue value={data.changeMonth} signed /> den här månaden
        </p>
        <p className="mt-3 flex flex-wrap gap-4 text-sm">
          <Link href="/investments" className="text-accent hover:underline">
            Investeringar →
          </Link>
          <Link href="/assets" className="text-accent hover:underline">
            Tillgångar →
          </Link>
          <Link href="/debt" className="text-accent hover:underline">
            Skulder →
          </Link>
        </p>
      </div>

      <section className="grid gap-3 rounded-[16px] bg-surface-elevated p-5 md:grid-cols-2">
        <Stat label="Likvida medel" value={<MoneyValue value={data.breakdown.cash} />} />
        <Stat
          label="Investeringar"
          value={
            <Link href="/investments" className="hover:text-accent">
              <MoneyValue value={data.breakdown.investments} />
            </Link>
          }
        />
        <Stat
          label="Tillgångar"
          value={
            <Link href="/assets" className="hover:text-accent">
              <MoneyValue value={data.breakdown.assets} />
            </Link>
          }
        />
        <Stat
          label="Skulder"
          value={
            <Link href="/debt" className="hover:text-accent">
              <MoneyValue value={data.breakdown.liabilities} />
            </Link>
          }
        />
      </section>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Historik (snapshots)</h2>
        {historyBars.length === 0 ? (
          <p className="mt-4 text-sm text-text-muted">
            Ingen snapshot-historik ännu.
          </p>
        ) : (
          <>
            <div className="mt-4 flex h-32 items-end gap-2">
              {historyBars.map((h) => (
                <div
                  key={h.asOf}
                  className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
                  title={`${h.asOf}: ${h.netWorth.amountMinor}`}
                >
                  <div
                    className="w-full max-w-10 rounded-t bg-accent/80"
                    style={{ height: `${h.heightPct}%` }}
                  />
                </div>
              ))}
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {data.history.map((h) => (
                <li
                  key={h.asOf}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-text-secondary">
                    {h.asOf}
                    {h.source ? (
                      <span className="ml-2 text-xs text-text-muted">
                        {h.source}
                      </span>
                    ) : null}
                  </span>
                  <MoneyValue value={h.netWorth} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Vad drev förändringen?</h2>
        {data.attribution.length === 0 ? (
          <p className="mt-4 text-sm text-text-muted">
            Ingen attribution för perioden.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {data.attribution.map((item) => (
              <li
                key={item.key}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-text-secondary">{item.label}</span>
                <MoneyValue value={item.amount} signed />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 text-lg font-medium">{value}</p>
    </div>
  );
}
