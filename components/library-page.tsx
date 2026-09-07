"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { useShell } from "@/components/workspace/shell-context";
import { IconFile, IconPractice, IconSearch, IconSheet } from "@/components/workspace/icons";
import { dayGroup, relativeTime } from "@/lib/format";
import { listLibraryItems, type LibraryItem, type LibraryKind } from "@/lib/library/items";

const TABS: { id: "all" | LibraryKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "material", label: "Materials" },
  { id: "sheet", label: "Notes" },
  { id: "practice", label: "Practice" },
];

export function LibraryPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { setPendingPanel } = useShell();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
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
  }, [user]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (tab !== "all" && item.kind !== tab) return false;
      if (!needle) return true;
      return `${item.title} ${item.projectTitle} ${item.meta}`.toLowerCase().includes(needle);
    });
  }, [items, tab, query]);

  const groups = useMemo(() => {
    const buckets: Record<"Today" | "Yesterday" | "Earlier", LibraryItem[]> = {
      Today: [],
      Yesterday: [],
      Earlier: [],
    };
    for (const item of filtered) {
      buckets[dayGroup(item.createdAt)].push(item);
    }
    return (["Today", "Yesterday", "Earlier"] as const).filter((key) => buckets[key].length > 0).map((key) => ({
      label: key,
      items: buckets[key],
    }));
  }, [filtered]);

  function openItem(item: LibraryItem) {
    setPendingPanel({
      projectId: item.projectId,
      kind: item.artifact?.kind === "plan" ? "plan" : item.kind === "material" ? "material" : item.kind === "practice" ? "practice" : "sheet",
      id: item.id,
      title: item.title,
    });
    router.push(`/project/${item.projectId}`);
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background px-8 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center gap-3">
          <nav className="flex min-w-0 flex-1 items-center gap-1">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-full px-3 py-1.5 text-[13px] ${
                  tab === item.id ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <label className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-muted">
            <IconSearch className="h-4 w-4" />
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

        {groups.map((group) => (
          <section key={group.label} className="mt-10">
            <h2 className="mb-4 text-[15px] font-medium text-foreground">{group.label}</h2>
            <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
              {group.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => openItem(item)}
                  className="group text-left"
                >
                  <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-surface-2">
                    <CardPreview item={item} />
                  </div>
                  <p className="mt-2 truncate text-[13px] text-foreground">{item.title}</p>
                  <p className="mt-0.5 truncate text-[12px] text-muted">
                    {[relativeTime(item.createdAt), item.meta].filter(Boolean).join(" · ")}
                  </p>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function CardPreview({ item }: { item: LibraryItem }) {
  if (item.kind === "practice") {
    return (
      <div className="px-4 text-center">
        <IconPractice className="mx-auto h-6 w-6 text-muted" />
        <p className="mt-2 text-[12px] text-muted">{item.title}</p>
      </div>
    );
  }
  if (item.kind === "sheet") {
    return (
      <div className="h-full w-full px-4 py-4">
        <IconSheet className="h-4 w-4 text-muted" />
        <p className="mt-3 line-clamp-5 text-left text-[12px] leading-5 text-muted">{item.preview || item.title}</p>
      </div>
    );
  }
  return (
    <div className="px-4 text-center">
      <IconFile className="mx-auto h-6 w-6 text-muted" />
      <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-muted">{item.meta}</p>
      {item.preview ? (
        <p className="mt-2 line-clamp-3 text-left text-[11px] leading-4 text-muted">{item.preview}</p>
      ) : null}
    </div>
  );
}