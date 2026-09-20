"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { useShell } from "@/components/workspace/shell-context";
import { UiIcon } from "@/components/workspace/ui-icon";
import { LibraryCardThumb, LibraryLightbox, LibrarySlideViewer } from "@/components/library-media";
import { formatBytes, relativeTime } from "@/lib/format";
import { isLibraryImage, isLibraryPptx } from "@/lib/library/media";
import { listLibraryItems, type LibraryItem, type LibraryKind } from "@/lib/library/items";

type LibraryTab = "all" | "media" | "files" | LibraryKind;

const TABS: { id: LibraryTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "media", label: "Media" },
  { id: "files", label: "Files" },
  { id: "sheet", label: "Notes" },
  { id: "path", label: "Path" },
  { id: "practice", label: "Practice" },
];

function matchesTab(item: LibraryItem, tab: LibraryTab): boolean {
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
  const { setPendingPanel } = useShell();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<LibraryTab>("all");
  const [query, setQuery] = useState("");
  const [lightbox, setLightbox] = useState<LibraryItem | null>(null);
  const [deck, setDeck] = useState<LibraryItem | null>(null);
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (!matchesTab(item, tab)) return false;
      if (!needle) return true;
      return `${item.title} ${item.projectTitle} ${item.meta}`.toLowerCase().includes(needle);
    });
  }, [items, tab, query]);

  function openItem(item: LibraryItem) {
    if (isLibraryImage(item)) {
      setLightbox(item);
      return;
    }
    if (isLibraryPptx(item)) {
      setDeck(item);
      return;
    }
    setPendingPanel({
      projectId: item.projectId,
      kind:
        item.artifact?.kind === "path"
          ? "path"
          : item.artifact?.kind === "plan"
            ? "plan"
            : item.kind === "material"
              ? "material"
              : item.kind === "practice"
                ? "practice"
                : "sheet",
      id: item.id,
      title: item.title,
    });
    router.push(`/project/${item.projectId}`);
  }

  if (user?.isAnonymous) return null;

  return (
    <div className="px-4 py-4 md:px-10 md:py-5">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2 max-md:border-0">
          <LayoutGroup id="library-tabs">
            <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
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
          <label className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-muted">
            <UiIcon name="search" size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              className="w-36 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted"
            />
          </label>
        </div>

        {loading && <p className="mt-16 text-sm text-muted">Loading library…</p>}
        {error && <p className="mt-16 text-sm text-muted">{error}</p>}
        {!loading && !error && filtered.length === 0 && (
          <div className="mt-24 text-center">
            <p className="text-[15px] font-medium text-foreground">Nothing here yet</p>
            <p className="mt-2 text-[13px] text-muted">Files, notes, and practice sets from your chats will show up here.</p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((item) => (
              <button key={item.key} type="button" onClick={() => openItem(item)} className="group text-left">
                <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-surface-2">
                  <LibraryCardThumb item={item} />
                </div>
                <p className="mt-2 truncate text-[13px] text-foreground">{item.title}</p>
                <p className="mt-0.5 truncate text-[12px] text-muted">{cardMeta(item)}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {lightbox ? (
        <LibraryLightbox
          items={items.filter(isLibraryImage)}
          startKey={lightbox.key}
          onClose={() => setLightbox(null)}
          onDeleted={(item) => setItems((current) => current.filter((entry) => entry.key !== item.key))}
        />
      ) : null}
      {deck ? (
        <LibrarySlideViewer
          item={deck}
          onClose={() => setDeck(null)}
          onDeleted={(item) => setItems((current) => current.filter((entry) => entry.key !== item.key))}
        />
      ) : null}
    </div>
  );
}
