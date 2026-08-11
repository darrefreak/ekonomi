"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { CalendarDay, CalendarEvent, CalendarResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { describeError } from "@/lib/error-message";
import { queryKeys } from "@/lib/query-keys";
import { useHouseholdId } from "@/lib/use-household-id";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

/**
 * The Financial Calendar: the next 7–90 days of money, merged from every
 * forward-looking source without double counting, with a projected accessible
 * cash balance after each day.
 *
 * The timeline list is the primary presentation (also on desktop) because the
 * interesting question is "what happens next and in what order", not "what
 * shape is the month". A compact month grid is available as a toggle for those
 * who think in weeks.
 */

const HORIZONS = [7, 30, 60, 90] as const;

const CONFIDENCE_LABEL: Record<CalendarEvent["confidence"], string> = {
  KNOWN: "Känd",
  EXPECTED: "Förväntad",
  ESTIMATED: "Uppskattad",
};

const CONFIDENCE_CLASS: Record<CalendarEvent["confidence"], string> = {
  KNOWN: "bg-positive/10 text-positive",
  EXPECTED: "bg-accent/10 text-accent",
  ESTIMATED: "bg-warning/10 text-warning",
};

const WEEKDAYS = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"];

function formatDayHeading(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return date
    .toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" })
    .replace(/^./, (c) => c.toUpperCase());
}

function kr(minor: string, currency: string, signed = false) {
  return (
    <MoneyValue value={{ amountMinor: minor, currency: currency as "SEK" }} signed={signed} />
  );
}

export function CalendarPage() {
  const householdId = useHouseholdId();
  const [horizon, setHorizon] = useState<(typeof HORIZONS)[number]>(30);
  const [view, setView] = useState<"timeline" | "month">("timeline");

  const query = useQuery({
    queryKey: queryKeys.calendar.all(householdId ?? "", 90),
    queryFn: () => api.getCalendar(householdId!, 90),
    enabled: Boolean(householdId),
  });

  if (!householdId || query.isLoading) {
    return <LoadingState label="Bygger din finansiella kalender…" />;
  }
  if (query.isError) {
    return (
      <ErrorState
        title="Kalendern kunde inte hämtas"
        description={describeError(query.error, "Försök igen om en stund.")}
      />
    );
  }

  const data = query.data as CalendarResponse;
  const summary = data.summaries[String(horizon) as "7" | "30" | "60" | "90"];
  const visibleDays = data.days.filter((day) => {
    const diff =
      (new Date(`${day.date}T00:00:00`).getTime() -
        new Date(`${data.asOf}T00:00:00`).getTime()) /
      86_400_000;
    return diff <= horizon;
  });
  const daysWithEvents = visibleDays.filter((day) => day.events.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
            Finansiell kalender
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Kommande betalningar och inkomster, med beräknat tillgängligt saldo
            efter varje dag · per {data.asOf}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Tidshorisont"
            className="flex rounded-[10px] bg-surface-elevated p-0.5"
          >
            {HORIZONS.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setHorizon(days)}
                aria-pressed={horizon === days}
                className={`min-h-9 rounded-[8px] px-3 text-sm tabular-nums ${
                  horizon === days
                    ? "bg-surface font-medium text-text-primary shadow-sm"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {days} d
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setView(view === "timeline" ? "month" : "timeline")}
            className="min-h-9 rounded-[10px] bg-surface-elevated px-3 text-sm text-text-secondary hover:text-text-primary"
          >
            {view === "timeline" ? "Månadsvy" : "Tidslinje"}
          </button>
        </div>
      </div>

      {/* Window summary: the four numbers that describe the chosen horizon. */}
      <section
        aria-label={`Sammanfattning kommande ${horizon} dagar`}
        className="grid grid-cols-2 gap-4 rounded-[16px] bg-surface-elevated p-5 sm:grid-cols-4"
      >
        <div>
          <p className="text-xs text-text-muted">In</p>
          <p className="mt-0.5 text-lg font-medium tabular-nums text-positive">
            {kr(summary.inflowMinor, data.currency, true)}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Ut</p>
          <p className="mt-0.5 text-lg font-medium tabular-nums">
            {kr(summary.outflowMinor, data.currency, true)}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Netto</p>
          <p
            className={`mt-0.5 text-lg font-medium tabular-nums ${
              BigInt(summary.netMinor) < 0n ? "text-negative" : "text-positive"
            }`}
          >
            {kr(summary.netMinor, data.currency, true)}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Saldo om {horizon} dagar</p>
          <p className="mt-0.5 text-lg font-medium tabular-nums">
            {kr(summary.endProjectedCashMinor, data.currency)}
          </p>
        </div>
      </section>

      {data.lowestPoint ? (
        <p className="text-sm text-text-secondary">
          Lägsta beräknade saldo under perioden är{" "}
          <span className="font-medium tabular-nums text-text-primary">
            {kr(data.lowestPoint.projectedCashMinor, data.currency)}
          </span>{" "}
          den {data.lowestPoint.date}. Startpunkten är dagens tillgängliga pengar,{" "}
          <span className="tabular-nums">{kr(data.startingCashMinor, data.currency)}</span>.
        </p>
      ) : null}

      {daysWithEvents.length === 0 ? (
        <EmptyState
          title="Inga kommande händelser hittades"
          description="När återkommande betalningar, abonnemang eller framtida transaktioner finns i din data visas de här dag för dag."
        />
      ) : view === "timeline" ? (
        <Timeline days={daysWithEvents} currency={data.currency} />
      ) : (
        <MonthGrid days={visibleDays} currency={data.currency} />
      )}

      <section className="space-y-2 rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm font-medium text-text-secondary">Så räknade vi</h2>
        <ul className="space-y-1 text-xs text-text-secondary">
          {data.method.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
        <p className="text-xs text-text-muted">
          Känd = en riktig bokförd rad. Förväntad = ett upptäckt återkommande
          mönster med beloppsintervall. Uppskattad = en deterministisk
          uppskattning, till exempel lön utifrån historiken.
        </p>
      </section>
    </div>
  );
}

function Timeline({ days, currency }: { days: CalendarDay[]; currency: string }) {
  return (
    <ol className="space-y-4" data-testid="calendar-timeline">
      {days.map((day) => (
        <li key={day.date} className="rounded-[16px] bg-surface-elevated p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold text-text-primary">
              {formatDayHeading(day.date)}
            </h3>
            <p className="text-xs text-text-muted">
              Saldo efter dagen{" "}
              <span className="font-medium tabular-nums text-text-primary">
                {kr(day.projectedCashMinor, currency)}
              </span>
            </p>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {day.events.map((event) => (
              <li key={event.id} className="py-2.5 first:pt-0 last:pb-0">
                <EventRow event={event} currency={currency} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function EventRow({ event, currency }: { event: CalendarEvent; currency: string }) {
  const amount =
    event.lowMinor !== null && event.highMinor !== null && event.lowMinor !== event.highMinor ? (
      <span className="tabular-nums">
        {kr(event.lowMinor, currency, true)} – {kr(event.highMinor, currency, true)}
      </span>
    ) : (
      kr(event.amountMinor, currency, true)
    );

  const body = (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm text-text-primary">{event.title}</p>
        <span
          className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] ${CONFIDENCE_CLASS[event.confidence]}`}
        >
          {CONFIDENCE_LABEL[event.confidence]}
        </span>
      </div>
      <p
        className={`shrink-0 text-sm font-medium tabular-nums ${
          event.direction === "INFLOW" ? "text-positive" : "text-text-primary"
        }`}
      >
        {amount}
      </p>
    </div>
  );

  return event.href ? (
    <Link href={event.href} className="block rounded-[8px] hover:bg-surface">
      {body}
    </Link>
  ) : (
    body
  );
}

