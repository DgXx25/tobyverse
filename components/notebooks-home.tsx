"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { UiIcon } from "@/components/workspace/ui-icon";
import { ProjectSymbol, iconSearchLabel } from "@/components/workspace/pack-icon";
import { deleteProject, updateProjectMeta, updateProjectTitle } from "@/lib/projects";
import { countMaterials } from "@/lib/materials";
import { createNotebook } from "@/lib/workspace/notebook";
import { useTheme } from "@/components/workspace/theme-provider";
import { accentColor, type AccentId } from "@/lib/workspace/theme";
import {
  FOLDER_SUGGESTIONS,
  foldersOf,
  normalizeFolder,
  projectIconFor,
} from "@/lib/workspace/project-icons";
import { notebookTitle } from "@/lib/workspace/title";
import { positionContextMenu } from "@/lib/workspace/context-menu-position";
import { useNotebooks } from "@/lib/workspace/use-notebooks";
import type { Project } from "@/types/project";

const FOLDER_KEY = "tv.notebooks.folder";
const SYMBOL_COLORS = ["blue", "red", "orange", "yellow", "green", "teal", "purple", "pink"] as const satisfies readonly AccentId[];

function readFolder(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(FOLDER_KEY) ?? "";
  } catch {
    return "";
  }
}

export function NotebooksHome() {
  const router = useRouter();
  const { user } = useAuth();
  const { notebooks, ready } = useNotebooks(user?.uid);
  const [folder, setFolderState] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setFolderState(readFolder()), []);

  const folders = useMemo(() => foldersOf(notebooks), [notebooks]);
  const activeFolder = folder && folders.includes(folder) ? folder : "";
  const shown = activeFolder ? notebooks.filter((item) => normalizeFolder(item.folder) === activeFolder) : notebooks;
  const shownKey = shown.map((item) => item.id).join(",");
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const ids = shownKey ? shownKey.split(",") : [];
    if (ids.length === 0) return;
    let cancel = false;
    void Promise.all(
      ids.map(async (id) => {
        try {
          return [id, await countMaterials(id)] as const;
        } catch {
          return [id, 0] as const;
        }
      }),
    ).then((rows) => {
      if (!cancel) setSourceCounts(Object.fromEntries(rows));
    });
    return () => {
      cancel = true;
    };
  }, [shownKey]);

  function setFolder(next: string) {
    setFolderState(next);
    try {
      window.localStorage.setItem(FOLDER_KEY, next);
    } catch {
      /* private mode */
    }
  }

  async function create() {
    if (!user || creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createNotebook({ folder: activeFolder || undefined });
      router.push(created.path);
    } catch (err) {
      setError(err instanceof Error && err.message.trim() ? err.message : "Could not create a notebook.");
      setCreating(false);
    }
  }

  if (!user) return null;

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col px-6 pb-16 pt-10 max-[1100px]:px-3 max-[1100px]:pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-medium tracking-tight text-foreground max-[1100px]:text-[24px]">Projects</h1>
        <button
          type="button"
          onClick={() => void create()}
          disabled={creating}
          className="project-card inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-4 text-[14px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <UiIcon name="plus" size={16} />
          New project
        </button>
      </div>

      {folders.length > 0 ? (
        <div role="tablist" aria-label="Folders" className="mt-5 flex flex-wrap items-center gap-1.5">
          <FolderChip label="All" active={!activeFolder} onClick={() => setFolder("")} />
          {folders.map((name) => (
            <FolderChip key={name} label={name} active={activeFolder === name} onClick={() => setFolder(name)} />
          ))}
        </div>
      ) : null}

      {error ? <p role="alert" className="mt-4 text-[13px] text-red-400">{error}</p> : null}

      <div className="mt-6 grid grid-cols-4 gap-4 max-[1100px]:mt-4 max-[1100px]:grid-cols-1 max-[1100px]:gap-0 max-[1100px]:border-t max-[1100px]:border-border">
        {!ready
          ? Array.from({ length: 8 }, (_, index) => <NotebookCardSkeleton key={index} />)
          : shown.map((project) => (
              <NotebookCard key={project.id} project={project} userId={user.uid} sourceCount={sourceCounts[project.id]} />
            ))}
      </div>

      {ready && notebooks.length === 0 ? (
        <p className="mt-10 text-center text-[14px] text-muted">
          Create a project, add your sources, and ask anything about them.
        </p>
      ) : null}
    </div>
  );
}

function NotebookCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex aspect-[5/3] animate-pulse flex-col rounded-2xl bg-gradient-to-br from-surface via-surface-2 to-surface p-4 max-[1100px]:aspect-auto max-[1100px]:min-h-[68px] max-[1100px]:flex-row max-[1100px]:items-center max-[1100px]:gap-3 max-[1100px]:rounded-none max-[1100px]:border-b max-[1100px]:border-border max-[1100px]:p-2"
    >
      <span className="h-12 w-12 shrink-0 rounded-xl bg-foreground/10 max-[1100px]:h-8 max-[1100px]:w-8" />
      <span className="h-4 w-3/4 rounded bg-foreground/10 max-[1100px]:mt-0 max-[1100px]:h-3 max-[1100px]:w-4/5" />
      <span className="mt-2 h-4 w-1/2 rounded bg-foreground/10 max-[1100px]:hidden" />
      <span className="mt-auto h-3 w-2/5 rounded bg-foreground/10 max-[1100px]:hidden" />
    </div>
  );
}

function projectMeta(iso: string | null, sources: number | undefined): string {
  const date = iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";
  const count = sources == null ? "" : sources === 1 ? "1 source" : `${sources} sources`;
  return [date, count].filter(Boolean).join(" · ");
}

function FolderChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`h-8 rounded-full border px-3 text-[13px] transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-surface text-muted hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

type MenuView = "main" | "icon" | "folder" | "rename" | "delete";

function NotebookCard({ project, userId, sourceCount }: { project: Project; userId: string; sourceCount?: number }) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [contextPoint, setContextPoint] = useState<{ x: number; y: number } | null>(null);
  const [view, setView] = useState<MenuView>("main");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [folderDraft, setFolderDraft] = useState("");
  const [iconQuery, setIconQuery] = useState("");
  const [iconColor, setIconColor] = useState<AccentId>("blue");
  const [packNames, setPackNames] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const icon = projectIconFor(project);
  const folder = normalizeFolder(project.folder);
  const contextMenuSize = view === "icon"
    ? { width: 236, height: 330 }
    : view === "folder"
      ? { width: 236, height: 210 }
      : view === "rename"
        ? { width: 236, height: 105 }
        : { width: 236, height: 165 };
  const contextMenuPosition = contextPoint
    ? positionContextMenu(contextPoint.x, contextPoint.y, contextMenuSize.width, contextMenuSize.height, window.innerWidth, window.innerHeight)
    : null;

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeKey);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeKey);
    };
  }, [open]);

  useEffect(() => {
    if (view !== "icon") return;
    let cancel = false;
    void import("@/lib/workspace/icon-names").then(({ ICON_NAMES }) => {
      if (!cancel) setPackNames(ICON_NAMES.slice());
    });
    return () => {
      cancel = true;
    };
  }, [view]);

  const iconMatches = (() => {
    const query = iconQuery.trim().toLowerCase();
    const source = query ? packNames.filter((name) => iconSearchLabel(name).includes(query) || name.toLowerCase().includes(query)) : packNames;
    return source.slice(0, 80);
  })();

  function show(next: MenuView) {
    setError(null);
    setTitleDraft(project.title.trim() === "" ? "" : notebookTitle(project.title));
    setFolderDraft(folder);
    setIconQuery("");
    const saved = SYMBOL_COLORS.find((id) => accentColor(theme, id) === project.iconColor);
    setIconColor(saved ?? "blue");
    setView(next);
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error && err.message.trim() ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className="group relative max-[1100px]:border-b max-[1100px]:border-border"
      onContextMenu={(event) => {
        event.preventDefault();
        show("main");
        setContextPoint({ x: event.clientX, y: event.clientY });
        setOpen(true);
      }}
    >
      <Link
        href={`/p/${project.id}`}
        className="project-card flex aspect-[5/3] flex-col rounded-2xl bg-surface p-4 max-[1100px]:aspect-auto max-[1100px]:min-h-[68px] max-[1100px]:flex-row max-[1100px]:items-center max-[1100px]:gap-3 max-[1100px]:rounded-none max-[1100px]:bg-transparent max-[1100px]:px-2 max-[1100px]:py-2 max-[1100px]:pr-10"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center text-foreground max-[1100px]:h-8 max-[1100px]:w-8">
          <ProjectSymbol name={icon} size={38} color={project.iconColor} className={`${project.iconColor ? "" : "accent-symbol"} max-[1100px]:hidden`} />
          <ProjectSymbol name={icon} size={20} color={project.iconColor} className={`${project.iconColor ? "" : "accent-symbol"} hidden max-[1100px]:block`} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col max-[1100px]:justify-center">
          <h3 className="mt-4 line-clamp-2 min-h-[2.75em] text-[18px] font-medium leading-snug tracking-tight text-foreground max-[1100px]:mt-0 max-[1100px]:min-h-0 max-[1100px]:text-[14px]">
            {notebookTitle(project.title)}
          </h3>
          <p className="mt-auto truncate pt-4 text-[12px] text-muted max-[1100px]:mt-1 max-[1100px]:pt-0 max-[1100px]:text-[11px]">
            {projectMeta(project.updatedAt || project.createdAt, sourceCount)}
          </p>
        </span>
      </Link>

      <button
        type="button"
        aria-label="Project options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setContextPoint(null);
          show("main");
          setOpen((current) => !current);
        }}
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-foreground/10 hover:text-foreground max-[1100px]:right-0 max-[1100px]:top-1/2 max-[1100px]:-translate-y-1/2"
      >
        <UiIcon name="moreVertical" size={18} />
      </button>

      {open ? (
        <div
          role="menu"
          className={`${contextPoint ? "fixed z-[80]" : "absolute right-2 top-11 z-30"} w-[236px] rounded-xl border border-border bg-surface-2 p-1 text-[13px] text-foreground shadow-xl`}
          style={contextMenuPosition ?? undefined}
        >
          {view === "main" ? (
            <>
              <MenuItem icon="edit" label="Rename" onClick={() => show("rename")} />
              <MenuItem icon="book" label="Change symbol" onClick={() => show("icon")} />
              <MenuItem icon="projectFolder" label={folder ? `Folder · ${folder}` : "Add to folder"} onClick={() => show("folder")} />
              <MenuItem icon="trash" label="Delete" danger onClick={() => show("delete")} />
            </>
          ) : null}

          {view === "icon" ? (
            <div className="p-1.5">
              <input
                autoFocus
                value={iconQuery}
                onChange={(event) => setIconQuery(event.target.value)}
                placeholder="Search symbols"
                aria-label="Search symbols"
                className="mb-1.5 h-8 w-full rounded-lg border border-border bg-background px-2 text-[13px] text-foreground outline-none placeholder:text-muted"
              />
              <div className="mb-2 flex items-center gap-1.5 px-0.5">
                {SYMBOL_COLORS.map((id) => {
                  const color = accentColor(theme, id);
                  const on = iconColor === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-label={id}
                      aria-pressed={on}
                      onClick={() => setIconColor(id)}
                      className="h-4 w-4 rounded-full"
                      style={{ background: color, outline: on ? "2px solid var(--text)" : "none", outlineOffset: 2 }}
                    />
                  );
                })}
              </div>
              <div className="grid aspect-square grid-cols-4 gap-1 overflow-y-auto">
                {iconMatches.map((name) => (
                  <button
                    key={name}
                    type="button"
                    disabled={busy}
                    aria-label={iconSearchLabel(name)}
                    title={iconSearchLabel(name)}
                    aria-pressed={name === icon}
                    onClick={() => void run(() => updateProjectMeta(project.id, userId, { icon: name, iconColor: accentColor(theme, iconColor) }))}
                    className={`flex aspect-square w-full items-center justify-center rounded-lg hover:bg-foreground/10 ${
                      name === icon ? "bg-foreground/10" : ""
                    }`}
                  >
                    <ProjectSymbol name={name} size={20} color={accentColor(theme, iconColor)} />
                  </button>
                ))}
              </div>
              {packNames.length === 0 ? <p className="px-1 pt-1 text-[12px] text-muted">Loading symbols…</p> : null}
              {packNames.length > 0 && iconMatches.length === 0 ? <p className="px-1 pt-1 text-[12px] text-muted">No symbols</p> : null}
            </div>
          ) : null}

          {view === "rename" ? (
            <form
              className="p-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                const next = titleDraft.replace(/\s+/g, " ").trim();
                if (!next) return;
                void run(() => updateProjectTitle(project.id, userId, next));
              }}
            >
              <input
                autoFocus
                value={titleDraft}
                maxLength={80}
                onChange={(event) => setTitleDraft(event.target.value)}
                aria-label="Project title"
                placeholder="Project title"
                className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-[13px] text-foreground outline-none placeholder:text-muted"
              />
              <button
                type="submit"
                disabled={busy || !titleDraft.trim()}
                className="mt-1.5 h-8 w-full rounded-lg bg-foreground text-[13px] font-medium text-background disabled:opacity-50"
              >
                Save
              </button>
            </form>
          ) : null}

          {view === "folder" ? (
            <form
              className="p-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                void run(() => updateProjectMeta(project.id, userId, { folder: normalizeFolder(folderDraft) }));
              }}
            >
              <input
                autoFocus
                value={folderDraft}
                maxLength={40}
                onChange={(event) => setFolderDraft(event.target.value)}
                aria-label="Folder name"
                placeholder="Folder name"
                className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-[13px] text-foreground outline-none placeholder:text-muted"
              />
              <div className="mt-1.5 flex flex-wrap gap-1">
                {FOLDER_SUGGESTIONS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setFolderDraft(name)}
                    className="rounded-full border border-border px-2 py-0.5 text-[12px] text-muted hover:bg-foreground/10 hover:text-foreground"
                  >
                    {name}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={busy}
                className="mt-1.5 h-8 w-full rounded-lg bg-foreground text-[13px] font-medium text-background disabled:opacity-50"
              >
                {normalizeFolder(folderDraft) ? "Save" : folder ? "Remove from folder" : "Save"}
              </button>
            </form>
          ) : null}

          {view === "delete" ? (
            <div className="p-2">
              <p className="text-[13px] leading-5">Delete this project and everything in it?</p>
              <p className="mt-1 text-[12px] leading-4 text-muted">Sources, notes and practice sets are removed for good.</p>
              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => show("main")}
                  className="h-8 flex-1 rounded-lg border border-border text-[13px] hover:bg-foreground/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => deleteProject(project.id, userId))}
                  className="h-8 flex-1 rounded-lg bg-red-500 text-[13px] font-medium text-white disabled:opacity-50"
                >
                  {busy ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ) : null}

          {error ? <p role="alert" className="px-2 pb-1.5 pt-1 text-[12px] text-red-400">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: "edit" | "book" | "projectFolder" | "trash";
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`sidebar-menu-item flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left ${
        danger ? "text-red-400" : "text-foreground"
      }`}
    >
      <UiIcon name={icon} size={16} />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}
