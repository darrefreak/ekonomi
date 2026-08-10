export type FreshnessConnectionStatus =
  | "CONNECTED"
  | "SYNCING"
  | "AUTH_REQUIRED"
  | "DEGRADED"
  | "ERROR"
  | "DISCONNECTED"
  | string;

/**
 * Compute an honest Swedish freshness label from sync timestamp + connection status.
 * Uses `asOf` (YYYY-MM-DD) as the reference clock for deterministic demos.
 */
export function computeFreshnessLabel(input: {
  lastSyncedAt: Date | string | null | undefined;
  connectionStatus: FreshnessConnectionStatus;
  asOf: string;
}): string {
  const status = input.connectionStatus;
  if (status === "AUTH_REQUIRED") return "omautentisering krävs";
  if (status === "DISCONNECTED") return "frånkopplad";
  if (status === "ERROR") return "fel";
  if (status === "DEGRADED") return "försämrad anslutning";
  if (status === "SYNCING") return "synkar…";

  if (!input.lastSyncedAt) return "aldrig synkad";

  const synced =
    typeof input.lastSyncedAt === "string"
      ? new Date(input.lastSyncedAt)
      : input.lastSyncedAt;
  if (Number.isNaN(synced.getTime())) return "okänd freshness";

  const asOfMs = new Date(`${input.asOf}T12:00:00.000Z`).getTime();
  const deltaMs = asOfMs - synced.getTime();
  if (deltaMs < 2 * 60_000) return "just nu";

  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 60) return `${minutes} min sedan`;

  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h sedan`;

  const days = Math.floor(hours / 24);
  return `${days} d sedan`;
}

/** Household-level summary for dashboard header. */
export function summarizeFreshness(
  sources: Array<{
    connectionStatus: FreshnessConnectionStatus;
    freshnessLabel: string | null;
    lastSyncedAt: Date | string | null | undefined;
  }>,
  asOf: string,
): string {
  const active = sources.filter((s) => s.connectionStatus !== "DISCONNECTED");
  if (active.length === 0) {
    return sources.length ? "Inga aktiva källor" : "Ingen data";
  }
  if (active.some((s) => s.connectionStatus === "AUTH_REQUIRED")) {
    return "omautentisering krävs";
  }
  if (active.some((s) => s.connectionStatus === "ERROR")) {
    return "synkfel";
  }
  if (active.some((s) => s.connectionStatus === "DEGRADED")) {
    return "försämrad anslutning";
  }

  const labels = active.map((s) =>
    computeFreshnessLabel({
      lastSyncedAt: s.lastSyncedAt,
      connectionStatus: s.connectionStatus,
      asOf,
    }),
  );
  if (labels.some((l) => l.includes(" d sedan") && parseInt(l, 10) >= 7)) {
    return "föråldrad data";
  }
  // Prefer the stalest non-status label for honesty
  const ageRank = (label: string): number => {
    if (label === "just nu") return 0;
    const m = label.match(/^(\d+) min sedan$/);
    if (m) return Number(m[1]);
    const h = label.match(/^(\d+) h sedan$/);
    if (h) return Number(h[1]) * 60;
    const d = label.match(/^(\d+) d sedan$/);
    if (d) return Number(d[1]) * 24 * 60;
    if (label === "aldrig synkad") return 1_000_000;
    return 500;
  };
  return labels.sort((a, b) => ageRank(b) - ageRank(a))[0] ?? "okänd freshness";
}
