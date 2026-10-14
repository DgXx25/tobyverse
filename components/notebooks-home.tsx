"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { UiIcon } from "@/components/workspace/ui-icon";
import { deleteProject, updateProjectMeta, updateProjectTitle } from "@/lib/projects";
import { shortDate } from "@/lib/format";
import { createNotebook } from "@/lib/workspace/notebook";
import {
  FOLDER_SUGGESTIONS,
  foldersOf,
  normalizeFolder,
  projectIconFor,
  PROJECT_ICONS,
} from "@/lib/workspace/project-icons";
import { notebookTitle } from "@/lib/workspace/title";
import { useNotebooks } from "@/lib/workspace/use-notebooks";
import type { Project } from "@/types/project";

const FOLDER_KEY = "tv.notebooks.folder";

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
      const created = await createNotebook({ userId: user.uid, folder: activeFolder || undefined });
      router.push(created.path);
    } catch (err) {
      setError(err instanceof Error && err.message.trim() ? err.message : "Could not create a notebook.");
      setCreating(false);
    }
  }

  if (!user) return null;

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col px-6 pb-16 pt-10 max-md:px-4 max-md:pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-medium tracking-tight text-foreground max-md:text-[24px]">Notebooks</h1>
        <button
          type="button"
          onClick={() => void create()}
          disabled={creating}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-4 text-[14px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <UiIcon name="plus" size={16} />
          New notebook
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

      <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        <button
          type="button"
          onClick={() => void create()}
          disabled={creating}
          className="group flex min-h-[168px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-transparent text-muted transition-colors hover:border-foreground/40 hover:bg-surface hover:text-foreground disabled:opacity-60"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface group-hover:bg-surface-2">
            <UiIcon name="plus" size={20} />
          </span>
          <span className="text-[14px]">New notebook</span>
        </button>
        {shown.map((project) => (
          <NotebookCard key={project.id} project={project} userId={user.uid} />
        ))}
      </div>

      {ready && notebooks.length === 0 ? (
        <p className="mt-10 text-center text-[14px] text-muted">
          Create a notebook, add your sources, and ask anything about them.
        </p>
      ) : null}
    </div>
  );
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

function NotebookCard({ project, userId }: { project: Project; userId: string }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>("main");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [folderDraft, setFolderDraft] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const icon = projectIconFor(project);
  const folder = normalizeFolder(project.folder);

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

  function show(next: MenuView) {
    setError(null);
    setTitleDraft(project.title.trim() === "" ? "" : notebookTitle(project.title));
    setFolderDraft(folder);
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
    <div ref={rootRef} className="group relative">
      <Link
        href={`/p/${project.id}`}
        className="flex min-h-[168px] flex-col rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-surface-2"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-background text-foreground">
          <UiIcon name={icon} size={22} className="accent-symbol" />
        </span>
        <h3 className="mt-4 line-clamp-2 text-[16px] font-medium leading-snug tracking-tight text-foreground">
          {notebookTitle(project.title)}
        </h3>
        <p className="mt-auto pt-4 text-[12px] text-muted">
          {[shortDate(project.updatedAt || project.createdAt), folder].filter(Boolean).join(" · ")}
        </p>
      </Link>

      <button
        type="button"
        aria-label="Notebook options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          show("main");
          setOpen((current) => !current);
        }}
        className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-opacity hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 max-md:opacity-100 ${
          open ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <UiIcon name="more" size={17} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-2 top-11 z-30 w-[236px] rounded-xl border border-border bg-surface-2 p-1 text-[13px] text-foreground shadow-xl"
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
              <p className="px-1 pb-1.5 text-[11px] text-muted">Symbol</p>
              <div className="grid grid-cols-5 gap-1">
                {PROJECT_ICONS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    disabled={busy}
                    aria-label={name}
                    aria-pressed={name === icon}
                    onClick={() => void run(() => updateProjectMeta(project.id, userId, { icon: name }))}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-foreground/10 ${
                      name === icon ? "bg-foreground/10" : ""
                    }`}
                  >
                    <UiIcon name={name} size={18} />
                  </button>
                ))}
              </div>
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
                aria-label="Notebook title"
                placeholder="Notebook title"
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
              <p className="text-[13px] leading-5">Delete this notebook and everything in it?</p>
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
