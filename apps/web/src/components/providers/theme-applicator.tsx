"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getHouseholdId, hasSession } from "@/lib/session";
import { queryKeys } from "@/lib/query-keys";

const STORAGE_KEY = "ffos-appearance";

export type AppearanceMode = "system" | "light" | "dark";

export function readStoredAppearance(): AppearanceMode | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === "system" || raw === "light" || raw === "dark") return raw;
  return null;
}

export function writeStoredAppearance(value: AppearanceMode) {
  window.localStorage.setItem(STORAGE_KEY, value);
}

function resolveDark(mode: AppearanceMode, prefersDark: boolean): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return prefersDark;
}

function applyDarkClass(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
}

/**
 * Applies household appearance setting to `<html class="dark">` so design-token
 * CSS variables flip. Falls back to localStorage / system before settings load.
 */
export function ThemeApplicator() {
  const householdId = hasSession() ? getHouseholdId() : null;
  const [prefersDark, setPrefersDark] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false,
  );

  const settingsQuery = useQuery({
    queryKey: householdId
      ? queryKeys.settings.all(householdId)
      : ["settings", "theme-pending"],
    queryFn: () => api.getSettings(householdId!),
    enabled: Boolean(householdId),
    staleTime: 60_000,
  });

  const appearance: AppearanceMode =
    settingsQuery.data?.appearance ??
    readStoredAppearance() ??
    "system";

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setPrefersDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (settingsQuery.data?.appearance) {
      writeStoredAppearance(settingsQuery.data.appearance);
    }
  }, [settingsQuery.data?.appearance]);

  useEffect(() => {
    applyDarkClass(resolveDark(appearance, prefersDark));
  }, [appearance, prefersDark]);

  return null;
}