function MonthGrid({ days, currency }: { days: CalendarDay[]; currency: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

  const cells = useMemo(() => {
    if (days.length === 0) return [];
    const first = new Date(`${days[0]!.date}T00:00:00`);
    // Pad to Monday so week rows line up.
    const lead = (first.getDay() + 6) % 7;
    const result: Array<{ date: string | null; key: string }> = [];
    for (let i = 0; i < lead; i += 1) result.push({ date: null, key: `pad-${i}` });
    for (const day of days) result.push({ date: day.date, key: day.date });
    return result;
  }, [days]);

  const selectedDay = selected ? byDate.get(selected) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-[16px] bg-surface-elevated p-4">
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-text-muted">
          {WEEKDAYS.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((cell) => {
            if (!cell.date) return <span key={cell.key} />;
            const day = byDate.get(cell.date)!;
            const hasEvents = day.events.length > 0;
            const net = BigInt(day.netMinor);
            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => setSelected(cell.date)}
                aria-pressed={selected === cell.date}
                className={`flex min-h-12 flex-col items-center justify-center rounded-[8px] text-xs tabular-nums ${
                  selected === cell.date
                    ? "bg-accent/15 font-medium text-text-primary"
                    : hasEvents
                      ? "bg-surface text-text-primary hover:bg-accent/10"
                      : "text-text-muted"
                }`}
              >
                <span>{Number(cell.date.slice(8, 10))}</span>
                {hasEvents ? (
                  <span
                    className={`text-[10px] ${net < 0n ? "text-negative" : "text-positive"}`}
                  >
                    ●
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      {selectedDay ? (
        <div className="rounded-[16px] bg-surface-elevated p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold">{formatDayHeading(selectedDay.date)}</h3>
            <p className="text-xs text-text-muted">
              Saldo efter dagen{" "}
              <span className="font-medium tabular-nums text-text-primary">
                {kr(selectedDay.projectedCashMinor, currency)}
              </span>
            </p>
          </div>
          {selectedDay.events.length === 0 ? (
            <p className="mt-2 text-sm text-text-muted">Inga händelser denna dag.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {selectedDay.events.map((event) => (
                <li key={event.id} className="py-2.5 first:pt-0 last:pb-0">
                  <EventRow event={event} currency={currency} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-xs text-text-muted">Välj en dag för att se detaljer.</p>
      )}
    </div>
  );
}
