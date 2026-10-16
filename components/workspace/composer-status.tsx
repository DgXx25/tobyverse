"use client";

export type ComposerStatusState = {
  text: string;
  error?: boolean;
  onRetry?: () => void;
};

export function ComposerStatus({ status }: { status: ComposerStatusState | null }) {
  if (!status) return null;
  return (
    <div className="flex h-7 items-center gap-2 px-2 text-[12px] leading-none" aria-live="polite">
      <p className={`min-w-0 truncate ${status.error ? "text-red-400" : "text-muted"}`}>{status.text}</p>
      {status.onRetry ? (
        <button
          type="button"
          onClick={status.onRetry}
          className="shrink-0 text-muted hover:text-foreground"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function uploadStatusText(title: string, kind: "file" | "url", _ka: boolean): string {
  if (kind === "url") return `Reading · ${title}`;
  return `Uploading · ${title}`;
}

export function generateStatusText(
  kind: "notes" | "practice" | "path" | "extract",
  _ka: boolean,
): string {
  if (kind === "notes") return "Writing notes";
  if (kind === "practice") return "Generating quiz";
  if (kind === "path") return "Mapping the path";
  return "Extracting";
}
