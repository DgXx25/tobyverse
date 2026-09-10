"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { UiIcon } from "@/components/workspace/ui-icon";
import { FREE_CAPS } from "@/lib/account/plan";
import { deleteAllMemories, deleteMemory, subscribeMemories, updateMemory } from "@/lib/memory/store";
import { sanitizeMemoryContent } from "@/lib/memory/normalize";
import type { UserMemory } from "@/types/memory";

export function MemoriesPanel() {
  const { user } = useAuth();
  const userId = user?.uid ?? "";
  const [items, setItems] = useState<UserMemory[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribeMemories(
      userId,
      (next) => {
        setItems(next);
        setLoading(false);
      },
      () => {
        setLoading(false);
        setError("Could not load memories.");
      },
    );
  }, [userId]);

  async function saveEdit(memory: UserMemory) {
    const content = sanitizeMemoryContent(draft);
    if (!content) {
      await remove(memory.id);
      return;
    }
    if (content === memory.content) {
      setEditingId(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateMemory(userId, memory.id, content);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update memory.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await deleteMemory(userId, id);
      if (editingId === id) setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete memory.");
    }
  }

  async function clearAll() {
    setClearing(true);
    setError(null);
    try {
      await deleteAllMemories(userId);
      setConfirmClear(false);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear memories.");
    } finally {
      setClearing(false);
    }
  }

  if (!userId) {
    return <p className="text-[15px] leading-7 text-muted">Sign in to manage memories.</p>;
  }

  return (
    <div>
      <p className="text-[15px] leading-7 text-muted">
        Short facts TobyVerse follows automatically. You can edit or delete any of them.
      </p>
      <p className="mt-2 text-[13px] text-muted">
        {items.length} / {FREE_CAPS.memories} on the free plan
      </p>
      {error ? <p className="mt-3 text-[13px] text-red-400">{error}</p> : null}

      <div className="mt-6 divide-y divide-border">
        {loading && items.length === 0 ? (
          <p className="py-5 text-[14px] text-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="py-5 text-[14px] leading-6 text-muted">
            Nothing stored yet. Preferences and recurring instructions you share in chat will appear here.
          </p>
        ) : (
          items.map((item) => {
            const editing = editingId === item.id;
            return (
              <div key={item.id} className="flex items-start gap-3 py-4">
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setEditingId(null);
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                          event.preventDefault();
                          void saveEdit(item);
                        }
                      }}
                      rows={3}
                      className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-[14px] leading-6 text-foreground outline-none focus:border-foreground/40"
                    />
                  ) : (
                    <p className="text-[15px] leading-6 text-foreground">{item.content}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1 pt-0.5">
                  {editing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        disabled={saving}
                        className="rounded-full px-2.5 py-1 text-[13px] text-muted hover:text-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveEdit(item)}
                        disabled={saving}
                        className="rounded-full bg-foreground px-3 py-1 text-[13px] font-medium text-background disabled:opacity-50"
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(item.id);
                          setDraft(item.content);
                          setError(null);
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-foreground"
                        aria-label="Edit memory"
                      >
                        <UiIcon name="edit" size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(item.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-red-400"
                        aria-label="Delete memory"
                      >
                        <UiIcon name="trash" size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {items.length > 0 ? (
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          className="mt-4 rounded-full border border-border px-4 py-1.5 text-[13px] text-foreground hover:bg-surface-2"
        >
          Clear all memories
        </button>
      ) : null}

      {confirmClear ? (
        <ConfirmDialog
          title="Clear all memories?"
          description="TobyVerse will forget these facts. This cannot be undone."
          confirmLabel="Clear all"
          pending={clearing}
          error={error}
          onConfirm={() => void clearAll()}
          onCancel={() => setConfirmClear(false)}
        />
      ) : null}
    </div>
  );
}
