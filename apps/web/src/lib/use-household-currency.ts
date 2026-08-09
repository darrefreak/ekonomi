"use client";

import { useQuery } from "@tanstack/react-query";
import type { CurrencyCode } from "@ffos/domain";
import { api } from "@/lib/api";

/**
 * The currency this household counts in, read from the household itself.
 *
 * Screens used to assume SEK. A household created in another currency then got
 * a form that said SEK, submitted SEK, and was refused every account (FPR-001).
 * Asking the household is the only way the answer can be right for all of them.
 */
export function useHouseholdCurrency(householdId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["households", "list"],
    queryFn: () => api.listHouseholds(),
    enabled: Boolean(householdId),
    staleTime: 5 * 60 * 1000,
  });

  const household = query.data?.find((row) => row.id === householdId) ?? null;

  return {
    currency: (household?.baseCurrency ?? "SEK") as CurrencyCode,
    supported: household?.currencySupported ?? true,
    isOwner: household?.role === "OWNER",
    household,
    isLoading: query.isLoading,
  };
}
