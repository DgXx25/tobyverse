export default function SharedChatLoading() {
  return (
    <main className="min-h-dvh bg-background px-6 pt-20" role="status" aria-label="Loading shared chat">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="h-4 w-28 animate-pulse rounded bg-surface-2" />
        <div className="space-y-3">
          <div className="h-3 w-3/4 animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-surface-2" />
        </div>
      </div>
    </main>
  );
}
