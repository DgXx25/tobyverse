"use client";

import { UiIcon } from "@/components/workspace/ui-icon";
import type { ChatArtifact } from "@/types/chat";

function kindIcon(kind: ChatArtifact["kind"]) {
  if (kind === "practice") return <UiIcon name="practice" size={18} />;
  if (kind === "plan") return <UiIcon name="plan" size={18} />;
  return <UiIcon name="notes" size={18} />;
}

function subtitleFor(artifact: ChatArtifact): string | null {
  const count = artifact.count ?? artifact.ids?.length;
  if (artifact.kind === "practice") {
    return count ? `${count} questions` : null;
  }
  if (artifact.kind === "sheet" || artifact.kind === "plan") {
    return count ? `${count} blocks` : null;
  }
  return count ? `${count}` : null;
}

export function ArtifactCard({
  artifact,
  onOpen,
}: {
  artifact: ChatArtifact;
  onOpen: () => void;
}) {
  const title = artifact.title.trim() || (artifact.kind === "practice" ? "Practice" : artifact.kind === "plan" ? "Plan" : "Notes");
  const subtitle = subtitleFor(artifact);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-4 text-left transition-colors hover:border-accent hover:bg-surface-2"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-foreground">
        {kindIcon(artifact.kind)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-medium text-foreground">{title}</span>
        {subtitle ? <span className="mt-0.5 block text-[13px] text-muted">{subtitle}</span> : null}
      </span>
    </button>
  );
}
