"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardResponse } from "@ffos/schemas";
import { api, clearSession } from "@/lib/api";
import { AuthRequiredError, ensureHouseholdSession } from "@/lib/session";
import { DashboardView } from "./dashboard-view";
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
