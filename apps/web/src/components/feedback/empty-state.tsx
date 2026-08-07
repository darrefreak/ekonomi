export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-[16px] border border-dashed border-border-strong bg-surface-elevated/60 px-5 py-8">
      <h2 className="font-[family-name:var(--ffos-font-display)] text-xl text-text-primary">
        {title}
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-text-secondary">
        {description}
      </p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-white"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
