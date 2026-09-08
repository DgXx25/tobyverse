"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeExercises, type ProjectExercise } from "@/lib/exercises";
import { savePracticeIndex } from "@/lib/workspace/practice-progress";
import { ExercisePlayer, type ExercisePlayerHandle } from "@/components/exercises/exercise-player";
import { UiIcon } from "@/components/workspace/ui-icon";

export function PracticeSession({
  projectId,
  userId,
  setId,
  ids,
  startIndex,
  onExit,
}: {
  projectId: string;
  userId: string;
  setId: string;
  ids: string[];
  startIndex: number;
  onExit: () => void;
}) {
  const [items, setItems] = useState<ProjectExercise[]>([]);
  const [index, setIndex] = useState(startIndex);
  const [checked, setChecked] = useState(false);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const playerRef = useRef<ExercisePlayerHandle>(null);

  useEffect(() => {
    return subscribeExercises(projectId, (next) => {
      const focused = ids.length ? next.filter((item) => ids.includes(item.id)) : next;
      const ordered = ids.length
        ? ids.flatMap((id) => focused.filter((item) => item.id === id))
        : focused;
      setItems(ordered.length ? ordered : next);
    });
  }, [projectId, ids]);

  useEffect(() => {
    setIndex(Math.min(startIndex, Math.max(0, items.length - 1)));
  }, [startIndex, items.length]);

  const persist = useCallback(
    (nextIndex: number) => {
      savePracticeIndex(projectId, setId, nextIndex);
    },
    [projectId, setId],
  );

  const active = items[index] ?? null;

  useEffect(() => {
    if (active?.type === "unsupported") {
      setReady(true);
      setChecked(true);
    }
  }, [active?.id, active?.type]);

  async function onCheck() {
    if (!ready || checked || checking) return;
    setChecking(true);
    try {
      await playerRef.current?.check();
      setChecked(true);
    } finally {
      setChecking(false);
    }
  }

  function onContinue() {
    if (!checked) return;
    if (index >= items.length - 1) {
      persist(0);
      onExit();
      return;
    }
    const next = index + 1;
    setIndex(next);
    setChecked(false);
    setReady(false);
    persist(next);
  }

  const total = items.length || ids.length || 1;
  const progress = ((index + (checked ? 1 : 0)) / total) * 100;

  return (
    <div className="flex h-full min-h-0 flex-col bg-transparent">
      <header className="flex h-12 shrink-0 items-center gap-3 px-4">
        <button
          type="button"
          onClick={() => {
            persist(index);
            onExit();
          }}
          className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
          aria-label="Stop practice"
        >
          <UiIcon name="close" size={20} />
        </button>
        <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-foreground transition-[width] duration-200" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-8 py-8">
        {active ? (
          <ExercisePlayer
            key={active.id}
            ref={playerRef}
            item={active}
            userId={userId}
            checked={checked}
            onReadyChange={setReady}
          />
        ) : (
          <p className="text-sm text-muted">No exercise in this set yet.</p>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-end border-t border-border px-6 py-4">
        <button
          type="button"
          disabled={checked ? false : !ready || checking}
          onClick={() => (checked ? onContinue() : void onCheck())}
          className="rounded-2xl bg-foreground px-8 py-3 text-sm font-semibold uppercase tracking-wide text-background disabled:bg-surface-2 disabled:text-muted"
        >
          {checked ? "Continue" : checking ? "Checking" : "Check"}
        </button>
      </footer>
    </div>
  );
}
