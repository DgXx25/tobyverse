"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeExercises, type ProjectExercise } from "@/lib/exercises";
import { exerciseTypeLabel } from "@/lib/exercises/templates";
import { ExercisePlayer } from "@/components/exercises/exercise-player";
import type { Project } from "@/types/project";

export function ExercisesPanel({
  project,
  userId,
  focusIds = null,
}: {
  project: Project;
  userId: string;
  focusIds?: string[] | null;
}) {
  const [items, setItems] = useState<ProjectExercise[]>([]);
  const [index, setIndex] = useState(0);
  const picked = useRef(false);

  useEffect(() => {
    return subscribeExercises(project.id, (next) => {
      setItems(next);
      setIndex((current) => {
        if (focusIds?.length) {
          const found = next.findIndex((item) => focusIds.includes(item.id));
          if (found >= 0) return found;
        }
        if (!picked.current) return Math.max(0, next.length - 1);
        return Math.min(current, Math.max(0, next.length - 1));
      });
    });
  }, [project.id, focusIds]);

  useEffect(() => {
    if (!focusIds?.length) return;
    const found = items.findIndex((item) => focusIds.includes(item.id));
    if (found >= 0) setIndex(found);
  }, [focusIds, items]);

  const active = items[index] ?? null;

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-72 shrink-0 flex-col border-r border-border">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-foreground">Practice</h2>
          <p className="mt-1 text-[11px] text-muted">
            Sets are created from the composer. One item at a time.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {items.length === 0 && (
            <p className="px-1 text-xs text-muted">None yet. Choose Practice in chat and send a prompt.</p>
          )}
          <div className="space-y-1">
            {items.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  picked.current = true;
                  setIndex(itemIndex);
                }}
                className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-xs ${
                  itemIndex === index ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {itemIndex + 1}. {exerciseTypeLabel(item.type)}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {!active && (
          <div className="mx-auto max-w-sm pt-24 text-center">
            <p className="text-sm text-foreground">No exercise open</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              From chat, pick Practice and type what you want to train.
            </p>
          </div>
        )}
        {active && (
          <ExercisePlayer
            key={active.id}
            item={active}
            userId={userId}
            checked={false}
            onReadyChange={() => {}}
          />
        )}
      </div>
    </div>
  );
}
