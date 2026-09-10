"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteProject, updateProjectTitle } from "@/lib/projects";
import { displayProjectTitle } from "@/lib/workspace/title";
import { UiIcon } from "@/components/workspace/ui-icon";
import type { Project } from "@/types/project";

const TITLE_MAX = 48;
const MENU_MS = 180;

export function SidebarChatRow({
  project,
  userId,
  active,
  menuOpen,
  onMenuOpen,
  onHold,
  onDeleted,
}: {
  project: Project;
  userId: string;
  active: boolean;
  menuOpen: boolean;
  onMenuOpen: (id: string | null) => void;
  onHold: (project: Project | null) => void;
  onDeleted: (id: string) => void;
}) {
  const router = useRouter();
  const title = displayProjectTitle(project.title);
  const rowRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(title);
  const [portalOpen, setPortalOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [bodyHeight, setBodyHeight] = useState<number | undefined>(undefined);
  const [heightReady, setHeightReady] = useState(false);
  const skipSave = useRef(false);
  pendingRef.current = pending;

  useEffect(() => {
    if (menuOpen) {
      setPortalOpen(true);
      setConfirming(false);
      setError(null);
      setPending(false);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setVisible(false);
    const t = window.setTimeout(() => {
      setPortalOpen(false);
      setConfirming(false);
      setError(null);
      setPending(false);
      setBodyHeight(undefined);
      setHeightReady(false);
    }, MENU_MS);
    return () => window.clearTimeout(t);
  }, [menuOpen]);

  useLayoutEffect(() => {
    if (!portalOpen) return;
    const el = confirming ? confirmRef.current : actionsRef.current;
    if (!el) return;
    setBodyHeight((prev) => prev ?? el.offsetHeight);
  }, [portalOpen, confirming, error, pending]);

  useEffect(() => {
    if (!portalOpen) return;
    const el = confirming ? confirmRef.current : actionsRef.current;
    if (!el) return;
    const id = window.requestAnimationFrame(() => {
      setHeightReady(true);
      setBodyHeight(el.offsetHeight);
    });
    return () => window.cancelAnimationFrame(id);
  }, [portalOpen, confirming, error, pending]);

  useLayoutEffect(() => {
    if (!portalOpen) return;
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
  }, [portalOpen, confirming, bodyHeight]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(event: MouseEvent) {
      if (pendingRef.current) return;
      const node = event.target as Node;
      if (menuRef.current?.contains(node) || btnRef.current?.contains(node)) return;
      onMenuOpen(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (pendingRef.current) return;
      onMenuOpen(null);
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
    onHold(project);
    try {
      await deleteProject(project.id, userId);
      setVisible(false);
      setGone(true);
      if (active) router.replace("/");
      window.setTimeout(() => onDeleted(project.id), MENU_MS);
    } catch (err) {
      onHold(null);
      setPending(false);
      setError(err instanceof Error ? err.message : "Could not delete this chat.");
    }
  }

  const open = menuOpen || portalOpen;

  return (
    <>
      {gone ? null : (
        <div
          ref={rowRef}
          className={`group/chat relative flex h-9 items-center gap-1.5 rounded-xl px-[13px] py-1.5 text-foreground transition-colors ${
            open ? "sidebar-chat-open bg-surface-2" : active ? "bg-surface-2" : "hover:bg-surface-2"
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
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[14px] font-normal text-foreground"
            />
          ) : (
            <>
              <Link
                href={`/project/${project.id}`}
                title={title}
                className="sidebar-chat-title min-w-0 flex-1 truncate text-[14px] font-normal leading-snug text-foreground"
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
                className={`absolute right-[6px] flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-foreground/70 transition-opacity hover:bg-foreground/10 hover:text-foreground ${
                  open
                    ? "opacity-100"
                    : "pointer-events-none opacity-0 group-hover/chat:pointer-events-auto group-hover/chat:opacity-100"
                }`}
              >
                <UiIcon name="more" size={16} />
              </button>
            </>
          )}
        </div>
      )}

      {portalOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ top: pos.top, left: pos.left }}
              className={`fixed z-40 w-[184px] overflow-hidden rounded-xl border border-border bg-background p-1 shadow-[0_8px_28px_rgba(0,0,0,0.45)] transition-[opacity,transform] duration-[180ms] ease-in-out ${
                visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1.5 opacity-0"
              }`}
            >
              <div
                className={`overflow-hidden ${heightReady ? "transition-[height] duration-[180ms] ease-in-out" : ""}`}
                style={{ height: bodyHeight }}
              >
                <div className="relative">
                  <div
                    ref={actionsRef}
                    className={`transition-opacity duration-[180ms] ease-in-out ${
                      confirming ? "pointer-events-none absolute inset-x-0 top-0 opacity-0" : "opacity-100"
                    }`}
                  >
                    <MenuItem
                      icon={<UiIcon name="edit" size={18} />}
                      label="Rename"
                      onClick={() => {
                        onMenuOpen(null);
                        setDraft(title);
                        setRenaming(true);
                      }}
                    />
                    <div className="mx-2.5 my-1 h-px bg-border" role="separator" />
                    <MenuItem
                      icon={<UiIcon name="trash" size={18} />}
                      label="Delete"
                      danger
                      onClick={() => {
                        setError(null);
                        setConfirming(true);
                      }}
                    />
                  </div>
                  <div
                    ref={confirmRef}
                    className={`transition-opacity duration-[180ms] ease-in-out ${
                      confirming ? "opacity-100" : "pointer-events-none absolute inset-x-0 top-0 opacity-0"
                    }`}
                  >
                    <p className="px-2.5 pb-1 pt-2 text-[14px] leading-none text-foreground">წავშალო?</p>
                    {error ? <p className="px-2.5 pb-1.5 text-[12px] leading-snug text-red-400">{error}</p> : null}
                    <MenuItem
                      label={pending ? "Deleting…" : "Delete"}
                      danger
                      disabled={pending}
                      onClick={() => void onDelete()}
                    />
                    <MenuItem
                      label="Cancel"
                      disabled={pending}
                      onClick={() => {
                        if (pending) return;
                        setError(null);
                        setConfirming(false);
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function MenuItem({
  icon,
  label,
  danger,
  disabled,
  onClick,
}: {
  icon?: ReactNode;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-[9px] text-left text-[14px] leading-none hover:bg-surface-2 disabled:opacity-50 ${
        danger ? "text-red-400" : "text-foreground"
      }`}
    >
      {icon ? <span className={danger ? "text-red-400" : "accent-symbol"}>{icon}</span> : null}
      {label}
    </button>
  );
}
