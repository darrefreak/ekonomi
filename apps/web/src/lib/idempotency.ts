"use client";

import { useCallback, useRef } from "react";

function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Stable command key for one user submission.
 *
 * The same key is reused while the user is still trying to submit the same
 * intent (double-tap, retry after a network error), so the server collapses
 * them into one economic effect. `renew()` starts a genuinely new action and
 * must be called after a submission succeeds.
 */
export function useSubmissionKey() {
  const keyRef = useRef<string | null>(null);

  const current = useCallback(() => {
    if (!keyRef.current) keyRef.current = newKey();
    return keyRef.current;
  }, []);

  const renew = useCallback(() => {
    keyRef.current = newKey();
  }, []);

  return { current, renew };
}
