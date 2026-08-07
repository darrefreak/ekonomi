"use client";

import { useEffect, useState } from "react";
import type { DocumentsResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function DocumentsPage() {
  const [data, setData] = useState<DocumentsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureHouseholdSession()
      .then((id) => api.getDocuments(id))
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Hämtar dokument…" />;
  if (error || !data) {
    return <ErrorState title="Kunde inte hämta dokument" description={error ?? ""} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Dokument / inbox
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Financial inbox utan riktig OCR · {data.asOf}
        </p>
      </div>
      <ul className="space-y-3">
        {data.items.map((d) => (
          <li key={d.id} className="rounded-[16px] bg-surface-elevated p-5">
            <div className="flex justify-between gap-3">
              <div>
                <p className="font-medium">{d.title}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {d.status} · {d.documentType} · {d.issuer ?? "okänd utställare"}
                </p>
                {d.notes ? (
                  <p className="mt-2 text-sm text-text-secondary">{d.notes}</p>
                ) : null}
              </div>
              {d.amount ? <MoneyValue value={d.amount} /> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
