"use client";

import { UiIcon } from "@/components/workspace/ui-icon";
import type { ChatArtifact, ChatArtifactStep } from "@/types/chat";
import type { StudyPath } from "@/types/path";
import { findNode, flattenNodes, progressCounts } from "@/lib/paths/model";
import type { SetResult } from "@/lib/exercises/session";

function kindIcon(kind: ChatArtifact["kind"]) {
  if (kind === "practice") return <UiIcon name="check" size={18} />;
  if (kind === "plan" || kind === "path") return <UiIcon name="plan" size={18} />;
  return <UiIcon name="notes" size={18} />;
}

function pathAdvanceStep(path: StudyPath): ChatArtifactStep {
  const { done, total } = progressCounts(path.courses);
  const current = findNode(path, path.currentNodeId)?.node;
  const lastDone = [...flattenNodes(path.courses)].filter((node) => node.status === "done").at(-1);
  const to = current && current.status !== "done" ? current.title : undefined;
  return {
    ...(lastDone?.title ? { from: lastDone.title } : {}),
    ...(to ? { to } : {}),
    done,
    total,
  };
}

function resolvePathStep(
  artifact: ChatArtifact,
  path?: StudyPath | null,
  showAdvance?: boolean,
): ChatArtifactStep | undefined {
  const saved = artifact.step;
  const derived = showAdvance && path ? pathAdvanceStep(path) : undefined;
  if (!saved && !derived) return undefined;
  return {
    from: saved?.from || derived?.from,
    to: saved?.to || derived?.to,
    done: saved?.done ?? derived?.done,
    total: saved?.total ?? derived?.total,
  };
}

function subtitleFor(artifact: ChatArtifact, step?: ChatArtifactStep, result?: SetResult | null): string | null {
  if (result) {
    const score = `${result.correct}/${result.total}`;
    if (result.mode === "exam") {
      if (result.passed) return `${score} · Pass`;
      return `${score}`;
    }
    return score;
  }
  if (artifact.kind === "path" && step && (step.done != null || step.total != null)) {
    const done = step.done ?? 0;
    const total = step.total ?? artifact.count;
    if (total != null) return `${done} / ${total}`;
  }
  const count = artifact.count ?? artifact.ids?.length;
  if (artifact.kind === "practice") {
    return count ? `${count} questions` : null;
  }
  if (artifact.kind === "path") {
    return count ? `${count} topics` : "Course path";
  }
  if (artifact.kind === "sheet" || artifact.kind === "plan") {
    return count ? `${count} blocks` : null;
  }
  return count ? `${count}` : null;
}

export function ArtifactCard({
  artifact,
  onOpen,
  onStart,
  path,
  showAdvance,
  result,
  bare = false,
}: {
  artifact: ChatArtifact;
  onOpen: () => void;
  onStart?: () => void;
  path?: StudyPath | null;
  showAdvance?: boolean;
  result?: SetResult | null;
  ka?: boolean;
  bare?: boolean;
}) {
  const exam = artifact.kind === "practice" && artifact.mode === "exam";
  const title = artifact.kind === "practice"
    ? exam ? "Exam" : "Quiz"
    : artifact.title.trim() || (artifact.kind === "path" || artifact.kind === "plan" ? "Path" : "Notes");
  const step = artifact.kind === "path" ? resolvePathStep(artifact, path, showAdvance) : undefined;
  const subtitle = subtitleFor(artifact, step, result);
  const label = [title, step?.from, step?.to, subtitle].filter(Boolean).join(" ");
  const setCard = artifact.kind === "practice" && onStart;
  const frame = bare
    ? "flex w-full items-center gap-3 bg-surface px-3 py-3 text-left hover:bg-surface-2"
    : "flex w-full items-center gap-3 rounded-2xl bg-surface px-3 py-3 text-left transition-colors hover:bg-white/10";

  const body = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-foreground">
        {kindIcon(artifact.kind)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-foreground">{title}</span>
        {subtitle ? <span className="mt-0.5 block text-[13px] text-muted">{subtitle}</span> : null}
        {step?.from || step?.to ? (
          <span className="mt-2.5 flex flex-col gap-1.5">
            {step.from ? (
              <span className="path-step-from flex min-w-0 items-center gap-2 text-[13px] text-muted">
                <span className="path-step-check flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                  <UiIcon name="check" size={12} />
                </span>
                <span className="min-w-0 truncate line-through decoration-border">{step.from}</span>
              </span>
            ) : null}
            {step.to ? (
              <span className="path-step-to flex min-w-0 items-center gap-2 text-[13px] text-foreground">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent text-accent">
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                </span>
                <span className="min-w-0 truncate">{step.to}</span>
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
      {setCard ? (
        <span className="shrink-0 rounded-full bg-surface px-3 py-1.5 text-[13px] text-foreground">
          {result ? "Again" : "Start"}
        </span>
      ) : null}
    </>
  );

  if (setCard) {
    return (
      <button
        type="button"
        onClick={onStart}
        aria-label={label}
        className={frame}
      >
        {body}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className={frame}
    >
      {body}
    </button>
  );
}
