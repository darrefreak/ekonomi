"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type {
  MonthlyReport,
  ReportDimension,
  ReportExploreResponse,
  ReportMeasure,
  YearlyReport,
} from "@ffos/schemas";
import { api } from "@/lib/api";
import { describeError } from "@/lib/error-message";
import { queryKeys } from "@/lib/query-keys";
import { ensureHouseholdSession } from "@/lib/session";
import { useHouseholdId } from "@/lib/use-household-id";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

/**
 * Reports V2 — one explorer instead of many fixed reports.
 *
 * The state lives in the URL, so every drill step (category → merchants →
 * transactions) is a normal navigation: back works, links are shareable and a
 * saved view is nothing more than a stored query string. Monthly and yearly
 * summaries stay below the explorer for the classic "how did the month go"
 * question.
 */

const MEASURES: Array<{ key: ReportMeasure; label: string }> = [
  { key: "spending", label: "Utgifter" },
  { key: "income", label: "Inkomster" },
  { key: "cashflow", label: "Kassaflöde" },
];

const DIMENSIONS: Array<{ key: ReportDimension; label: string }> = [
  { key: "category", label: "Kategori" },
  { key: "merchant", label: "Mottagare" },
  { key: "account", label: "Konto" },
  { key: "month", label: "Månad" },
];

type SavedView = {
  name: string;
  search: string;
};

const SAVED_VIEWS_KEY = "ffos.reports.savedViews";

function readSavedViews(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_VIEWS_KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedView[]) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function ReportsPage() {
  return (
    <Suspense fallback={<LoadingState label="Hämtar rapporter…" />}>
      <ReportsPageInner />
    </Suspense>
  );
}

