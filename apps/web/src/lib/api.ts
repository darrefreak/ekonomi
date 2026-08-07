"use client";

import { createApiClient } from "@ffos/api-client";

const TOKEN_KEY = "ffos.accessToken";
const REFRESH_KEY = "ffos.refreshToken";
const HOUSEHOLD_KEY = "ffos.householdId";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
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

export const api = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
  getAccessToken,
});
