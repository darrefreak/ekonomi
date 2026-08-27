"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { DecisionAction } from "@ffos/schemas";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useHouseholdId } from "@/lib/use-household-id";
import { MoneyValue } from "../financial/money-value";

const HORIZON_SUFFIX: Record<NonNullable<DecisionAction["impactHorizon"]>, string> = {
  annual: "/år",
  monthly: "/mån",
  oneoff: "",
};

/**
 * "Att göra nu" — the top of the home view answers the one question the whole
 * product exists for: what should I actually do? Three highest-impact actions,
 * with a path into the full Decision Center.
 */
export function NextActionsCard() {
  const householdId = useHouseholdId();
  const query = useQuery({
    queryKey: householdId
      ? queryKeys.decisions.all(householdId)
      : ["decisions", "pending"],
    queryFn: () => api.getDecisions(householdId!),
    enabled: Boolean(householdId),
    staleTime: 60_000,
  });

  const actions = query.data?.actions ?? [];
  if (query.isLoading || actions.length === 0) return null;

  const top = actions.slice(0, 3);

  return (
    <section
      data-testid="next-actions"
      aria-labelledby="next-actions-heading"
      className="rounded-[18px] border border-accent/30 bg-accent/5 p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="next-actions-heading" className="text-sm font-medium text-text-primary">
          Att göra nu
        </h2>
        <Link href="/atgarder" className="text-sm font-medium text-accent">
          Alla ({actions.length}) →
        </Link>
      </div>
      <ol className="mt-3 space-y-2">
        {top.map((action, index) => (
          <li key={action.id}>
            <Link
              href={action.href}
              className="flex items-start justify-between gap-3 rounded-[12px] bg-surface-elevated px-4 py-3 hover:shadow-[var(--ffos-shadow-soft)]"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-medium tabular-nums">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-text-primary">{action.title}</p>
                  <p className="mt-0.5 text-sm text-text-secondary">
                    {action.recommendation}
                  </p>
                </div>
              </div>
              {action.impact ? (
                <span className="shrink-0 text-sm font-medium tabular-nums text-text-primary">
                  <MoneyValue value={action.impact} />
                  {action.impactHorizon ? HORIZON_SUFFIX[action.impactHorizon] : ""}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
