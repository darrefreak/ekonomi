"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SettingsResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import {
  DEMO_CREDENTIALS,
  ensureHouseholdSession,
  loginWithDemo,
  logout,
} from "@/lib/session";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { minorToKronorInput, kronorToMinorString } from "@/lib/money-input";

export function SettingsPage() {
  const router = useRouter();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [name, setName] = useState("");
  const [locale, setLocale] = useState<"sv-SE" | "en-US">("sv-SE");
  const [appearance, setAppearance] = useState<"system" | "light" | "dark">(
    "system",
  );
  const [minCash, setMinCash] = useState("");
  const [emergency, setEmergency] = useState("");
  const [safety, setSafety] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const id = await ensureHouseholdSession();
    const settings = await api.getSettings(id);
    setData(settings);
    setName(settings.householdName);
    setLocale(settings.locale === "en-US" ? "en-US" : "sv-SE");
    setAppearance(settings.appearance);
    setMinCash(
      minorToKronorInput(settings.financialPolicies.minimumCashBalanceMinor),
    );
    setEmergency(
      minorToKronorInput(settings.financialPolicies.emergencyFundTargetMinor),
    );
    setSafety(minorToKronorInput(settings.financialPolicies.safetyMarginMinor));
  }, []);

  useEffect(() => {
    void load()
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [load]);

  async function save() {
    if (!data) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const next = await api.updateSettings({
        householdId: data.householdId,
        householdName: name.trim(),
        locale,
        appearance,
        financialPolicies: {
          minimumCashBalanceMinor:
            kronorToMinorString(minCash) ??
            data.financialPolicies.minimumCashBalanceMinor,
          emergencyFundTargetMinor:
            kronorToMinorString(emergency) ??
            data.financialPolicies.emergencyFundTargetMinor,
          safetyMarginMinor:
            kronorToMinorString(safety) ??
            data.financialPolicies.safetyMarginMinor,
        },
      });
      setData(next);
      setMessage("Inställningar sparade.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  }

  async function reloadDemo() {
    setDemoBusy(true);
    setError(null);
    setMessage(null);
    try {
      const info = await api.getDemoInfo();
      if (info.reseedAllowed) {
        await api.loadDemo();
        setMessage("Demodata omladdad. Loggar in på demo-kontot…");
      }
      logout();
      await loginWithDemo();
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo-laddning misslyckades");
    } finally {
      setDemoBusy(false);
    }
  }

  if (loading) return <LoadingState label="Hämtar inställningar…" />;
  if (error && !data) {
    return <ErrorState title="Kunde inte hämta inställningar" description={error} />;
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Inställningar
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Hushåll, policies och demodata
        </p>
      </div>

      {message ? <p className="text-sm text-positive">{message}</p> : null}
      {error ? (
        <p className="text-sm text-warning" role="alert">
          {error}
        </p>
      ) : null}

      <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Hushåll</h2>
        <label className="block text-sm">
          <span className="text-text-muted">Namn</span>
          <input
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-text-muted">Språk</span>
            <select
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3"
              value={locale}
              onChange={(e) => setLocale(e.target.value as "sv-SE" | "en-US")}
            >
              <option value="sv-SE">Svenska</option>
              <option value="en-US">English</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">Utseende</span>
            <select
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3"
              value={appearance}
              onChange={(e) =>
                setAppearance(e.target.value as "system" | "light" | "dark")
              }
            >
              <option value="system">System</option>
              <option value="light">Ljust</option>
              <option value="dark">Mörkt (sparas; tema i O)</option>
            </select>
          </label>
        </div>
      </section>

      <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Finansiella policies (SEK)</h2>
        <label className="block text-sm">
          <span className="text-text-muted">Minsta kassabalans</span>
          <input
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3"
            value={minCash}
            onChange={(e) => setMinCash(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-muted">Buffertmål</span>
          <input
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3"
            value={emergency}
            onChange={(e) => setEmergency(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-muted">Säkerhetsmarginal</span>
          <input
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3"
            value={safety}
            onChange={(e) => setSafety(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={saving}
          className="min-h-11 rounded-[12px] bg-accent px-4 text-sm text-white disabled:opacity-60"
          onClick={() => void save()}
        >
          {saving ? "Sparar…" : "Spara"}
        </button>
      </section>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Medlemmar & privacy (persistens)</h2>
        <p className="mt-2 text-xs text-text-muted">
          Policy lagras här; auktoriseringshandhavande kommer i Workstream N.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {(data.members ?? []).map((m) => (
            <li key={m.id} className="flex justify-between gap-3">
              <span>
                {m.displayName} · {m.role}
              </span>
              <span className="text-text-muted">{m.personalDataPolicy}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Demo-laddare</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-text-secondary">E-post</dt>
            <dd className="font-mono text-xs">{DEMO_CREDENTIALS.email}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-text-secondary">Lösenord</dt>
            <dd className="font-mono text-xs">{DEMO_CREDENTIALS.password}</dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={demoBusy}
            className="min-h-11 rounded-[12px] bg-accent px-4 text-sm text-white disabled:opacity-60"
            onClick={() => void reloadDemo()}
          >
            {demoBusy ? "Laddar…" : "Ladda om demodata"}
          </button>
          <button
            type="button"
            className="min-h-11 rounded-[12px] border border-border-strong px-4 text-sm"
            onClick={() => {
              logout();
              router.replace("/login");
            }}
          >
            Logga ut
          </button>
        </div>
      </section>
    </div>
  );
}
