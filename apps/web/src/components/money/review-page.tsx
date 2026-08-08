"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { AnomaliesResponse, CategoriesResponse, ReviewResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function ReviewPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [data, setData] = useState<ReviewResponse | null>(null);
  const [anomalies, setAnomalies] = useState<AnomaliesResponse | null>(null);
  const [categories, setCategories] = useState<CategoriesResponse["items"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [categoryPick, setCategoryPick] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const id = await ensureHouseholdSession();
    setHouseholdId(id);
    const [review, cats, anomalyList] = await Promise.all([
      api.getReview(id),
      api.listCategories(id),
      api.getAnomalies(id),
    ]);
    setData(review);
    setCategories(cats.items);
    setAnomalies(anomalyList);
  }, []);

  useEffect(() => {
    void load()
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [load]);

  async function resolve(
    item: ReviewResponse["items"][number],
    action:
      | "set_category"
      | "mark_internal_transfer"
      | "archive_document"
      | "dismiss",
  ) {
    if (!householdId || !item.entityId) return;
    setBusyId(item.id);
    setError(null);
    try {
      const next = await api.resolveReview({
        householdId,
        itemId: item.id,
        kind: item.kind,
        entityId: item.entityId,
        action,
        categoryId:
          action === "set_category" ? categoryPick[item.id] : undefined,
      });
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte lösa post");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState label="Hämtar granskningskö…" />;
  if (error && !data) {
    return (
      <ErrorState
        title="Kunde inte hämta granskning"
        description={error}
        onRetry={() => void load()}
      />
    );
  }
  if (!data) return null;

  const anomalyCount = anomalies?.items.length ?? 0;

  if (data.total === 0 && anomalyCount === 0) {
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
          {anomalyCount > 0 ? ` · ${anomalyCount} avvikelser` : ""}
        </p>
      </div>

      {error ? (
        <p className="text-sm text-warning" role="alert">
          {error}
        </p>
      ) : null}

      {anomalyCount > 0 ? (
        <section className="rounded-[16px] bg-surface-elevated p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-medium">Avvikelser</h2>
              <p className="mt-1 text-sm text-text-secondary">
                {anomalyCount} aktiva signaler från regelmotorn.
              </p>
            </div>
            <Link
              href="/insights"
              className="inline-flex min-h-11 items-center rounded-[12px] border border-border-strong px-4 text-sm"
            >
              Hantera i Insights
            </Link>
          </div>
          <ul className="mt-4 space-y-2">
            {anomalies!.items.slice(0, 3).map((item) => (
              <li key={item.id} className="text-sm">
                <span className="text-text-muted">{item.severity}</span>
                {" · "}
                {item.title}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Count label="Okända transaktioner" value={data.counts.unknownTransactions} />
        <Count label="Möjliga överföringar" value={data.counts.possibleInternalTransfers} />
        <Count label="Okända merchants" value={data.counts.unknownMerchants} />
        <Count label="Dokumentfält" value={data.counts.documentFields} />
      </div>

      <ul className="divide-y divide-border rounded-[16px] bg-surface-elevated">
        {data.items.map((item) => (
          <li key={item.id} className="px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
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
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {item.kind === "unknown_transaction" ? (
                <>
                  <select
                    className="min-h-11 rounded-[12px] border border-border bg-surface px-3 text-sm"
                    value={categoryPick[item.id] ?? ""}
                    onChange={(e) =>
                      setCategoryPick((prev) => ({
                        ...prev,
                        [item.id]: e.target.value,
                      }))
                    }
                  >
                    <option value="">Välj kategori</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busyId === item.id || !categoryPick[item.id]}
                    className="min-h-11 rounded-[12px] bg-accent px-3 text-sm text-white disabled:opacity-50"
                    onClick={() => void resolve(item, "set_category")}
                  >
                    Sätt kategori
                  </button>
                </>
              ) : null}
              {item.kind === "possible_internal_transfer" ? (
                <button
                  type="button"
                  disabled={busyId === item.id}
                  className="min-h-11 rounded-[12px] bg-accent px-3 text-sm text-white disabled:opacity-50"
                  onClick={() => void resolve(item, "mark_internal_transfer")}
                >
                  Markera överföring
                </button>
              ) : null}
              {item.kind === "document_field" ? (
                <>
                  <Link
                    href="/documents"
                    className="min-h-11 rounded-[12px] border border-border px-3 text-sm leading-[2.75]"
                  >
                    Öppna dokument
                  </Link>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    className="min-h-11 rounded-[12px] bg-accent px-3 text-sm text-white disabled:opacity-50"
                    onClick={() => void resolve(item, "archive_document")}
                  >
                    Arkivera
                  </button>
                </>
              ) : null}
              {item.kind !== "document_field" ? (
                <button
                  type="button"
                  disabled={busyId === item.id}
                  className="min-h-11 rounded-[12px] border border-border px-3 text-sm disabled:opacity-50"
                  onClick={() => void resolve(item, "dismiss")}
                >
                  Avfärda
                </button>
              ) : null}
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