function ReportsPageInner() {
  const householdId = useHouseholdId();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const measure = (searchParams.get("measure") as ReportMeasure) || "spending";
  const dimension = (searchParams.get("dimension") as ReportDimension) || "category";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";
  const merchantId = searchParams.get("merchantId") ?? "";
  const accountId = searchParams.get("accountId") ?? "";

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const exploreQuery = useQuery({
    queryKey: queryKeys.reports.explore(householdId ?? "", {
      measure,
      dimension,
      from: from || undefined,
      to: to || undefined,
      categoryId: categoryId || undefined,
      merchantId: merchantId || undefined,
      accountId: accountId || undefined,
    }),
    queryFn: () =>
      api.getReportExplore({
        householdId: householdId!,
        measure,
        dimension,
        from: from || undefined,
        to: to || undefined,
        categoryId: categoryId || undefined,
        merchantId: merchantId || undefined,
        accountId: accountId || undefined,
      }),
    enabled: Boolean(householdId),
  });

  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  useEffect(() => {
    setSavedViews(readSavedViews());
  }, []);

  const saveCurrentView = () => {
    const name = window.prompt("Namn på rapportvyn?");
    if (!name) return;
    const next = [
      ...savedViews.filter((view) => view.name !== name),
      { name, search: searchParams.toString() },
    ];
    setSavedViews(next);
    window.localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
  };

  const removeView = (name: string) => {
    const next = savedViews.filter((view) => view.name !== name);
    setSavedViews(next);
    window.localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
  };

  if (!householdId) return <LoadingState label="Hämtar rapporter…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
            Rapporter
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Utforska utgifter, inkomster och kassaflöde — klicka på en rad för att
            gräva djupare.
          </p>
        </div>
        <button
          type="button"
          onClick={saveCurrentView}
          className="min-h-11 rounded-[12px] border border-border-strong px-4 text-sm"
        >
          Spara vyn
        </button>
      </div>

      {savedViews.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="saved-views">
          <span className="text-xs text-text-muted">Sparade vyer</span>
          {savedViews.map((view) => (
            <span
              key={view.name}
              className="inline-flex items-center gap-1 rounded-full bg-surface-elevated px-3 py-1.5 text-sm"
            >
              <Link href={`${pathname}?${view.search}`} className="text-accent">
                {view.name}
              </Link>
              <button
                type="button"
                onClick={() => removeView(view.name)}
                aria-label={`Ta bort vyn ${view.name}`}
                className="text-text-muted hover:text-text-primary"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {/* Controls: measure, dimension, window. */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Mått" className="flex rounded-[10px] bg-surface-elevated p-0.5">
          {MEASURES.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setParams({ measure: option.key })}
              aria-pressed={measure === option.key}
              className={`min-h-9 rounded-[8px] px-3 text-sm ${
                measure === option.key
                  ? "bg-surface font-medium text-text-primary shadow-sm"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Dimension" className="flex rounded-[10px] bg-surface-elevated p-0.5">
          {DIMENSIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setParams({ dimension: option.key })}
              aria-pressed={dimension === option.key}
              className={`min-h-9 rounded-[8px] px-3 text-sm ${
                dimension === option.key
                  ? "bg-surface font-medium text-text-primary shadow-sm"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="text-xs text-text-muted">
          Från
          <input
            type="date"
            value={from}
            onChange={(event) => setParams({ from: event.target.value })}
            className="ml-2 min-h-9 rounded-[8px] border border-border bg-surface px-2 text-sm text-text-primary"
          />
        </label>
        <label className="text-xs text-text-muted">
          Till
          <input
            type="date"
            value={to}
            onChange={(event) => setParams({ to: event.target.value })}
            className="ml-2 min-h-9 rounded-[8px] border border-border bg-surface px-2 text-sm text-text-primary"
          />
        </label>
      </div>

      {categoryId || merchantId || accountId ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-muted">Filtrerat på</span>
          {categoryId ? (
            <FilterChip label="Kategori" onRemove={() => setParams({ categoryId: null })} />
          ) : null}
          {merchantId ? (
            <FilterChip label="Mottagare" onRemove={() => setParams({ merchantId: null })} />
          ) : null}
          {accountId ? (
            <FilterChip label="Konto" onRemove={() => setParams({ accountId: null })} />
          ) : null}
        </div>
      ) : null}

      <ExploreResult query={exploreQuery} />

      <ClassicReports />
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex min-h-9 items-center gap-1 rounded-full bg-accent/10 px-3 text-sm text-accent"
    >
      {label}
      <span aria-hidden>×</span>
      <span className="sr-only">Ta bort filtret {label}</span>
    </button>
  );
}

function ExploreResult({
  query,
}: {
  query: {
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    data: ReportExploreResponse | undefined;
  };
}) {
  if (query.isLoading) return <LoadingState label="Sammanställer rapporten…" />;
  if (query.isError) {
    return (
      <ErrorState
        title="Rapporten kunde inte sammanställas"
        description={describeError(query.error, "Försök igen om en stund.")}
      />
    );
  }
  const data = query.data;
  if (!data) return null;

  if (data.rows.length === 0) {
    return (
      <EmptyState
        title="Inget att rapportera för urvalet"
        description="Prova ett bredare datumintervall eller ta bort ett filter."
      />
    );
  }

  const maxAbs = data.rows.reduce((max, row) => {
    const abs = BigInt(row.amountMinor) < 0n ? -BigInt(row.amountMinor) : BigInt(row.amountMinor);
    return abs > max ? abs : max;
  }, 0n);

  return (
    <section className="space-y-4 rounded-[16px] bg-surface-elevated p-5" data-testid="report-explore">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {data.from} – {data.to} · {data.transactionCount} transaktioner
        </p>
        <p className="text-lg font-medium tabular-nums">
          <MoneyValue
            value={{ amountMinor: data.totalMinor, currency: data.currency as "SEK" }}
            signed={data.measure === "cashflow"}
          />
        </p>
      </div>

      {data.series.length > 1 ? <MonthlyBars series={data.series} /> : null}

      <ul className="divide-y divide-border">
        {data.rows.map((row) => {
          const abs =
            BigInt(row.amountMinor) < 0n ? -BigInt(row.amountMinor) : BigInt(row.amountMinor);
          const width = maxAbs > 0n ? Number((abs * 1000n) / maxAbs) / 10 : 0;
          const inner = (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm text-text-primary">{row.name}</span>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  <MoneyValue
                    value={{ amountMinor: row.amountMinor, currency: data.currency as "SEK" }}
                    signed={data.measure === "cashflow"}
                  />
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full rounded-full bg-accent/60"
                    style={{ width: `${Math.max(width, 1)}%` }}
                  />
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-text-muted">
                  {(row.share * 100).toFixed(0)} % · {row.transactionCount} st
                </span>
              </div>
            </>
          );
          return (
            <li key={row.key} className="py-2.5 first:pt-0 last:pb-0">
              {row.drillHref ? (
                <Link
                  href={row.drillHref}
                  className="block rounded-[8px] hover:bg-surface"
                  data-testid="report-drill-row"
                >
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MonthlyBars({ series }: { series: Array<{ month: string; amountMinor: string }> }) {
  const [active, setActive] = useState<string | null>(null);
  const maxAbs = series.reduce((max, point) => {
    const abs =
      BigInt(point.amountMinor) < 0n ? -BigInt(point.amountMinor) : BigInt(point.amountMinor);
    return abs > max ? abs : max;
  }, 0n);
  const activePoint = series.find((point) => point.month === active) ?? null;

  return (
    <div>
      <div className="flex h-24 items-end gap-1" role="img" aria-label="Månadsserie">
        {series.map((point) => {
          const abs =
            BigInt(point.amountMinor) < 0n
              ? -BigInt(point.amountMinor)
              : BigInt(point.amountMinor);
          const height = maxAbs > 0n ? Number((abs * 1000n) / maxAbs) / 10 : 0;
          return (
            <button
              key={point.month}
              type="button"
              onClick={() => setActive(active === point.month ? null : point.month)}
              aria-pressed={active === point.month}
              aria-label={`${point.month}`}
              className={`flex-1 rounded-t-[4px] ${
                active === point.month ? "bg-accent" : "bg-accent/40 hover:bg-accent/60"
              }`}
              style={{ height: `${Math.max(height, 3)}%` }}
            />
          );
        })}
      </div>
      <p className="mt-2 text-xs tabular-nums text-text-muted">
        {activePoint ? (
          <>
            {activePoint.month}:{" "}
            <MoneyValue
              value={{ amountMinor: activePoint.amountMinor, currency: "SEK" }}
            />
          </>
        ) : (
          `${series[0]!.month} – ${series[series.length - 1]!.month} · tryck på en stapel för värde`
        )}
      </p>
    </div>
  );
}

/** The classic month/year summary, kept below the explorer. */
function ClassicReports() {
  const [monthly, setMonthly] = useState<MonthlyReport | null>(null);
  const [yearly, setYearly] = useState<YearlyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));

  const load = useCallback(async (p: string) => {
    const id = await ensureHouseholdSession();
    const [m, y] = await Promise.all([
      api.getMonthlyReport(id, p),
      api.getYearlyReport(id, Number(p.slice(0, 4))),
    ]);
    setMonthly(m);
    setYearly(y);
  }, []);

  useEffect(() => {
    setLoading(true);
    void load(period)
      .then(() => setError(null))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [load, period]);

  if (loading) return <LoadingState label="Hämtar månadsrapport…" />;
  if (error || !monthly || !yearly) {
    return (
      <ErrorState
        title="Månadsrapporten kunde inte hämtas"
        description={error ?? "Försök igen om en stund."}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Månad och år</h2>
        <label className="text-sm text-text-secondary">
          Period
          <input
            type="month"
            className="ml-2 min-h-9 rounded-[8px] border border-border bg-surface px-2 text-sm text-text-primary"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </label>
      </div>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h3 className="text-sm text-text-secondary">Månad {monthly.period}</h3>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <Stat label="Inkomst" value={<MoneyValue value={monthly.income} />} />
          <Stat label="Utgifter" value={<MoneyValue value={monthly.spending} />} />
          <Stat label="Sparande" value={<MoneyValue value={monthly.savings} signed />} />
          <Stat label="Sparkvot" value={`${monthly.savingsRatePercent.toFixed(1)} %`} />
        </dl>
        {monthly.topCategories.length > 0 ? (
          <ul className="mt-5 space-y-2 text-sm">
            {monthly.topCategories.map((c) => (
              <li key={c.categoryKey} className="flex justify-between gap-3">
                <span className="text-text-secondary">{c.categoryName}</span>
                <MoneyValue value={c.spending} />
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h3 className="text-sm text-text-secondary">År {yearly.year}</h3>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <Stat label="Inkomst" value={<MoneyValue value={yearly.income} />} />
          <Stat label="Utgifter" value={<MoneyValue value={yearly.spending} />} />
          <Stat label="Sparande" value={<MoneyValue value={yearly.savings} signed />} />
          <Stat label="Sparkvot" value={`${yearly.savingsRatePercent.toFixed(1)} %`} />
        </dl>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-medium tabular-nums">{value}</dd>
    </div>
  );
}
