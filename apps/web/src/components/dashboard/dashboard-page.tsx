"use client";

import { useCallback, useEffect, useState } from "react";
import type { DashboardResponse } from "@ffos/schemas";
import { api, clearSession } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { DashboardView } from "./dashboard-view";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function DashboardPage() {
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
      clearSession();
      setError(err instanceof Error ? err.message : "Något gick fel");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Hämtar översikt från API…" />;
  if (error) {
    return (
      <ErrorState
        title="Vi kunde inte hämta översikten"
        description={`${error}. Kör pnpm db:seed om demodata saknas.`}
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
  return <DashboardView data={data} />;
}
