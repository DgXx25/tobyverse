"use client";

import { useState } from "react";
import type { Project } from "@/types/project";

export function SettingsPanel({
  project,
  deleting,
  error,
  onDelete,
}: {
  project: Project;
  deleting: boolean;
  error: string | null;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-xl px-8 py-10">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Settings</p>
        <h2 className="mt-2 text-lg font-medium tracking-tight text-foreground">{project.title}</h2>
        <dl className="mt-6 space-y-4 text-sm">
          {project.description ? (
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted">Description</dt>
              <dd className="mt-1 leading-6 text-foreground/90">{project.description}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-12 border-t border-border pt-6">
          <p className="text-sm text-foreground">Delete this project</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Removes chat, materials, notes, and exercises. This cannot be undone.
          </p>
          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
          {confirm ? (
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirm(false)}
                disabled={deleting}
                className="rounded-md px-3 py-1.5 text-xs text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="rounded-md bg-red-500/90 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Confirm delete"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className="mt-4 rounded-md px-3 py-1.5 text-xs text-muted hover:bg-surface-2 hover:text-red-400"
            >
              Delete project
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
