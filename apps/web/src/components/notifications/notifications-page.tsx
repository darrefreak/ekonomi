"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { NotificationsResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { describeError } from "@/lib/error-message";

const notificationTypeLabels: Record<string, string> = {
  INFO: "Information",
  WARNING: "Behöver uppmärksamhet",
  ERROR: "Problem",
  OPPORTUNITY: "Möjlighet",
  REMINDER: "Påminnelse",
};

export function NotificationsPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const id = await ensureHouseholdSession();
    setHouseholdId(id);
    setData(await api.getNotifications(id));
  }, []);

  useEffect(() => {
    void load()
      .catch((err: unknown) =>
        setError(describeError(err, "Kunde inte hämta notiser")),
      )
      .finally(() => setLoading(false));
  }, [load]);

  if (loading) return <LoadingState label="Hämtar notiser…" />;
  if (error || !data) {
    return <ErrorState title="Kunde inte hämta notiser" description={error ?? ""} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
            Notiser
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            {data.unreadCount} olästa
          </p>
        </div>
        <button
          type="button"
          className="min-h-11 rounded-[12px] border border-border px-4 text-sm"
          onClick={() => {
            if (!householdId) return;
            void api
              .markAllNotificationsRead(householdId)
              .then(setData)
              .catch((err: unknown) =>
                setError(describeError(err, "Kunde inte uppdatera notiserna")),
              );
          }}
        >
          Markera alla lästa
        </button>
      </div>

      {data.items.length === 0 ? (
        <EmptyState title="Inga notiser" description="Allt ser lugnt ut." />
      ) : (
        <ul className="space-y-3">
          {data.items.map((n) => (
            <li
              key={n.id}
              className="rounded-[16px] bg-surface-elevated p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase text-text-muted">
                    {notificationTypeLabels[n.type] ?? "Notis"}
                  </p>
                  <p className="mt-1 font-medium">{n.title}</p>
                  {n.body ? (
                    <p className="mt-1 text-sm text-text-secondary">{n.body}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-text-muted">
                    {new Date(n.createdAt).toLocaleString("sv-SE")}
                    {n.readAt ? " · läst" : " · oläst"}
                  </p>
                  {n.href ? (
                    <Link
                      href={n.href}
                      className="mt-2 inline-flex min-h-11 items-center text-sm text-accent"
                    >
                      Öppna →
                    </Link>
                  ) : null}
                </div>
                {!n.readAt && householdId ? (
                  <button
                    type="button"
                    className="min-h-11 px-2 text-sm text-accent"
                    onClick={() =>
                      void api
                        .markNotificationRead(householdId, n.id)
                        .then(setData)
                    }
                  >
                    Markera läst
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
