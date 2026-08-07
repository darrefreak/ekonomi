"use client";

import { useEffect, useState } from "react";
import type { ReviewResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function ReviewPage() {
  const [data, setData] = useState<ReviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureHouseholdSession()
      .then((id) => api.getReview(id))
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Hämtar granskningskö…" />;
  if (error || !data) {
    return (
      <ErrorState
        title="Kunde inte hämta granskning"
        description={error ?? "Ingen data"}
      />
    );
  }

  if (data.total === 0) {
    return (
      <EmptyState
        title="Inget att granska"
        description="Alla transaktioner ser klassificerade ut just nu."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Granska
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          {data.total} poster behöver uppmärksamhet
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Count label="Okända transaktioner" value={data.counts.unknownTransactions} />
        <Count label="Möjliga överföringar" value={data.counts.possibleInternalTransfers} />
        <Count label="Okända merchants" value={data.counts.unknownMerchants} />
        <Count label="Dokumentfält" value={data.counts.documentFields} />
      </div>

      <ul className="divide-y divide-border rounded-[16px] bg-surface-elevated">
        {data.items.map((item) => (
          <li key={item.id} className="px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-text-muted">
                  {item.kind.replaceAll("_", " ")}
                </p>
                <p className="mt-1 font-medium text-text-primary">{item.title}</p>
                <p className="mt-1 text-sm text-text-secondary">{item.detail}</p>
                {item.bookingDate ? (
                  <p className="mt-1 text-xs text-text-muted">{item.bookingDate}</p>
                ) : null}
              </div>
              {item.amount ? <MoneyValue value={item.amount} signed /> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[14px] bg-surface-elevated px-3 py-4">
      <p className="text-2xl font-medium tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-text-muted">{label}</p>
    </div>
  );
}
