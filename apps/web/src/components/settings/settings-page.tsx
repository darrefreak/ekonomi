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

const POLICY_OPTIONS = [
  "FULL_DETAILS",
  "AGGREGATES_ONLY",
  "BALANCE_ONLY",
  "OWNER_ONLY",
] as const;

export function SettingsPage() {
  const router = useRouter();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [name, setName] = useState("");
  const [locale, setLocale] = useState<"sv-SE" | "en-US">("sv-SE");
  const [appearance, setAppearance] = useState<"system" | "light" | "dark">(
    "system",
  );
  const [minCash, setMinCash] = useState("");
  const [emergency, setEmergency] = useState("");
  const [safety, setSafety] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [memberPolicies, setMemberPolicies] = useState<Record<string, string>>(
    {},
  );

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
    const policies: Record<string, string> = {};
    for (const m of settings.members ?? []) {
      policies[m.id] = m.personalDataPolicy;
    }
    setMemberPolicies(policies);
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
      let next = await api.updateSettings({
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

      for (const m of data.members ?? []) {
        const selected = memberPolicies[m.id];
        if (selected && selected !== m.personalDataPolicy) {
          next = await api.updateSettings({
            householdId: data.householdId,
            memberPolicy: {
              memberId: m.id,
              personalDataPolicy: selected as (typeof POLICY_OPTIONS)[number],
            },
          });
        }
      }

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
      await logout();
      await loginWithDemo();
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo-laddning misslyckades");
    } finally {
      setDemoBusy(false);
    }
  }

  async function exportPrivacy() {
    if (!data) return;
    setPrivacyBusy(true);
    setError(null);
    setMessage(null);
    try {
      const exported = await api.exportPrivacyData(data.householdId);
      const blob = new Blob([JSON.stringify(exported, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ffos-export-${data.householdId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Personlig data exporterad.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export misslyckades");
    } finally {
      setPrivacyBusy(false);
    }
  }

  async function requestDelete() {
    if (!data) return;
    setPrivacyBusy(true);
    setError(null);
    setMessage(null);
    try {
      const req = await api.requestPrivacyDelete({
        householdId: data.householdId,
        kind: "delete_personal",
        note: "Begäran från inställningar",
      });
      setMessage(`Raderingsbegäran registrerad (${req.status}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Begäran misslyckades");
    } finally {
      setPrivacyBusy(false);
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
          Hushåll, privacy-policies och demodata
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
        <h2 className="text-sm text-text-secondary">Medlemmar & privacy</h2>
        <p className="mt-2 text-xs text-text-muted">
          OWNER/ADMIN kan ändra personalDataPolicy. Servern redigerar andras
          personliga konton/transaktioner enligt policy.
        </p>
        <ul className="mt-3 space-y-3 text-sm">
          {(data.members ?? []).map((m) => (
            <li
              key={m.id}
              className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <span>
                {m.displayName} · {m.role}
              </span>
              <select
                className="min-h-11 rounded-[12px] border border-border bg-surface px-3 text-sm"
                value={memberPolicies[m.id] ?? m.personalDataPolicy}
                onChange={(e) =>
                  setMemberPolicies((prev) => ({
                    ...prev,
                    [m.id]: e.target.value,
                  }))
                }
              >
                {POLICY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Integritet (export / radera)</h2>
        <p className="text-xs text-text-muted">
          Export hämtar din personliga data nu. Radering skapar en begäran
          (foundation) som auditas.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={privacyBusy}
            className="min-h-11 rounded-[12px] border border-border-strong px-4 text-sm disabled:opacity-60"
            onClick={() => void exportPrivacy()}
          >
            Exportera min data
          </button>
          <button
            type="button"
            disabled={privacyBusy}
            className="min-h-11 rounded-[12px] border border-border-strong px-4 text-sm disabled:opacity-60"
            onClick={() => void requestDelete()}
          >
            Begär radering
          </button>
        </div>
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
              void logout().then(() => router.replace("/login"));
            }}
          >
            Logga ut
          </button>
        </div>
      </section>
    </div>
  );
}
