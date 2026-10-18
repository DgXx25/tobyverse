"use client";

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="popup-backdrop fixed inset-0 z-50 flex items-center justify-center px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
    >
      <div className="popup-surface w-full max-w-sm rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-md px-3 py-1.5 text-sm text-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded-md bg-red-500/90 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
