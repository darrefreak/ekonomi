export function LoadingState({ label = "Laddar…" }: { label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <p className="text-sm text-text-muted">{label}</p>
      <div className="h-24 animate-pulse rounded-[14px] bg-surface-muted" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="h-20 animate-pulse rounded-[14px] bg-surface-muted" />
        <div className="h-20 animate-pulse rounded-[14px] bg-surface-muted" />
        <div className="h-20 animate-pulse rounded-[14px] bg-surface-muted" />
        <div className="h-20 animate-pulse rounded-[14px] bg-surface-muted" />
      </div>
    </div>
  );
}
