"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardResponse } from "@ffos/schemas";
import { api, clearSession } from "@/lib/api";
import { AuthRequiredError, ensureHouseholdSession } from "@/lib/session";
import { DashboardView } from "./dashboard-view";
import { FamilySummaryView } from "./family-summary-view";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { describeError } from "@/lib/error-message";

export function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const householdId = await ensureHouseholdSession();
      const dashboard = await api.getDashboard(householdId);
      setData(dashboard);
    } catch (err) {
      const message = describeError(err, "Något gick fel");
      if (
        err instanceof AuthRequiredError ||
        /unauthorized|jwt|token|401/i.test(message)
      ) {
        clearSession();
        router.replace("/login");
        return;
      }
      setError(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Hämtar översikt från API…" />;
  if (error) {
    return (
      <ErrorState
        title="Vi kunde inte hämta översikten"
        description={`${error}. Dina sparade uppgifter påverkas inte. Försök igen om en stund.`}
        onRetry={() => void load()}
      />
    );
  }
  if (!data) {
    return (
      <EmptyState
        title="Ingen översikt ännu"
        description="Skapa ett hushåll eller ladda demo för att se din finansiella position."
        actionLabel="Försök igen"
        onAction={() => void load()}
      />
    );
  }
  return (
    <div className="space-y-8">
      <FamilySummaryView />

      <details className="group rounded-[18px] border border-border bg-surface-elevated">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
          <span>
            <span className="block font-medium text-text-primary">
              Alla detaljer
            </span>
            <span className="mt-1 block text-sm text-text-muted">
              Position, månad, prognos, kassaflöde och datatäckning
            </span>
          </span>
          <span className="text-sm font-medium text-accent group-open:hidden">Visa</span>
          <span className="hidden text-sm font-medium text-accent group-open:inline">
            Dölj
          </span>
        </summary>
        <div className="border-t border-border p-4 md:p-5">
          <DashboardView data={data} />
        </div>
      </details>
    </div>
  );
}
