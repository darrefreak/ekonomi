"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function MerchantPicker({
  householdId,
  value,
  onChange,
}: {
  householdId: string;
  value: string;
  onChange: (merchantId: string) => void;
}) {
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q.trim());

  const merchantsQuery = useQuery({
    queryKey: queryKeys.merchants.search(householdId, deferredQ),
    queryFn: () =>
      api.listMerchants(householdId, deferredQ || undefined),
  });

  const items = merchantsQuery.data?.items ?? [];
  const selected = useMemo(
    () => items.find((m) => m.id === value),
    [items, value],
  );

  return (
    <div className="space-y-2">
      <span className="text-sm text-text-secondary">Butik/motpart</span>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Sök namn eller alias…"
        className="min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
        aria-label="Sök butik"
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
      >
        <option value="">Ingen butik</option>
        {value && !selected ? (
          <option value={value}>Nuvarande val</option>
        ) : null}
        {items.map((m) => {
          const aliasHint =
            m.aliases && m.aliases.length > 0 ? ` · ${m.aliases[0]}` : "";
          return (
            <option key={m.id} value={m.id}>
              {m.canonicalName}
              {aliasHint}
            </option>
          );
        })}
      </select>
      {merchantsQuery.isFetching ? (
        <p className="text-xs text-text-muted">Söker…</p>
      ) : null}
      {merchantsQuery.isError ? (
        <p className="text-xs text-warning">Kunde inte hämta butiker</p>
      ) : null}
    </div>
  );
}
