"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { SavingsTargetResponse } from "@ffos/api-client";
import { api } from "@/lib/api";
import { describeError } from "@/lib/error-message";
import { queryKeys } from "@/lib/query-keys";
import { useHouseholdId } from "@/lib/use-household-id";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

/**
 * "How much should we save?" — the savings waterfall.
 *
 * The deterministic engine allocates the household's normal monthly surplus in
 * priority order (obligations → reserve → irregular costs → goals → policies →
 * free surplus). The page shows that order visually, and when free surplus
 * exists it offers deterministic options for what to do with it — links to the
 * places where the user acts, never an automatic money movement.
 */

const CONFIDENCE_LABELS: Record<string, { text: string; tone: string }> = {
  HIGH: { text: "Hög säkerhet", tone: "text-positive" },
  MODERATE: { text: "Måttlig säkerhet", tone: "text-warning" },
  LOW: { text: "Låg säkerhet", tone: "text-negative" },
};

function kr(minor: string, currency: string, signed = false) {
  return (
    <MoneyValue value={{ amountMinor: minor, currency: currency as "SEK" }} signed={signed} />
  );
}

export function SavingsPage() {
  const householdId = useHouseholdId();
  const query = useQuery({
    queryKey: queryKeys.savings.target(householdId ?? ""),
    queryFn: () => api.getSavingsTarget(householdId!),
    enabled: Boolean(householdId),
  });

  if (!householdId || query.isLoading) {
    return <LoadingState label="Räknar fram er sparkapacitet…" />;
  }
  if (query.isError) {
    return (
      <ErrorState
        title="Sparanalysen kunde inte hämtas"
        description={describeError(query.error, "Försök igen om en stund.")}
      />
    );
  }

  const data = query.data as SavingsTargetResponse;
  const confidence = CONFIDENCE_LABELS[data.confidence] ?? {
    text: data.confidence,
    tone: "text-text-muted",
  };
  const surplus = BigInt(data.availableSurplusMinor);
  const total = BigInt(data.totalAllocatedMinor);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Sparande
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Hur mycket ni rimligen kan spara varje månad, och i vilken ordning
          pengarna gör mest nytta · per {data.asOf}
        </p>
      </div>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <p className="text-xs text-text-muted">Normalt månadsöverskott</p>
        <p className="mt-1 font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight tabular-nums">
          {kr(data.normalMonthlySurplusMinor, data.currency)}
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          Inkomst minus normala utgifter, per månad ur din historik.{" "}
          <span className={confidence.tone}>{confidence.text}.</span>
        </p>
      </section>

      {data.cashflowNegative ? (
        <EmptyState
          title="Utgifterna är större än inkomsterna just nu"
          description="Ett sparmål blir inte meningsfullt förrän kassaflödet är positivt. Börja med Vad har förändrats? för att se vad som driver kostnaderna."
        />
      ) : (
        <>
          {/* The waterfall: priority order is the whole point. */}
          <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-medium text-text-secondary">
                Så gör pengarna mest nytta, i ordning
              </h2>
              <p className="text-xs text-text-muted tabular-nums">
                Totalt {kr(data.totalAllocatedMinor, data.currency)}/mån
              </p>
            </div>
            <ol className="space-y-2" data-testid="savings-waterfall">
              {data.allocations.map((allocation, index) => {
                const share =
                  total > 0n
                    ? Number((BigInt(allocation.amountMinor) * 1000n) / total) / 10
                    : 0;
                return (
                  <li key={allocation.key}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        <span className="mr-2 text-xs tabular-nums text-text-muted">
                          {index + 1}.
                        </span>
                        {allocation.label}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {kr(allocation.amountMinor, data.currency)}
                      </span>
                    </div>
                    <div
                      aria-hidden
                      className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface"
                    >
                      <div
                        className="h-full rounded-full bg-accent/60"
                        style={{ width: `${Math.max(share, 2)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
            {BigInt(data.shortfallMinor) > 0n ? (
              <p className="text-sm text-warning">
                Det saknas {kr(data.shortfallMinor, data.currency)}/mån för att täcka
                alla steg. Stegen fylls uppifrån och ned, så det som saknas hamnar
                längst ned i listan.
              </p>
            ) : null}
          </section>

          {/* Deterministic options for the free surplus. Nothing executes automatically. */}
          {surplus > 0n ? (
            <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
              <div>
                <h2 className="text-sm font-medium text-text-secondary">
                  Vad kan jag göra med överskottet?
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Efter alla steg finns{" "}
                  <span className="font-medium tabular-nums text-text-primary">
                    {kr(data.availableSurplusMinor, data.currency)}
                  </span>{" "}
                  fritt per månad. Några rimliga alternativ — inget sker
                  automatiskt, du väljer själv:
                </p>
              </div>
              <ul className="divide-y divide-border text-sm">
                <SurplusOption
                  href="/liquidity"
                  title="Behåll som extra likviditet"
                  description="Om ni vill ha större marginal än den rekommenderade nivån."
                />
                <SurplusOption
                  href="/goals"
                  title="Finansiera ett mål"
                  description="Lägg överskottet mot ett befintligt eller nytt sparmål."
                />
                <SurplusOption
                  href="/debt"
                  title="Öka amorteringen"
                  description="Extra amortering minskar räntekostnaden deterministiskt."
                />
                <SurplusOption
                  href="/investments"
                  title="Placera enligt er investeringspolicy"
                  description="Om ni har en policy för långsiktigt sparande."
                />
              </ul>
            </section>
          ) : null}
        </>
      )}

      <section className="space-y-2 rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm font-medium text-text-secondary">Så räknade vi</h2>
        <ul className="space-y-1 text-xs text-text-secondary">
          {data.notes.map((note) => (
            <li key={note}>· {note}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SurplusOption({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <li>
      <Link href={href} className="block py-3 hover:text-accent">
        <p className="font-medium text-text-primary">{title}</p>
        <p className="mt-0.5 text-xs text-text-muted">{description}</p>
      </Link>
    </li>
  );
}
