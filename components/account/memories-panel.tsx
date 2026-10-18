"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { UiIcon } from "@/components/workspace/ui-icon";
import { FREE_CAPS } from "@/lib/account/plan";
import { deleteMemory, subscribeMemories } from "@/lib/memory/store";
import { deleteLearningProfile, subscribeLearningProfile } from "@/lib/memory/profile";
import type { UserMemory } from "@/types/memory";
import { ObservationsPanel } from "@/components/account/observations-panel";

export function MemoriesPanel() {
  const { user } = useAuth();
  const userId = user?.uid ?? "";
  const [items, setItems] = useState<UserMemory[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState("");
  const [confirmClearProfile, setConfirmClearProfile] = useState(false);
  const [clearingProfile, setClearingProfile] = useState(false);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setProfile("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const stopMemories = subscribeMemories(
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
    const stopProfile = subscribeLearningProfile(userId, (next) => setProfile(next));
    return () => {
      stopMemories();
      stopProfile();
    };
  }, [userId]);

  async function remove(id: string) {
    setError(null);
    try {
      await deleteMemory(userId, id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete memory.");
    }
  }

  async function clearProfile() {
    setClearingProfile(true);
    setError(null);
    try {
      await deleteLearningProfile(userId);
      setProfile("");
      setConfirmClearProfile(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear preferences.");
    } finally {
      setClearingProfile(false);
    }
  }

  if (!userId) {
    return <p className="text-[15px] leading-7 text-muted">Sign in to manage memories.</p>;
  }

  return (
    <div>
      <ObservationsPanel key={userId} userId={userId} />
      <section>
        <h3 className="text-[15px] font-medium text-foreground">Preferences you shared</h3>
        <p className="mt-1 text-[14px] leading-6 text-muted">
          How you prefer to work, understand things, and communicate with TobyVerse.
        </p>
        {profile ? (
          <>
            <p className="mt-4 whitespace-pre-wrap text-[15px] leading-6 text-foreground">{profile}</p>
            <button
              type="button"
              onClick={() => setConfirmClearProfile(true)}
              className="mt-4 rounded-full border border-border px-4 py-1.5 text-[13px] text-foreground hover:bg-surface-2"
            >
              Clear
            </button>
          </>
        ) : (
          <p className="mt-4 text-[14px] leading-6 text-muted">
            Preferences you share with TobyVerse will appear here.
          </p>
        )}
      </section>

      <section className="mt-10">
        <h3 className="text-[15px] font-medium text-foreground">Response instructions</h3>
        <p className="mt-1 text-[15px] leading-7 text-muted">
          How Toby should reply. Not a biography. You can delete any of them.
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
              Nothing stored yet. Lasting reply preferences you ask Toby to keep will appear here.
            </p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex items-start gap-3 py-4">
                <p className="min-w-0 flex-1 text-[15px] leading-6 text-foreground">{item.content}</p>
                <button
                  type="button"
                  onClick={() => void remove(item.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-red-400"
                  aria-label="Delete memory"
                >
                  <UiIcon name="trash" size={16} />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {confirmClearProfile ? (
        <ConfirmDialog
          title="Clear shared preferences?"
          description="TobyVerse will forget this preference note. Other memories and observations are kept. This cannot be undone."
          confirmLabel="Clear"
          pending={clearingProfile}
          error={error}
          onConfirm={() => void clearProfile()}
          onCancel={() => setConfirmClearProfile(false)}
        />
      ) : null}
    </div>
  );
}
