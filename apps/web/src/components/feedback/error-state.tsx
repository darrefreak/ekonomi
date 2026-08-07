export function ErrorState({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-[16px] border border-border bg-surface-elevated px-5 py-6">
      <h2 className="text-lg font-medium text-text-primary">{title}</h2>
      <p className="mt-2 text-sm text-text-secondary">{description}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 min-h-11 rounded-[12px] border border-border-strong px-4 text-sm"
        >
          Försök igen
        </button>
      ) : null}
    </div>
  );
}
