"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeMaterials } from "@/lib/materials/store";
import { subscribeStudySheets } from "@/lib/study-sheets/store";
import { generateStudySheetFromPrompt } from "@/lib/study-sheets/generate-client";
import type { Material } from "@/types/material";
import type { StudySheet } from "@/types/study-sheet";
import { NoteDocument } from "@/components/visuals/note-document";

export function StudySheetsPanel({
  projectId,
  userId,
  projectTitle,
  focusId = null,
}: {
  projectId: string;
  userId: string;
  projectTitle: string;
  focusId?: string | null;
}) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [sheets, setSheets] = useState<StudySheet[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubMaterials = subscribeMaterials(projectId, setMaterials);
    const unsubSheets = subscribeStudySheets(
      projectId,
      (items) => {
        setSheets(items);
        setActiveId((current) => {
          const focus = focusId ?? current;
          if (focus && items.some((item) => item.id === focus)) return focus;
          return items[0]?.id ?? null;
        });
      },
      (err) => setError(err.message),
    );
    return () => {
      unsubMaterials();
      unsubSheets();
    };
  }, [projectId, focusId]);

  useEffect(() => {
    if (!focusId) return;
    if (sheets.some((item) => item.id === focusId)) setActiveId(focusId);
  }, [focusId, sheets]);

  const active = useMemo(
    () => sheets.find((item) => item.id === activeId) ?? null,
    [activeId, sheets],
  );

  async function rebuild() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const sheet = await generateStudySheetFromPrompt({
        projectId,
        userId,
        projectTitle,
        materials,
        prompt: "Rebuild notes from the project materials and recent chat.",
      });
      setActiveId(sheet.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rebuild the sheet.");
    } finally {
      setBusy(false);
    }
  }

  function openSheet(id: string) {
    setActiveId(id);
  }

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-72 shrink-0 flex-col border-r border-border">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-foreground">Notes</h2>
          <p className="mt-1 text-[11px] text-muted">Created from chat.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void rebuild()}
            className="mt-3 text-[11px] text-muted hover:text-foreground disabled:opacity-40"
          >
            {busy ? "Working…" : "Rebuild from materials"}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {sheets.length === 0 && (
            <p className="px-1 text-xs text-muted">None yet. Choose Study in chat and send a prompt.</p>
          )}
          <div className="space-y-1">
            {sheets.map((sheet) => (
              <button
                key={sheet.id}
                type="button"
                onClick={() => openSheet(sheet.id)}
                className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-xs ${
                  sheet.id === activeId ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {sheet.title}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {error && <p className="mb-4 text-xs text-red-400">{error}</p>}
        {!active && (
          <div className="mx-auto max-w-sm pt-24 text-center">
            <p className="text-sm text-foreground">No notes open</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Ask for notes in chat. They open from the card.
            </p>
          </div>
        )}
        {active && (
          <div className="mx-auto max-w-2xl">
            <NoteDocument note={active} />
          </div>
        )}
      </div>
    </div>
  );
}
