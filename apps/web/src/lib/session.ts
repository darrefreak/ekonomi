"use client";

import {
  api,
  clearSession,
  getAccessToken,
  getHouseholdId,
  setHouseholdId,
  setSession,
} from "./api";

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

export function logout(): void {
  clearSession();
}
