"use client";

import { api, getAccessToken, getHouseholdId, setHouseholdId, setSession } from "./api";

export async function ensureHouseholdSession(): Promise<string> {
  let householdId = getHouseholdId();
  if (getAccessToken() && householdId) return householdId;

  try {
    const loggedIn = await api.login({
      email: "demo@ffos.local",
      password: "demo-password-123",
    });
    setSession(loggedIn.tokens);
    const households = await api.listHouseholds();
    if (households[0]) {
      setHouseholdId(households[0].id);
      return households[0].id;
    }
  } catch {
    // fall through
  }

  const registered = await api.register({
    email: `demo+${Date.now()}@ffos.local`,
    password: "demo-password-123",
    displayName: "Demo-användare",
  });
  setSession(registered.tokens);
  const household = await api.createHousehold({
    name: "Familjen Demo",
    baseCurrency: "SEK",
  });
  setHouseholdId(household.id);
  return household.id;
}
