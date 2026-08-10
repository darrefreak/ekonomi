"use client";

import {
  api,
  clearSession,
  getAccessToken,
  getHouseholdId,
  getRefreshToken,
  setHouseholdId,
  setSession,
} from "./api";

export { getHouseholdId, getAccessToken };

export const DEMO_CREDENTIALS = {
  email: "demo@ffos.local",
  password: "demo-password-123",
} as const;

export class AuthRequiredError extends Error {
  constructor(message = "Inloggning krävs") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export function hasSession(): boolean {
  return Boolean(getAccessToken());
}

export function hasHouseholdSession(): boolean {
  return Boolean(getAccessToken() && getHouseholdId());
}

export async function loginWithCredentials(
  email: string,
  password: string,
): Promise<string> {
  const loggedIn = await api.login({ email, password });
  setSession(loggedIn.tokens);
  const households = await api.listHouseholds();
  if (!households[0]) {
    clearSession();
    throw new Error("Inget hushåll kopplat till kontot");
  }
  setHouseholdId(households[0].id);
  return households[0].id;
}

export async function loginWithDemo(): Promise<string> {
  return loginWithCredentials(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password);
}

/** Requires an existing browser session. Does not auto-login or register. */
export async function ensureHouseholdSession(): Promise<string> {
  const householdId = getHouseholdId();
  if (getAccessToken() && householdId) return householdId;
  throw new AuthRequiredError();
}

/** Revoke refresh token server-side when possible, then clear local session. */
export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  try {
    if (getAccessToken()) {
      await api.logout(refreshToken ? { refreshToken } : {});
    }
  } catch {
    // Local clear still required if API is unreachable or token already invalid.
  }
  clearSession();
}

export function setHouseholdAfterCreate(householdId: string): void {
  setHouseholdId(householdId);
}

export async function registerWithCredentials(
  email: string,
  password: string,
  displayName: string,
): Promise<"onboarding" | string> {
  const registered = await api.register({ email, password, displayName });
  setSession(registered.tokens);
  const households = await api.listHouseholds();
  if (!households[0]) return "onboarding";
  setHouseholdId(households[0].id);
  return households[0].id;
}
