"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CategoryDto, SettingsResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import {
  DEMO_CREDENTIALS,
  ensureHouseholdSession,
  loginWithDemo,
  logout,
} from "@/lib/session";
import { useHouseholdId } from "@/lib/use-household-id";
import { queryKeys } from "@/lib/query-keys";
import { minorToKronorInput, kronorToMinorString } from "@/lib/money-input";
import { MEMBER_ROLE_LABELS, PRIVACY_POLICY_LABELS } from "@/lib/account-labels";
import { ErrorState } from "../feedback/error-state";
import { LearnedRulesSection } from "./learned-rules-section";
import { LoadingState } from "../feedback/loading-state";
import { writeStoredAppearance } from "../providers/theme-applicator";
import { describeError } from "@/lib/error-message";

const POLICY_OPTIONS = [
  "FULL_DETAILS",
  "AGGREGATES_ONLY",
  "BALANCE_ONLY",
  "OWNER_ONLY",
] as const;

const INVITE_ROLES = ["ADMIN", "ADULT", "VIEWER", "CHILD"] as const;

export function SettingsPage() {
  const router = useRouter();
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: householdId ? queryKeys.settings.all(householdId) : ["settings", "pending"],
    queryFn: () => api.getSettings(householdId!),
    enabled: Boolean(householdId),
  });

  const invalidateSettings = async () => {
    if (!householdId) return;
    await queryClient.invalidateQueries({ queryKey: queryKeys.settings.all(householdId) });
  };

  const data = settingsQuery.data;

  if (!householdId || settingsQuery.isLoading) return <LoadingState label="Hämtar inställningar…" />;
  if (settingsQuery.isError || !data) {
    return (
      <ErrorState
        title="Kunde inte hämta inställningar"
        description={
          settingsQuery.error instanceof Error ? settingsQuery.error.message : "Något gick fel"
        }
        onRetry={() => void settingsQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Inställningar
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Hushåll, medlemmar, policies och integritet.
        </p>
      </div>

      {message ? (
        <p className="text-sm text-positive" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-warning" role="alert">
          {error}
        </p>
      ) : null}

      <HouseholdSection
        householdId={householdId}
        data={data}
        onSaved={async () => {
          setMessage("Hushåll sparat.");
          setError(null);
          await invalidateSettings();
        }}
        onError={setError}
      />

      <MembersSection
        householdId={householdId}
        data={data}
        onChanged={async (msg) => {
          setMessage(msg);
          setError(null);
          await invalidateSettings();
        }}
        onError={setError}
      />

      <CurrencySection data={data} />

      <PoliciesSection
        data={data}
        onSaved={async () => {
          setMessage("Finansiella policies sparade.");
          setError(null);
          await invalidateSettings();
        }}
        onError={setError}
      />

      <CategoriesSection householdId={householdId} onError={setError} />

      <LearnedRulesSection householdId={householdId} />

      <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Notiser</h2>
        <p className="text-sm text-text-secondary">
          Hantera notisinställningar och läs olästa notiser på notissidan.
        </p>
        <Link
          href="/notifications"
          className="inline-flex min-h-11 items-center rounded-[12px] border border-border-strong px-4 text-sm"
        >
          Öppna notiser
        </Link>
      </section>

      <SecuritySection router={router} />

      <PrivacySection householdId={householdId} />

      <AppearanceSection
        data={data}
        onSaved={async () => {
          setMessage("Utseende sparat.");
          setError(null);
          await invalidateSettings();
        }}
        onError={setError}
      />

      <AuditLogsSection householdId={householdId} onError={setError} />

      <AnalysisRunsSection householdId={householdId} onError={setError} />

      <DemoSection router={router} onError={setError} />
    </div>
  );
}

function AuditLogsSection({
  householdId,
  onError,
}: {
  householdId: string;
  onError: (msg: string | null) => void;
}) {
  const query = useQuery({
    queryKey: queryKeys.settings.auditLogs(householdId),
    queryFn: () => api.getAuditLogs(householdId),
  });

  if (query.isLoading) {
    return (
      <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Auditlogg</h2>
        <p className="text-sm text-text-muted">Hämtar…</p>
      </section>
    );
  }

  if (query.isError) {
    return (
      <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Auditlogg</h2>
        <p className="text-sm text-text-secondary">
          Kräver OWNER/ADMIN.{" "}
          {query.error instanceof Error ? query.error.message : "Kunde inte hämta."}
        </p>
        <button
          type="button"
          className="min-h-11 rounded-[12px] border border-border-strong px-4 text-sm"
          onClick={() => {
            onError(null);
            void query.refetch();
          }}
        >
          Försök igen
        </button>
      </section>
    );
  }

  const items = query.data?.items ?? [];

  return (
    <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
      <div>
        <h2 className="text-sm text-text-secondary">Auditlogg</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Senaste hushållshändelser (OWNER/ADMIN).
        </p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-text-muted">Inga poster ännu.</p>
      ) : (
        <ul className="divide-y divide-border rounded-[12px] border border-border">
          {items.slice(0, 20).map((row) => (
            <li key={row.id} className="px-4 py-3 text-sm">
              <p className="font-medium">
                {row.action} · {row.entity}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {new Date(row.createdAt).toLocaleString("sv-SE")}
                {row.entityId ? ` · ${row.entityId.slice(0, 8)}…` : ""}
                {` · ${row.source}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AnalysisRunsSection({
  householdId,
  onError,
}: {
  householdId: string;
  onError: (msg: string | null) => void;
}) {
  const query = useQuery({
    queryKey: queryKeys.settings.analysisRuns(householdId),
    queryFn: () => api.getAnalysisRuns(householdId),
  });

  if (query.isLoading) {
    return (
      <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Jobbstatus</h2>
        <p className="text-sm text-text-muted">Hämtar…</p>
      </section>
    );
  }

  if (query.isError) {
    return (
      <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Jobbstatus</h2>
        <p className="text-sm text-warning">
          {query.error instanceof Error ? query.error.message : "Kunde inte hämta."}
        </p>
        <button
          type="button"
          className="min-h-11 rounded-[12px] border border-border-strong px-4 text-sm"
          onClick={() => {
            onError(null);
            void query.refetch();
          }}
        >
          Försök igen
        </button>
      </section>
    );
  }

  const items = query.data?.items ?? [];

  return (
    <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
      <div>
        <h2 className="text-sm text-text-secondary">Jobbstatus</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Senaste analyskörningar (metrics, forecast, opportunities, anomalies…).
        </p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-text-muted">
          Inga körningar registrerade ännu. Körningar skapas när bakgrundsjobb körs.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-[12px] border border-border">
          {items.slice(0, 15).map((row) => (
            <li key={row.id} className="px-4 py-3 text-sm">
              <p className="font-medium">
                {row.kind} · {row.status}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                as of {row.asOf} · {new Date(row.startedAt).toLocaleString("sv-SE")}
                {row.errorCode ? ` · ${row.errorCode}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HouseholdSection({
  householdId,
  data,
  onSaved,
  onError,
}: {
  householdId: string;
  data: SettingsResponse;
  onSaved: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [name, setName] = useState(data.householdName);
  const [locale, setLocale] = useState<"sv-SE" | "en-US">(
    data.locale === "en-US" ? "en-US" : "sv-SE",
  );

  useEffect(() => {
    setName(data.householdName);
    setLocale(data.locale === "en-US" ? "en-US" : "sv-SE");
  }, [data.householdName, data.locale]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Hushållets namn kan inte vara tomt.");
      const id = await ensureHouseholdSession();
      return api.updateSettings({
        householdId: id,
        householdName: name.trim(),
        locale,
      });
    },
    onSuccess: async () => {
      onError(null);
      await onSaved();
    },
    onError: (err: unknown) => {
      onError(describeError(err, "Kunde inte spara hushållet"));
    },
  });

  return (
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
      <button
        type="button"
        disabled={saveMutation.isPending || householdId === undefined}
        className="min-h-11 rounded-[12px] bg-accent px-4 text-sm text-on-accent disabled:opacity-60"
        onClick={() => void saveMutation.mutate()}
      >
        {saveMutation.isPending ? "Sparar…" : "Spara"}
      </button>
    </section>
  );
}

function MembersSection({
  householdId,
  data,
  onChanged,
  onError,
}: {
  householdId: string;
  data: SettingsResponse;
  onChanged: (msg: string) => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<(typeof INVITE_ROLES)[number]>("ADULT");

  const updatePolicyMutation = useMutation({
    mutationFn: async ({
      memberId,
      personalDataPolicy,
    }: {
      memberId: string;
      personalDataPolicy: string;
    }) => {
      const id = await ensureHouseholdSession();
      return api.updateSettings({
        householdId: id,
        memberPolicy: {
          memberId,
          personalDataPolicy: personalDataPolicy as (typeof POLICY_OPTIONS)[number],
        },
      });
    },
    onSuccess: async () => {
      onError(null);
      await onChanged("Sekretesspolicy uppdaterad.");
    },
    onError: (err: unknown) => {
      onError(describeError(err, "Kunde inte uppdatera policyn"));
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({
      memberId,
      role,
    }: {
      memberId: string;
      role: (typeof INVITE_ROLES)[number];
    }) => {
      return api.updateMemberRole(memberId, { householdId, role });
    },
    onSuccess: async () => {
      onError(null);
      await onChanged("Roll uppdaterad.");
    },
    onError: (err: unknown) => {
      onError(
        describeError(err, "Kunde inte uppdatera rollen"),
      );
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (memberId: string) => {
      return api.removeMember(householdId, memberId);
    },
    onSuccess: async () => {
      onError(null);
      await onChanged("Medlem borttagen.");
    },
    onError: (err: unknown) => {
      onError(
        describeError(err, "Kunde inte ta bort medlemmen"),
      );
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      if (!inviteEmail.trim()) throw new Error("Ange en e-postadress att bjuda in.");
      return api.inviteMember({ householdId, email: inviteEmail.trim(), role: inviteRole });
    },
    onSuccess: async () => {
      onError(null);
      setInviteEmail("");
      await onChanged("Inbjudan skickad.");
    },
    onError: (err: unknown) => {
      onError(
        describeError(err, "Kunde inte skicka inbjudan"),
      );
    },
  });

  const cancelInviteMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      return api.cancelInvitation(householdId, invitationId);
    },
    onSuccess: async () => {
      onError(null);
      await onChanged("Inbjudan avbruten.");
    },
    onError: (err: unknown) => {
      onError(
        describeError(err, "Kunde inte avbryta inbjudan"),
      );
    },
  });

  return (
    <section className="space-y-4 rounded-[16px] bg-surface-elevated p-5">
      <div>
        <h2 className="text-sm text-text-secondary">Medlemmar</h2>
        <p className="mt-1 text-xs text-text-muted">
          OWNER/ADMIN kan ändra roller, sekretesspolicy och bjuda in nya medlemmar.
        </p>
      </div>

      <ul className="space-y-3 text-sm">
        {(data.members ?? []).map((m) => (
          <li
            key={m.id}
            className="flex flex-col gap-2 rounded-[12px] border border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="min-w-0 truncate">{m.displayName}</span>
            <div className="flex flex-wrap items-center gap-2">
              {m.role === "OWNER" ? (
                <span className="min-h-11 rounded-[12px] border border-border px-3 text-sm leading-[2.75rem] text-text-secondary">
                  {MEMBER_ROLE_LABELS.OWNER}
                </span>
              ) : (
                <select
                  aria-label={`Roll för ${m.displayName ?? "medlemmen"}`}
                  className="min-h-11 rounded-[12px] border border-border bg-surface px-3 text-sm"
                  value={m.role}
                  disabled={updateRoleMutation.isPending}
                  onChange={(e) =>
                    updateRoleMutation.mutate({
                      memberId: m.id,
                      role: e.target.value as (typeof INVITE_ROLES)[number],
                    })
                  }
                >
                  {INVITE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {MEMBER_ROLE_LABELS[r] ?? r}
                    </option>
                  ))}
                </select>
              )}
              <select
                aria-label={`Insyn i personliga uppgifter för ${m.displayName ?? "medlemmen"}`}
                className="min-h-11 rounded-[12px] border border-border bg-surface px-3 text-sm"
                value={m.personalDataPolicy}
                disabled={updatePolicyMutation.isPending}
                onChange={(e) =>
                  updatePolicyMutation.mutate({
                    memberId: m.id,
                    personalDataPolicy: e.target.value,
                  })
                }
              >
                {POLICY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {PRIVACY_POLICY_LABELS[opt] ?? opt}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={removeMutation.isPending || m.role === "OWNER"}
                title={m.role === "OWNER" ? "Ägare kan inte tas bort" : undefined}
                onClick={() => {
                  if (window.confirm(`Ta bort ${m.displayName} från hushållet?`)) {
                    removeMutation.mutate(m.id);
                  }
                }}
                className="min-h-11 rounded-[12px] border border-border-strong px-3 text-sm disabled:opacity-40"
              >
                Ta bort
              </button>
            </div>
          </li>
        ))}
      </ul>

      {(data.invitations ?? []).length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-text-secondary">Väntande inbjudningar</h3>
          <ul className="space-y-2 text-sm">
            {(data.invitations ?? []).map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-3 rounded-[12px] border border-border px-3 py-2"
              >
                <span className="min-w-0 truncate">
                  {inv.email} · {MEMBER_ROLE_LABELS[inv.role] ?? inv.role}
                </span>
                <button
                  type="button"
                  disabled={cancelInviteMutation.isPending}
                  onClick={() => cancelInviteMutation.mutate(inv.id)}
                  className="min-h-11 shrink-0 rounded-[12px] border border-border-strong px-3 text-sm"
                >
                  Avbryt
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form
        noValidate
        /*
         * As on the account form: native `required` blocked submission and
         * showed the browser's own English bubble, so the Swedish message this
         * form already carries never ran.
         */
        onSubmit={(e) => {
          e.preventDefault();
          inviteMutation.mutate();
        }}
        className="space-y-2 rounded-[12px] border border-dashed border-border-strong p-3"
      >
        <h3 className="text-xs font-medium text-text-secondary">Bjud in medlem</h3>
        <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
          <input
            type="email"
            required
            value={inviteEmail}
            aria-label="E-post till den du bjuder in"
            autoComplete="off"
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="namn@example.com"
            className="min-h-11 rounded-[12px] border border-border bg-surface px-3 text-sm"
          />
          <select
            aria-label="Roll för inbjudan"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as (typeof INVITE_ROLES)[number])}
            className="min-h-11 rounded-[12px] border border-border bg-surface px-3 text-sm"
          >
            {INVITE_ROLES.map((r) => (
              <option key={r} value={r}>
                {MEMBER_ROLE_LABELS[r] ?? r}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={inviteMutation.isPending}
            className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-60"
          >
            {inviteMutation.isPending ? "Skickar…" : "Bjud in"}
          </button>
        </div>
      </form>
    </section>
  );
}

function CurrencySection({ data }: { data: SettingsResponse }) {
  const currency = data.financialPolicies.currency;

  /*
   * The household's currency is stated, not chosen.
   *
   * This was a selector offering EUR, USD, NOK and DKK, labelled "Hushållets
   * basvaluta" — while a household's base currency is immutable and the engine
   * can only aggregate SEK. Choosing another wrote a *different* field
   * (`financialPolicies.currency`), so the control both misnamed itself and
   * could not do what it appeared to offer. Same reasoning as the account form.
   */
  return (
    <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
      <h2 className="text-sm text-text-secondary">Valuta</h2>
      <div className="block text-sm">
        <span className="text-text-muted">Hushållets basvaluta</span>
        <div
          data-testid="settings-base-currency"
          className="mt-1 flex min-h-11 w-full max-w-xs items-center rounded-[12px] border border-border bg-surface-muted px-3 text-text"
        >
          {currency}
        </div>
        <p className="mt-1 text-xs text-text-muted">
          Alla summor räknas i {currency}. Valutan kan inte ändras för ett
          hushåll som redan innehåller bokföring. Fler valutor kommer senare.
        </p>
      </div>
    </section>
  );
}

function PoliciesSection({
  data,
  onSaved,
  onError,
}: {
  data: SettingsResponse;
  onSaved: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [minCash, setMinCash] = useState(
    minorToKronorInput(data.financialPolicies.minimumCashBalanceMinor),
  );
  const [emergency, setEmergency] = useState(
    minorToKronorInput(data.financialPolicies.emergencyFundTargetMinor),
  );
  const [safety, setSafety] = useState(
    minorToKronorInput(data.financialPolicies.safetyMarginMinor),
  );
  const [savingsRate, setSavingsRate] = useState(
    String(data.financialPolicies.savingsRateTargetPercent),
  );
  const [fixedCostRatio, setFixedCostRatio] = useState(
    String(data.financialPolicies.maxFixedCostRatioPercent),
  );
  const [investTarget, setInvestTarget] = useState(
    minorToKronorInput(data.financialPolicies.investmentContributionTargetMinor),
  );

  useEffect(() => {
    setMinCash(minorToKronorInput(data.financialPolicies.minimumCashBalanceMinor));
    setEmergency(minorToKronorInput(data.financialPolicies.emergencyFundTargetMinor));
    setSafety(minorToKronorInput(data.financialPolicies.safetyMarginMinor));
    setSavingsRate(String(data.financialPolicies.savingsRateTargetPercent));
    setFixedCostRatio(String(data.financialPolicies.maxFixedCostRatioPercent));
    setInvestTarget(
      minorToKronorInput(data.financialPolicies.investmentContributionTargetMinor),
    );
  }, [data.financialPolicies]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const minimumCashBalanceMinor = kronorToMinorString(minCash);
      const emergencyFundTargetMinor = kronorToMinorString(emergency);
      const safetyMarginMinor = kronorToMinorString(safety);
      const investmentContributionTargetMinor = kronorToMinorString(investTarget);
      const savingsRateTargetPercent = Number(savingsRate);
      const maxFixedCostRatioPercent = Number(fixedCostRatio);
      if (
        minimumCashBalanceMinor == null ||
        emergencyFundTargetMinor == null ||
        safetyMarginMinor == null ||
        investmentContributionTargetMinor == null
      ) {
        throw new Error("Alla belopp måste anges i kronor (t.ex. 5000 eller 5000,50).");
      }
      if (
        Number.isNaN(savingsRateTargetPercent) ||
        savingsRateTargetPercent < 0 ||
        savingsRateTargetPercent > 100
      ) {
        throw new Error("Sparkvot måste vara mellan 0 och 100 procent.");
      }
      if (
        Number.isNaN(maxFixedCostRatioPercent) ||
        maxFixedCostRatioPercent < 0 ||
        maxFixedCostRatioPercent > 100
      ) {
        throw new Error("Max fasta kostnader måste vara mellan 0 och 100 procent.");
      }
      const id = await ensureHouseholdSession();
      return api.updateSettings({
        householdId: id,
        financialPolicies: {
          minimumCashBalanceMinor,
          emergencyFundTargetMinor,
          safetyMarginMinor,
          savingsRateTargetPercent,
          maxFixedCostRatioPercent,
          investmentContributionTargetMinor,
        },
      });
    },
    onSuccess: async () => {
      onError(null);
      await onSaved();
    },
    onError: (err: unknown) => {
      onError(describeError(err, "Kunde inte spara policyerna"));
    },
  });

  return (
    <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
      <h2 className="text-sm text-text-secondary">
        Finansiella policies ({data.financialPolicies.currency})
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm">
          <span className="text-text-muted">Minsta kassabalans (kr)</span>
          <input
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 tabular-nums"
            value={minCash}
            onChange={(e) => setMinCash(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-muted">Buffertmål (kr)</span>
          <input
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 tabular-nums"
            value={emergency}
            onChange={(e) => setEmergency(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-muted">Säkerhetsmarginal (kr)</span>
          <input
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 tabular-nums"
            value={safety}
            onChange={(e) => setSafety(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-muted">Investeringsmål / mån (kr)</span>
          <input
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 tabular-nums"
            value={investTarget}
            onChange={(e) => setInvestTarget(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-muted">Målsatt sparkvot (%)</span>
          <input
            inputMode="decimal"
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 tabular-nums"
            value={savingsRate}
            onChange={(e) => setSavingsRate(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-muted">Max fasta kostnader (%)</span>
          <input
            inputMode="decimal"
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 tabular-nums"
            value={fixedCostRatio}
            onChange={(e) => setFixedCostRatio(e.target.value)}
          />
        </label>
      </div>
      <button
        type="button"
        disabled={saveMutation.isPending}
        className="min-h-11 rounded-[12px] bg-accent px-4 text-sm text-on-accent disabled:opacity-60"
        onClick={() => void saveMutation.mutate()}
      >
        {saveMutation.isPending ? "Sparar…" : "Spara"}
      </button>
    </section>
  );
}

function CategoriesSection({
  householdId,
  onError,
}: {
  householdId: string;
  onError: (msg: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"expense" | "income" | "transfer" | "other">("expense");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories.all(householdId, includeArchived),
    queryFn: () => api.listCategories(householdId, { includeArchived }),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["categories", householdId] });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Ange ett namn för kategorin.");
      return api.createCategory({ householdId, name: name.trim(), kind });
    },
    onSuccess: async () => {
      onError(null);
      setName("");
      await invalidate();
    },
    onError: (err: unknown) => {
      onError(
        describeError(err, "Kunde inte skapa kategorin"),
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (category: CategoryDto) => {
      if (!editingName.trim()) throw new Error("Namnet kan inte vara tomt.");
      return api.updateCategory(category.id, { householdId, name: editingName.trim() });
    },
    onSuccess: async () => {
      onError(null);
      setEditingId(null);
      await invalidate();
    },
    onError: (err: unknown) => {
      onError(
        describeError(err, "Kunde inte uppdatera kategorin"),
      );
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (categoryId: string) => api.archiveCategory(householdId, categoryId),
    onSuccess: async () => {
      onError(null);
      await invalidate();
    },
    onError: (err: unknown) => {
      onError(
        describeError(err, "Kunde inte arkivera kategorin"),
      );
    },
  });

  const categories = categoriesQuery.data?.items ?? [];

  return (
    <section className="space-y-4 rounded-[16px] bg-surface-elevated p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm text-text-secondary">Kategorier</h2>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          Visa arkiverade
        </label>
      </div>

      {categoriesQuery.isLoading ? (
        <p className="text-sm text-text-muted">Hämtar kategorier…</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {categories.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-2 rounded-[12px] border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              {editingId === c.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="min-h-11 flex-1 rounded-[12px] border border-border bg-surface px-3"
                  />
                  <button
                    type="button"
                    disabled={updateMutation.isPending}
                    onClick={() => updateMutation.mutate(c)}
                    className="min-h-11 rounded-[12px] bg-accent px-3 text-sm text-on-accent"
                  >
                    Spara
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="min-h-11 rounded-[12px] border border-border-strong px-3 text-sm"
                  >
                    Avbryt
                  </button>
                </div>
              ) : (
                <>
                  <span className="min-w-0 truncate">
                    {c.name}
                    <span className="ml-2 text-xs text-text-muted">
                      {c.kind}
                      {c.archivedAt ? " · arkiverad" : ""}
                    </span>
                  </span>
                  <div className="flex gap-2">
                    {c.isSystem ? (
                      <span className="rounded-full bg-surface-muted px-2 py-1 text-[11px] text-text-muted">
                        Systemkategori
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(c.id);
                            setEditingName(c.name);
                          }}
                          className="min-h-11 rounded-[12px] border border-border-strong px-3 text-sm"
                        >
                          Redigera
                        </button>
                        {!c.archivedAt ? (
                          <button
                            type="button"
                            disabled={archiveMutation.isPending}
                            onClick={() => {
                              if (window.confirm(`Arkivera kategorin "${c.name}"?`)) {
                                archiveMutation.mutate(c.id);
                              }
                            }}
                            className="min-h-11 rounded-[12px] border border-border-strong px-3 text-sm"
                          >
                            Arkivera
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
        className="grid gap-2 rounded-[12px] border border-dashed border-border-strong p-3 sm:grid-cols-[1fr_10rem_auto]"
      >
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Namn på ny kategori"
          placeholder="Ny kategori"
          className="min-h-11 rounded-[12px] border border-border bg-surface px-3 text-sm"
        />
        <select
          aria-label="Typ av kategori"
          value={kind}
          onChange={(e) =>
            setKind(e.target.value as "expense" | "income" | "transfer" | "other")
          }
          className="min-h-11 rounded-[12px] border border-border bg-surface px-3 text-sm"
        >
          <option value="expense">Utgift</option>
          <option value="income">Inkomst</option>
          <option value="transfer">Överföring</option>
          <option value="other">Övrigt</option>
        </select>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-60"
        >
          {createMutation.isPending ? "Skapar…" : "Skapa"}
        </button>
      </form>
    </section>
  );
}

function SecuritySection({ router }: { router: ReturnType<typeof useRouter> }) {
  const [busy, setBusy] = useState<"logout" | "revoke" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
      <h2 className="text-sm text-text-secondary">Säkerhet</h2>
      {msg ? <p className="text-sm text-text-secondary">{msg}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            setBusy("revoke");
            void api
              .revokeAll()
              .then(() => setMsg("Alla sessioner återkallade. Loggar ut…"))
              .catch((err: unknown) =>
                setMsg(describeError(err, "Kunde inte återkalla sessioner")),
              )
              .finally(async () => {
                setBusy(null);
                await logout();
                router.replace("/login");
              });
          }}
          className="min-h-11 rounded-[12px] border border-border-strong px-4 text-sm disabled:opacity-60"
        >
          {busy === "revoke" ? "Återkallar…" : "Återkalla alla sessioner"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            setBusy("logout");
            void logout().then(() => router.replace("/login"));
          }}
          className="min-h-11 rounded-[12px] border border-border px-4 text-sm disabled:opacity-60"
        >
          {busy === "logout" ? "Loggar ut…" : "Logga ut"}
        </button>
      </div>
    </section>
  );
}

function PrivacySection({ householdId }: { householdId: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const requestsQuery = useQuery({
    queryKey: queryKeys.privacy.requests(householdId),
    queryFn: () => api.listPrivacyRequests(householdId),
    retry: false,
  });

  async function exportPrivacy() {
    setBusy(true);
    setMsg(null);
    try {
      const exported = await api.exportPrivacyData(householdId);
      const blob = new Blob([JSON.stringify(exported, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ffos-export-${householdId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg("Personlig data exporterad.");
    } catch (err) {
      setMsg(describeError(err, "Export misslyckades"));
    } finally {
      setBusy(false);
    }
  }

  async function requestDelete() {
    setBusy(true);
    setMsg(null);
    try {
      const req = await api.requestPrivacyDelete({
        householdId,
        kind: "delete_personal",
        note: "Begäran från inställningar",
      });
      setMsg(`Raderingsbegäran registrerad (${req.status}).`);
      await requestsQuery.refetch();
    } catch (err) {
      setMsg(describeError(err, "Begäran misslyckades"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
      <h2 className="text-sm text-text-secondary">Integritet</h2>
      <p className="text-xs text-text-muted">
        Export hämtar din personliga data nu. Radering skapar en begäran som auditas.
      </p>
      {msg ? <p className="text-sm text-text-secondary">{msg}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="min-h-11 rounded-[12px] border border-border-strong px-4 text-sm disabled:opacity-60"
          onClick={() => void exportPrivacy()}
        >
          Exportera min data
        </button>
        <button
          type="button"
          disabled={busy}
          className="min-h-11 rounded-[12px] border border-border-strong px-4 text-sm disabled:opacity-60"
          onClick={() => void requestDelete()}
        >
          Begär radering
        </button>
      </div>
      {(requestsQuery.data?.items?.length ?? 0) > 0 ? (
        <ul className="space-y-1 text-xs text-text-muted">
          {requestsQuery.data!.items.map((r) => (
            <li key={r.id}>
              {r.kind} · {r.status} · {r.createdAt.slice(0, 10)}
            </li>
          ))}
        </ul>
      ) : null}

      <HouseholdCurrencyRemediation householdId={householdId} />

      <HouseholdErasure
        householdId={householdId}
        onChanged={() => void requestsQuery.refetch()}
      />
    </section>
  );
}

/**
 * A way out for a household created in a currency V1 cannot total.
 *
 * Such a household could be created through onboarding and could then never
 * open an account, with no way back (FPR-001). Migration is offered only while
 * the household holds no money: renaming the currency on an account holding
 * 100 EUR would turn it into 100 SEK, which is an invented exchange rate. When
 * money is present the backend refuses and says what has to be cleared first.
 */
function HouseholdCurrencyRemediation({ householdId }: { householdId: string }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const householdsQuery = useQuery({
    queryKey: ["households", "list"],
    queryFn: () => api.listHouseholds(),
  });
  const household = householdsQuery.data?.find((row) => row.id === householdId);

  if (!household || household.currencySupported) return null;

  async function migrate() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.migrateHouseholdBaseCurrency(householdId, "SEK");
      setMessage("Hushållet räknar nu i SEK. Du kan lägga till konton igen.");
      await queryClient.invalidateQueries({ queryKey: ["households", "list"] });
    } catch (err) {
      setError(describeError(err, "Bytet misslyckades"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="space-y-3 rounded-[12px] border border-warning/40 bg-warning/10 p-4"
      data-testid="household-currency-remediation"
    >
      <h3 className="text-sm font-medium text-text-primary">
        Hushållets valuta stöds inte
      </h3>
      <p className="text-xs text-text-muted">
        {household.name} räknar i {household.baseCurrency}, men den här
        versionen kan bara summera SEK. Inga konton kan läggas till förrän
        valutan är ändrad. Byte är bara tillåtet så länge hushållet är tomt —
        belopp räknas aldrig om automatiskt.
      </p>
      {message ? <p className="text-xs text-positive">{message}</p> : null}
      {error ? (
        <p className="text-xs text-negative" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy || household.role !== "OWNER"}
        className="min-h-11 rounded-[12px] border border-border-strong px-4 text-sm disabled:opacity-60"
        onClick={() => void migrate()}
      >
        {busy ? "Byter…" : "Byt till SEK"}
      </button>
      {household.role !== "OWNER" ? (
        <p className="text-xs text-text-muted">
          Bara hushållets ägare kan byta valuta.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Erasing a household is irreversible, so it takes two deliberate steps and the
 * participant has to type the household's name. Nothing here can happen by
 * accident from a single click.
 */
function HouseholdErasure({
  householdId,
  onChanged,
}: {
  householdId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const erasableQuery = useQuery({
    queryKey: ["privacy", "erasable"],
    queryFn: () => api.listErasableHouseholds(),
    retry: false,
  });
  const household = (erasableQuery.data?.items ?? []).find(
    (item) => item.id === householdId,
  );

  if (!household) return null;

  async function eraseHousehold() {
    setBusy(true);
    setError(null);
    try {
      const request = await api.requestPrivacyDelete({
        householdId,
        kind: "delete_household",
        note: "Radering begärd från inställningar",
      });
      const summary = await api.confirmErasure(request.id, {
        householdName: confirmation,
      });
      setStatus(
        `Hushållet är raderat (${summary.objectsRemoved} filer och ` +
          `${Object.values(summary.rowsRemoved ?? {}).reduce(
            (total, count) => total + count,
            0,
          )} poster togs bort).`,
      );
      setOpen(false);
      setConfirmation("");
      onChanged();
    } catch (err) {
      setError(describeError(err, "Raderingen misslyckades"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="space-y-3 rounded-[12px] border border-negative/40 p-4"
      data-testid="household-erasure"
    >
      <h3 className="text-sm font-medium text-text-primary">Radera hushållet</h3>
      <p className="text-xs text-text-muted">
        Raderar {household.name} och allt som hör till det: konton,
        transaktioner, bokföring, budget, fordon, dokument och uppladdade filer.
        Det går inte att ångra.
      </p>
      {status ? (
        <p className="text-sm text-text-secondary" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-negative" role="alert">
          {error}
        </p>
      ) : null}
      {!open ? (
        <button
          type="button"
          className="min-h-11 rounded-[12px] border border-negative/60 px-4 text-sm text-negative"
          onClick={() => setOpen(true)}
        >
          Radera hushållet…
        </button>
      ) : (
        <div className="space-y-2">
          <label className="block text-sm">
            <span className="text-text-secondary">
              Skriv <strong>{household.name}</strong> för att bekräfta
            </span>
            <input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || confirmation.trim() !== household.name.trim()}
              onClick={() => void eraseHousehold()}
              className="min-h-11 rounded-[12px] bg-negative px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Raderar…" : "Radera permanent"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setConfirmation("");
              }}
              className="min-h-11 rounded-[12px] border border-border-strong px-4 text-sm"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AppearanceSection({
  data,
  onSaved,
  onError,
}: {
  data: SettingsResponse;
  onSaved: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [appearance, setAppearance] = useState<"system" | "light" | "dark">(data.appearance);

  useEffect(() => {
    setAppearance(data.appearance);
  }, [data.appearance]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const id = await ensureHouseholdSession();
      writeStoredAppearance(appearance);
      document.documentElement.classList.toggle(
        "dark",
        appearance === "dark" ||
          (appearance === "system" &&
            window.matchMedia("(prefers-color-scheme: dark)").matches),
      );
      return api.updateSettings({ householdId: id, appearance });
    },
    onSuccess: async () => {
      onError(null);
      await onSaved();
    },
    onError: (err: unknown) => {
      onError(describeError(err, "Kunde inte spara utseendet"));
    },
  });

  return (
    <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
      <h2 className="text-sm text-text-secondary">Utseende</h2>
      <p className="text-xs text-text-muted">
        Tillämpas direkt på ytor och text via design tokens (system följer OS).
      </p>
      <select
        aria-label="Utseende"
        className="min-h-11 w-full max-w-xs rounded-[12px] border border-border bg-surface px-3 text-sm"
        value={appearance}
        onChange={(e) => setAppearance(e.target.value as "system" | "light" | "dark")}
      >
        <option value="system">System</option>
        <option value="light">Ljust</option>
        <option value="dark">Mörkt</option>
      </select>
      <button
        type="button"
        disabled={saveMutation.isPending}
        className="min-h-11 rounded-[12px] bg-accent px-4 text-sm text-on-accent disabled:opacity-60"
        onClick={() => void saveMutation.mutate()}
      >
        {saveMutation.isPending ? "Sparar…" : "Spara"}
      </button>
    </section>
  );
}

function DemoSection({
  router,
  onError,
}: {
  router: ReturnType<typeof useRouter>;
  onError: (msg: string | null) => void;
}) {
  const [demoBusy, setDemoBusy] = useState(false);

  async function reloadDemo() {
    setDemoBusy(true);
    onError(null);
    try {
      const info = await api.getDemoInfo();
      if (info.reseedAllowed) {
        await api.loadDemo();
      }
      await logout();
      await loginWithDemo();
      router.replace("/");
      router.refresh();
    } catch (err) {
      onError(describeError(err, "Demo-laddning misslyckades"));
    } finally {
      setDemoBusy(false);
    }
  }

  return (
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
      <div className="mt-4">
        <button
          type="button"
          disabled={demoBusy}
          className="min-h-11 rounded-[12px] bg-accent px-4 text-sm text-on-accent disabled:opacity-60"
          onClick={() => void reloadDemo()}
        >
          {demoBusy ? "Laddar…" : "Ladda om demodata"}
        </button>
      </div>
    </section>
  );
}
