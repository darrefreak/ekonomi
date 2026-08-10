"use client";

import { createApiClient } from "@ffos/api-client";

const TOKEN_KEY = "ffos.accessToken";
const REFRESH_KEY = "ffos.refreshToken";
const HOUSEHOLD_KEY = "ffos.householdId";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getHouseholdId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(HOUSEHOLD_KEY);
}

export function setSession(tokens: {
  accessToken: string;
  refreshToken: string;
}) {
  localStorage.setItem(TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
}

export function setHouseholdId(id: string) {
  localStorage.setItem(HOUSEHOLD_KEY, id);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(HOUSEHOLD_KEY);
}

/**
 * A session that can no longer be refreshed ends the visit.
 *
 * This used to only clear the stored tokens, which left the authenticated shell
 * on screen — sidebar, page title, empty cards — while every query behind it
 * answered 401. A revoked or expired session showed up as a product that had
 * silently stopped working rather than as a request to sign in again. The
 * intended URL is carried along so signing in returns to the page that was
 * being read.
 *
 * A full document navigation is deliberate: it discards the React tree holding
 * the previous household's data instead of trusting every cache to drop it.
 */
let redirectingToSignIn = false;

function endSession() {
  clearSession();
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  if (pathname.startsWith("/login") || pathname.startsWith("/onboarding")) return;
  if (redirectingToSignIn) return;
  redirectingToSignIn = true;
  const next = encodeURIComponent(`${pathname}${search}`);
  window.location.replace(`/login?next=${next}`);
}

export const api = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
  getAccessToken,
  getRefreshToken,
  onTokensRefreshed: setSession,
  onAuthFailure: endSession,
});
