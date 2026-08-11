"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClusterReviewItem, ResolveClusterInput } from "@ffos/schemas";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { describeError } from "@/lib/error-message";

/**
 * Needs Review at the cluster level.
 *
 * One card per unresolved pattern, not one per transaction: 217 unknown rows in
 * six clusters are six questions. Answering a card applies to every matching
 * transaction — the count is shown before anything happens — and "Kom ihåg
 * detta för framtiden" persists the answer as a household rule so the next
 * analysis resolves the pattern on its own.
 */

const REVIEW_TYPE_LABELS: Record<ClusterReviewItem["reviewType"], string> = {
  UNKNOWN_MERCHANT: "Okänd mottagare",
  UNKNOWN_CATEGORY: "Kategori saknas",
  LOW_CLASSIFICATION_CONFIDENCE: "Osäker klassificering",
};

function formatKr(minor: string | null, currency: string): string | null {
  if (minor === null) return null;
  const value = Number(BigInt(minor)) / 100;
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function ClusterReviewSection({ householdId }: { householdId: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // Whether the user resolved anything in this visit — makes the difference
  // between "nothing to review" (render nothing) and "you just finished" (a
  // deserved done state).
  const [resolvedThisSession, setResolvedThisSession] = useState(0);

  const reviewQuery = useQuery({
    queryKey: queryKeys.intelligence.review(householdId),
    queryFn: () => api.getClusterReview(householdId),
  });
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories.all(householdId),
    queryFn: () => api.listCategories(householdId),
  });

  const resolveMutation = useMutation({
    mutationFn: (input: ResolveClusterInput) => api.resolveCluster(input),
    onSuccess: async () => {
      setError(null);
      setResolvedThisSession((count) => count + 1);
      // A correction moves transactions, merchants and every downstream figure.
      await Promise.all(
        [
          queryKeys.intelligence.review(householdId),
          ["transactions", householdId],
          ["merchants", householdId],
          ["review", householdId],
          ["dashboard", householdId],
          ["metrics", householdId],
          ["anomalies", householdId],
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
    onError: (err) => setError(describeError(err, "Kunde inte spara granskningen")),
  });

  const data = reviewQuery.data;
  if (reviewQuery.isLoading) {
    return (
      <section className="rounded-[16px] bg-surface-elevated p-5">
        <p className="text-sm text-text-secondary">Hämtar mönster att granska…</p>
      </section>
    );
  }
  if (reviewQuery.isError) {
    return (
      <section className="rounded-[16px] bg-surface-elevated p-5" role="alert">
        <h2 className="font-medium">Mönster att granska</h2>
        <p className="mt-1 text-sm text-warning">
          {describeError(reviewQuery.error, "Kunde inte hämta granskningskön")}
        </p>
        <button
          type="button"
          className="mt-3 min-h-11 rounded-[12px] border border-border-strong px-4 text-sm"
          onClick={() => void reviewQuery.refetch()}
        >
          Försök igen
        </button>
      </section>
    );
  }
  if (!data || data.total === 0) {
    if (resolvedThisSession > 0) {
      return (
        <section
          className="rounded-[16px] bg-surface-elevated p-5"
          data-testid="review-done"
        >
          <h2 className="font-[family-name:var(--ffos-font-display)] text-2xl tracking-tight">
            Klart.
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            Vi kommer ihåg dina val inför framtida importer.
          </p>
        </section>
      );
    }
    return null;
  }

  // Biggest financial impact first: the pattern worth 40 000 kr is a better
  // use of the first ten seconds than the one worth 90 kr.
  const items = [...data.items].sort((a, b) => {
    const abs = (minor: string | null) => {
      if (minor === null) return 0n;
      const value = BigInt(minor);
      return value < 0n ? -value : value;
    };
    return Number(abs(b.totalAmountMinor) - abs(a.totalAmountMinor));
  });

  return (
    <section aria-labelledby="cluster-review-heading" className="space-y-3">
      <div>
        <h2 id="cluster-review-heading" className="font-medium">
          Mönster att granska
        </h2>
        <p className="mt-1 text-sm text-text-secondary" data-testid="review-progress">
          <span className="font-medium tabular-nums text-text-primary">
            {data.total === 1 ? "1 sak kvar" : `${data.total} saker kvar`}
          </span>
          {" · "}Ett svar gäller alla transaktioner i mönstret.
        </p>
      </div>
      {error ? (
        <p className="text-sm text-warning" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="space-y-3">
        {items.map((item) => (
          <ClusterReviewCard
            key={item.id}
            item={item}
            householdId={householdId}
            categories={categoriesQuery.data?.items ?? []}
            busy={resolveMutation.isPending}
            onResolve={(input) => resolveMutation.mutate(input)}
          />
        ))}
      </ul>
    </section>
  );
}

function ClusterReviewCard({
  item,
  householdId,
  categories,
  busy,
  onResolve,
}: {
  item: ClusterReviewItem;
  householdId: string;
  categories: Array<{ id: string; name: string }>;
  busy: boolean;
  onResolve: (input: ResolveClusterInput) => void;
}) {
  const [mode, setMode] = useState<"idle" | "correct" | "confirm-accept">("idle");
  const [merchantName, setMerchantName] = useState(item.merchantCandidate ?? "");
  const [categoryId, setCategoryId] = useState(item.categoryCandidateId ?? "");
  const [remember, setRemember] = useState(true);

  const median = formatKr(item.medianAmountMinor, item.currency);
  const min = formatKr(item.minAmountMinor, item.currency);
  const max = formatKr(item.maxAmountMinor, item.currency);
  const total = formatKr(item.totalAmountMinor, item.currency);
  const confidencePercent =
    item.confidence !== null ? Math.round(item.confidence * 100) : null;

  const submitCorrect = () => {
    onResolve({
      householdId,
      clusterId: item.id,
      action: "correct",
      merchantName: merchantName.trim() || undefined,
      categoryId: categoryId || undefined,
      rememberRule: remember,
    });
  };

  return (
    <li className="rounded-[16px] bg-surface-elevated p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-text-muted">
            {REVIEW_TYPE_LABELS[item.reviewType]}
            {item.direction === "INFLOW" ? " · Inkommande" : ""}
          </p>
          <p className="mt-1 break-words font-medium text-text-primary">
            {item.representativeDescription}
          </p>
        </div>
        <p className="text-sm text-text-secondary">
          {item.transactionCount}{" "}
          {item.transactionCount === 1 ? "transaktion" : "transaktioner"}
        </p>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-text-secondary sm:grid-cols-4">
        {median ? (
          <div>
            <dt className="text-xs text-text-muted">Median</dt>
            <dd className="tabular-nums">{median}</dd>
          </div>
        ) : null}
        {min && max ? (
          <div>
            <dt className="text-xs text-text-muted">Intervall</dt>
            <dd className="tabular-nums">
              {min}–{max}
            </dd>
          </div>
        ) : null}
        {total ? (
          <div>
            <dt className="text-xs text-text-muted">
              {item.direction === "INFLOW" ? "Totalt in" : "Totalt ut"}
            </dt>
            <dd className="tabular-nums">{total}</dd>
          </div>
        ) : null}
        {item.firstSeen && item.lastSeen ? (
          <div>
            <dt className="text-xs text-text-muted">Period</dt>
            <dd>
              {item.firstSeen} – {item.lastSeen}
            </dd>
          </div>
        ) : null}
      </dl>

      <p className="mt-2 text-sm text-text-secondary">{item.explanation}</p>

      {item.merchantCandidate ? (
        <p className="mt-1 text-sm">
          Vi tror: <span className="font-medium">{item.merchantCandidate}</span>
          {item.categoryCandidateName ? ` · ${item.categoryCandidateName}` : ""}
          {confidencePercent !== null ? (
            <span className="text-text-secondary"> · Konfidens {confidencePercent} %</span>
          ) : null}
        </p>
      ) : null}

      {item.aiSuggestion ? (
        <div
          className="mt-2 rounded-[12px] border border-border bg-surface p-3"
          data-testid="ai-suggestion"
        >
          <p className="text-xs uppercase tracking-wide text-text-muted">AI-förslag</p>
          <p className="mt-1 text-sm">
            Vi tror att detta är{" "}
            <span className="font-medium">
              {item.aiSuggestion.merchantCandidate ?? "okänd mottagare"}
            </span>
            {item.aiSuggestion.categoryName ? ` · ${item.aiSuggestion.categoryName}` : ""}
            <span className="text-text-secondary">
              {" "}
              · Konfidens {Math.round(item.aiSuggestion.confidence * 100)} %
            </span>
          </p>
          {item.aiSuggestion.shortExplanation ? (
            <p className="mt-1 text-sm text-text-secondary">
              {item.aiSuggestion.shortExplanation}
            </p>
          ) : null}
          {(item.aiSuggestion.merchantCandidate || item.aiSuggestion.categoryId) &&
          mode === "idle" ? (
            <button
              type="button"
              disabled={busy}
              data-testid="ai-suggestion-use"
              className="mt-2 min-h-11 rounded-[12px] border border-border-strong px-4 text-sm disabled:opacity-50"
              onClick={() => {
                // Confirming an AI suggestion is a user verification: pre-fill
                // the correct form so the user sees exactly what applies.
                if (item.aiSuggestion?.merchantCandidate) {
                  setMerchantName(item.aiSuggestion.merchantCandidate);
                }
                if (item.aiSuggestion?.categoryId) {
                  setCategoryId(item.aiSuggestion.categoryId);
                }
                setMode("correct");
              }}
            >
              Använd AI-förslaget
            </button>
          ) : null}
        </div>
      ) : null}

      {mode === "correct" ? (
        <div className="mt-3 space-y-3 rounded-[12px] border border-border p-3">
          <label className="block text-sm">
            <span className="text-text-secondary">Mottagare</span>
            <input
              type="text"
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
              placeholder="T.ex. ICA Maxi Haninge"
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-secondary">Kategori</span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
            >
              <option value="">Ingen kategori</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4"
            />
            Kom ihåg detta för framtiden (gäller detta hushåll)
          </label>
          <p className="text-sm text-text-secondary">
            Detta kommer att kategorisera {item.transactionCount} liknande{" "}
            {item.transactionCount === 1 ? "transaktion" : "transaktioner"}.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || (!merchantName.trim() && !categoryId)}
              className="min-h-11 rounded-[12px] bg-accent px-4 text-sm text-on-accent disabled:opacity-50"
              onClick={submitCorrect}
            >
              Använd på {item.transactionCount}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-[12px] border border-border px-4 text-sm"
              onClick={() => setMode("idle")}
            >
              Avbryt
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {item.merchantCandidate ? (
            mode === "confirm-accept" ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  className="min-h-11 rounded-[12px] bg-accent px-4 text-sm text-on-accent disabled:opacity-50"
                  onClick={() =>
                    onResolve({
                      householdId,
                      clusterId: item.id,
                      action: "accept",
                      rememberRule: remember,
                    })
                  }
                >
                  Bekräfta {item.transactionCount}{" "}
                  {item.transactionCount === 1 ? "transaktion" : "transaktioner"}
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-[12px] border border-border px-4 text-sm"
                  onClick={() => setMode("idle")}
                >
                  Avbryt
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy}
                className="min-h-11 rounded-[12px] bg-accent px-4 text-sm text-on-accent disabled:opacity-50"
                onClick={() => setMode("confirm-accept")}
              >
                Acceptera förslag
              </button>
            )
          ) : null}
          {mode !== "confirm-accept" ? (
            <>
              <button
                type="button"
                disabled={busy}
                className="min-h-11 rounded-[12px] border border-border-strong px-4 text-sm disabled:opacity-50"
                onClick={() => setMode("correct")}
              >
                Rätta
              </button>
              <button
                type="button"
                disabled={busy}
                className="min-h-11 rounded-[12px] border border-border px-4 text-sm disabled:opacity-50"
                onClick={() =>
                  onResolve({
                    householdId,
                    clusterId: item.id,
                    action: "skip",
                    rememberRule: false,
                  })
                }
              >
                Hoppa över
              </button>
            </>
          ) : null}
          {mode === "confirm-accept" ? (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4"
              />
              Kom ihåg detta för framtiden
            </label>
          ) : null}
        </div>
      )}
    </li>
  );
}
