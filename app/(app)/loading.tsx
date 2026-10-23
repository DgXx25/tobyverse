export default function AppLoading() {
  return (
    <div className="min-h-full flex-1 px-5 py-8" role="status" aria-label="Loading page">
      <div className="mx-auto w-full max-w-3xl space-y-6 pt-12">
        <div className="ml-auto h-12 w-3/4 animate-pulse rounded-2xl bg-surface-2/60" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-surface-2/60" />
        <div className="space-y-3">
          <div className="h-3 w-full animate-pulse rounded bg-surface-2/60" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-surface-2/60" />
        </div>
      </div>
    </div>
  );
}
