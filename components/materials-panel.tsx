"use client";

import { useRef, useState } from "react";
import { removeMaterial } from "@/lib/materials/save";
import {
  ingestMaterialFile,
  ingestMaterialPaste,
  ingestMaterialUrl,
} from "@/lib/materials/ingest-client";
import { MaterialRow } from "@/components/workspace/material-row";
import { MATERIAL_FILE_ACCEPT } from "@/lib/materials/types";
import type { Material } from "@/types/material";

export function MaterialsPanel({
  projectId,
  userId,
  items,
  selectedIds,
  onToggleSelect,
}: {
  projectId: string;
  userId: string;
  items: Material[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteBody, setPasteBody] = useState("");
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [urlTitle, setUrlTitle] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function run(work: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save material.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-foreground">Materials</h2>
            <p className="mt-1 text-xs text-muted">
              Files stay in this project. Select rows to ground chat.
            </p>
          </div>
          <div className="flex gap-1.5">
            <input
              ref={fileRef}
              type="file"
              accept={MATERIAL_FILE_ACCEPT}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void run(() => ingestMaterialFile({ projectId, userId, file }));
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="rounded-md bg-foreground px-3 py-1.5 text-[11px] font-medium text-background disabled:opacity-40"
            >
              {busy ? "Working…" : "Upload"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPasteOpen((open) => !open);
                setUrlOpen(false);
              }}
              className="rounded-md px-3 py-1.5 text-[11px] text-muted hover:bg-surface-2 hover:text-foreground"
            >
              Paste
            </button>
            <button
              type="button"
              onClick={() => {
                setUrlOpen((open) => !open);
                setPasteOpen(false);
              }}
              className="rounded-md px-3 py-1.5 text-[11px] text-muted hover:bg-surface-2 hover:text-foreground"
            >
              Link
            </button>
          </div>
        </div>

        {urlOpen && (
          <div className="mb-4 space-y-2 rounded-lg border border-border bg-surface p-3">
            <input
              value={urlTitle}
              onChange={(event) => setUrlTitle(event.target.value)}
              placeholder="Title (optional)"
              className="w-full bg-transparent text-sm outline-none"
            />
            <input
              value={urlValue}
              onChange={(event) => setUrlValue(event.target.value)}
              placeholder="https://…"
              className="w-full bg-transparent text-sm outline-none"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setUrlOpen(false)} className="text-[11px] text-muted">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !urlValue.trim()}
                onClick={() =>
                  void run(async () => {
                    await ingestMaterialUrl({
                      projectId,
                      userId,
                      url: urlValue.trim(),
                      title: urlTitle.trim() || undefined,
                    });
                    setUrlValue("");
                    setUrlTitle("");
                    setUrlOpen(false);
                  })
                }
                className="text-[11px] text-foreground disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {pasteOpen && (
          <div className="mb-4 space-y-2 rounded-lg border border-border bg-surface p-3">
            <input
              value={pasteTitle}
              onChange={(event) => setPasteTitle(event.target.value)}
              placeholder="Title"
              className="w-full bg-transparent text-sm outline-none"
            />
            <textarea
              value={pasteBody}
              onChange={(event) => setPasteBody(event.target.value)}
              rows={5}
              placeholder="Paste source notes — saved as a material."
              className="w-full resize-none bg-transparent text-sm outline-none"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPasteOpen(false)} className="text-[11px] text-muted">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !pasteBody.trim()}
                onClick={() =>
                  void run(async () => {
                    await ingestMaterialPaste({
                      projectId,
                      userId,
                      text: pasteBody,
                      title: pasteTitle.trim() || undefined,
                    });
                    setPasteBody("");
                    setPasteTitle("");
                    setPasteOpen(false);
                  })
                }
                className="text-[11px] text-foreground disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {error && <p className="mb-4 text-xs text-red-400">{error}</p>}

        {items.length === 0 && (
          <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
            <p className="text-sm text-foreground">No materials yet</p>
            <p className="mt-1 text-xs text-muted">
              Drop a file on the workspace, paste notes, or add a URL.
            </p>
          </div>
        )}

        <div className="space-y-0.5">
          {items.map((item) => (
            <MaterialRow
              key={item.id}
              item={item}
              selected={selectedIds.includes(item.id)}
              onSelect={() => onToggleSelect(item.id)}
              pendingDelete={pendingDelete === item.id}
              onDelete={() => {
                if (pendingDelete !== item.id) {
                  setPendingDelete(item.id);
                  return;
                }
                void removeMaterial(item)
                  .then(() => setPendingDelete(null))
                  .catch((err: unknown) => {
                    setError(err instanceof Error ? err.message : "Could not delete material.");
                  });
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
