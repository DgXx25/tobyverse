"use client";

import type { ChatArtifact } from "@/types/chat";

export function ArtifactCard({
  artifact,
  onOpen,
}: {
  artifact: ChatArtifact;
  onOpen: () => void;
}) {
  const label =
    artifact.kind === "practice"
      ? `Practice set · ${artifact.count ?? artifact.ids?.length ?? 0} items`
      : artifact.kind === "plan"
        ? `Study plan${artifact.count ? ` · ${artifact.count} items` : ""}`
        : "კონსპექტი";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-2 w-full max-w-md rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-accent hover:bg-surface-2"
    >
      <p className="text-sm text-foreground">{label}</p>
      <p className="mt-2 text-[11px] text-muted">Open</p>
    </button>
  );
}
