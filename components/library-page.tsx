"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { useShell } from "@/components/workspace/shell-context";
import { UiIcon } from "@/components/workspace/ui-icon";
import { LibraryFilePreview } from "@/components/library-file-preview";
import { LibraryCardThumb } from "@/components/library-media";
import { displayFileTitle } from "@/lib/materials/viewer-files";
import { formatBytes, relativeTime } from "@/lib/format";
import { isLibraryImage } from "@/lib/library/media";
import { listLibraryItems, type LibraryItem } from "@/lib/library/items";
import { latestChatPath } from "@/lib/chats";
import { chatPath, projectHomePath } from "@/lib/workspace/routes";
import { LibraryNotePreview } from "@/components/library-note-preview";

type LibraryTab = "all" | "media" | "files" | "sheet";

const TABS: { id: LibraryTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "media", label: "Media" },
  { id: "files", label: "Files" },
  { id: "sheet", label: "Notes" },
];

function matchesTab(item: LibraryItem, tab: LibraryTab): boolean {
  if (item.kind === "path" || item.kind === "practice") return false;
  if (tab === "all") return true;
  if (tab === "media") return isLibraryImage(item);
  if (tab === "files") return item.kind === "material" && !isLibraryImage(item);
  return item.kind === tab;
}

function cardMeta(item: LibraryItem): string {
  const time = relativeTime(item.createdAt);
  const size = item.kind === "material" ? formatBytes(item.sizeBytes ?? 0) : item.meta;
  return [time, size].filter(Boolean).join(" · ");
}

export function LibraryPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { pendingPanel, setPendingPanel } = useShell();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<LibraryTab>("all");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<{ projectId: string; id: string; title?: string } | null>(null);
  const [notePreview, setNotePreview] = useState<LibraryItem | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const pillTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, bounce: 0.18, duration: 0.5 };

  useEffect(() => {
    if (user?.isAnonymous) {
      router.replace("/new");
      return;
    }
    if (!user) return;
    let cancelled = false;
    listLibraryItems(user.uid)
      .then((next) => {
        if (!cancelled) setItems(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load library.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  useEffect(() => {
    if (!pendingPanel || pendingPanel.kind !== "material") return;
    setPreview(pendingPanel);
    setPendingPanel(null);
  }, [pendingPanel, setPendingPanel]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (!matchesTab(item, tab)) return false;
      if (!needle) return true;
      return `${item.title} ${item.projectTitle} ${item.meta}`.toLowerCase().includes(needle);
    });
  }, [items, tab, query]);

  function openItem(item: LibraryItem) {
    if (item.kind === "material") {
      setPreview({ projectId: item.projectId, id: item.id, title: item.title });
      return;
    }
    if (item.kind === "sheet") {
      setNoteError(null);
      setNotePreview(item);
      return;
    }
    setPendingPanel({
      projectId: item.projectId,
      kind:
        item.artifact?.kind === "path"
          ? "path"
          : item.artifact?.kind === "plan"
            ? "plan"
            : item.kind === "practice"
              ? "practice"
              : "sheet",
      id: item.id,
      title: item.title,
    });
    latestChatPath(item.projectId).then((path) => {
      router.push(path ?? projectHomePath(item.projectId));
    });
  }

  if (user?.isAnonymous) return null;

  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden">
      <div className="min-w-0 flex-1 overflow-y-auto px-6 py-6 md:px-12 md:py-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2 max-md:border-0">
          <LayoutGroup id="library-tabs">
            <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto max-md:hidden">
              {TABS.map((item) => {
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`relative shrink-0 rounded-full px-3 py-1.5 text-[14px] ${
                      active ? "library-tab-active text-foreground" : "text-muted hover:text-foreground"
                    }`}
                    aria-current={active ? "true" : undefined}
                  >
                    {active ? (
                      <motion.span
                        layoutId="library-tab-pill"
                        className="library-tab-pill pointer-events-none absolute inset-0 rounded-full bg-surface-2 shadow-[0_1px_2px_rgba(0,0,0,0.18)]"
                        style={{ borderRadius: 9999 }}
                        transition={pillTransition}
                      />
                    ) : null}
                    <span className="relative z-[1]">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </LayoutGroup>
          <select
            aria-label="Library filter"
            value={tab}
            onChange={(event) => setTab(event.target.value as LibraryTab)}
            className="hidden h-8 max-w-[112px] rounded-full bg-surface-2 px-2 text-[13px] text-foreground outline-none max-md:block"
          >
            {TABS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <label className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-muted">
            <UiIcon name="search" size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              className="w-36 max-md:w-24 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted"
            />
          </label>
          </div>

          {loading && <p className="mt-16 text-sm text-muted">Loading library…</p>}
          {error && <p className="mt-16 text-sm text-muted">{error}</p>}
          {!loading && !error && filtered.length === 0 && (
            <div className="mt-24 text-center">
              <p className="text-[15px] font-medium text-foreground">Nothing here yet</p>
              <p className="mt-2 text-[13px] text-muted">Files and notes from your chats will show up here.</p>
            </div>
          )}

          {!loading && !error && filtered.length > 0 && (
            <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filtered.map((item) => (
                <button key={item.key} type="button" onClick={() => openItem(item)} className="group text-left">
                  <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-surface-2 transition-colors hover:bg-[color-mix(in_srgb,var(--surface-2)_96%,white)]">
                    <LibraryCardThumb item={item} />
                  </div>
                  <p className="mt-2 truncate text-[13px] text-foreground">{displayFileTitle(item.title)}</p>
                  <p className="mt-0.5 truncate text-[12px] text-muted">{cardMeta(item)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {noteError ? <div role="alert" className="fixed bottom-4 left-1/2 z-[90] -translate-x-1/2 rounded-xl bg-surface-2 px-4 py-2 text-sm text-foreground">{noteError}</div> : null}
      {notePreview ? <LibraryNotePreview key={`${notePreview.projectId}/${notePreview.id}`} item={notePreview}
        onClose={() => setNotePreview(null)}
        onOpenInChat={async () => {
          const target = notePreview;
          try {
            setPendingPanel({ projectId: target.projectId, kind: target.artifact?.kind === "plan" ? "plan" : "sheet", id: target.id, title: target.title });
            setNotePreview(null);
            const path = await latestChatPath(target.projectId);
            router.push(path ?? chatPath(target.projectId));
          } catch (error) {
            setNoteError(error instanceof Error ? error.message : "Could not open note in chat.");
          }
        }} /> : null}
      {preview ? <LibraryFilePreview key={`${preview.projectId}/${preview.id}`} target={preview}
        items={filtered.filter((item) => item.kind === "material")}
        onSelect={(item) => setPreview({ projectId: item.projectId, id: item.id, title: item.title })}
        onDeleted={(id, projectId) => setItems((current) => current.filter((item) => item.id !== id || item.projectId !== projectId))}
        onClose={() => setPreview(null)} /> : null}
    </div>
  );
}
