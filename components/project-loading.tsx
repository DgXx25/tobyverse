export function ProjectLoading() {
  return (
    <div
      aria-label="Opening chat"
      className="project-workspace flex h-full min-h-0 flex-1 items-center justify-center bg-transparent"
    >
      <div className="flex items-center gap-2 text-[13px] text-muted" role="status">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
        <span>Opening chat…</span>
      </div>
    </div>
  );
}
