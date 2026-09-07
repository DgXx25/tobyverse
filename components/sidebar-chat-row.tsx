"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteProject, updateProjectTitle } from "@/lib/projects";
import { displayProjectTitle } from "@/lib/workspace/title";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { IconDots, IconPencil, IconTrash } from "@/components/workspace/icons";
import type { Project } from "@/types/project";

const TITLE_MAX = 48;

export function SidebarChatRow({
  project,
  userId,
  active,
  collapsed,
  menuOpen,
  onMenuOpen,
}: {
  project: Project;
  userId: string;
  active: boolean;
  collapsed: boolean;
  menuOpen: boolean;
  onMenuOpen: (id: string | null) => void;
}) {
  const router = useRouter();
  const title = displayProjectTitle(project.title);
  const rowRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(title);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipSave = useRef(false);

  useLayoutEffect(() => {
    if (!menuOpen) return;
    function place() {
      const row = rowRef.current;
      const menu = menuRef.current;
      if (!row) return;
      const rowBox = row.getBoundingClientRect();
      const height = menu?.offsetHeight ?? 108;
      const width = menu?.offsetWidth ?? 200;
      let left = rowBox.right + 8;
      let top = rowBox.top + rowBox.height / 2;
      if (left + width > window.innerWidth - 8) left = Math.max(8, rowBox.left - width - 6);
      if (top + height > window.innerHeight - 8) top = window.innerHeight - height - 8;
      if (top < 8) top = 8;
      setPos({ top, left });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(event: MouseEvent) {
      const node = event.target as Node;
      if (menuRef.current?.contains(node) || btnRef.current?.contains(node)) return;
      onMenuOpen(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onMenuOpen(null);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, onMenuOpen]);

  useEffect(() => {
    if (!renaming) setDraft(title);
  }, [title, renaming]);

  useEffect(() => {
    if (!renaming) return;
    const input = inputRef.current;
    input?.focus();
    input?.select();
  }, [renaming]);

  async function saveTitle() {
    if (skipSave.current) {
      skipSave.current = false;
      setRenaming(false);
      setDraft(title);
      return;
    }
    const next = draft.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
    setRenaming(false);
    if (!next || next === title) {
      setDraft(title);
      return;
    }
    try {
      await updateProjectTitle(project.id, userId, next);
    } catch {
      setDraft(title);
    }
  }

  async function onDelete() {
    setPending(true);
    setError(null);
    try {
      await deleteProject(project.id, userId);
      setConfirm(false);
      if (active) router.replace("/dashboard");
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Could not delete this chat.");
    }
  }

  if (collapsed) {
    return (
      <Link
        href={`/project/${project.id}`}
        title={title}
        className={`block truncate rounded-md px-1 py-1.5 text-center text-[11px] transition-colors ${
          active ? "bg-surface-2 text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground"
        }`}
      >
        {title.slice(0, 2)}
      </Link>
    );
  }

  const showDots = active || menuOpen;

  return (
    <>
      <div
        ref={rowRef}
        className={`group relative flex items-center rounded-md transition-colors ${
          active || menuOpen ? "bg-surface-2 text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground"
        }`}
      >
        {renaming ? (
          <input
            ref={inputRef}
            value={draft}
            maxLength={TITLE_MAX}
            aria-label="Rename chat"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                skipSave.current = true;
                setDraft(title);
                setRenaming(false);
              }
            }}
            className="mx-1 min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 py-1 text-[13px] text-foreground"
          />
        ) : (
          <>
            <Link
              href={`/project/${project.id}`}
              title={title}
              className="min-w-0 flex-1 truncate px-2.5 py-1.5 text-[13px]"
            >
              {title}
            </Link>
            <button
              ref={btnRef}
              type="button"
              aria-label="Chat actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onMenuOpen(menuOpen ? null : project.id);
              }}
              onMouseDown={(event) => event.stopPropagation()}
              className={`mr-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted transition-opacity hover:bg-foreground/10 hover:text-foreground ${
                showDots
                  ? "opacity-100"
                  : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
              } ${active || menuOpen ? "text-foreground" : ""}`}
            >
              <IconDots className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {menuOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ top: pos.top, left: pos.left }}
              className="fixed z-40 w-[184px] rounded-xl border border-border bg-background p-1 shadow-[0_8px_28px_rgba(0,0,0,0.45)]"
            >
              <MenuItem
                icon={<IconPencil className="h-4 w-4" />}
                label="Rename"
                onClick={() => {
                  onMenuOpen(null);
                  setDraft(title);
                  setRenaming(true);
                }}
              />
              <div className="mx-2.5 my-1 h-px bg-border" role="separator" />
              <MenuItem
                icon={<IconTrash className="h-4 w-4" />}
                label="Delete"
                danger
                onClick={() => {
                  onMenuOpen(null);
                  setError(null);
                  setConfirm(true);
                }}
              />
            </div>,
            document.body,
          )
        : null}

      {confirm ? (
        <ConfirmDialog
          title="Delete chat?"
          description={`This will remove “${title}” and its materials, notes, and exercises.`}
          confirmLabel="Delete"
          pending={pending}
          error={error}
          onConfirm={() => void onDelete()}
          onCancel={() => {
            if (pending) return;
            setConfirm(false);
            setError(null);
          }}
        />
      ) : null}
    </>
  );
}

function MenuItem({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-[9px] text-left text-[14px] leading-none hover:bg-foreground/[0.06] ${
        danger ? "text-red-400" : "text-foreground"
      }`}
    >
      <span className={danger ? "text-red-400" : "text-foreground/80"}>{icon}</span>
      {label}
    </button>
  );
}
