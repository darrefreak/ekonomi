"use client";

import { useEffect, useState } from "react";
import { getHouseholdId } from "@/lib/session";

/**
 * Reads the active household id from local storage after mount (avoids
 * SSR/CSR mismatch). `AuthShell` guarantees a household exists before any
 * protected page renders, so callers can treat a null value as "still
 * mounting" rather than "no household".
 */
export function useHouseholdId(): string | null {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  useEffect(() => {
    setHouseholdId(getHouseholdId());
  }, []);
  return householdId;
}
