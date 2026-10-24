"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/components/auth-provider";
import { UiIcon } from "@/components/workspace/ui-icon";
import { getProjectById, updateProjectTitle } from "@/lib/projects";
import type { Project } from "@/types/project";

export function ProjectSettingsPane({
  projectId,
  presentation = "panel",
  onClose,
}: {
  projectId: string;
  presentation?: "panel" | "dialog";
  onClose?: () => void;
}) {
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [editClosing, setEditClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const editCloseTimer = useRef<number | null>(null);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(() => onClose?.(), 160);
  }, [closing, onClose]);

  function closeEditor() {
    if (editClosing) return;
    setEditClosing(true);
    editCloseTimer.current = window.setTimeout(() => {
      setEditing(false);
      setEditClosing(false);
    }, 150);
  }

  useEffect(() => () => {
    if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
    if (editCloseTimer.current != null) window.clearTimeout(editCloseTimer.current);
  }, []);

  useEffect(() => {
    if (presentation !== "dialog" || !onClose) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [presentation, requestClose, onClose]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void getProjectById(projectId).then((value) => {
      if (cancelled) return;
      if (!value || value.userId !== user.uid) {
        setStatus({ text: value ? "You do not have access to this project." : "Project not found.", error: true });
        return;
      }
      setProject(value);
      setTitleDraft(value.title);
    }).catch(() => {
      if (!cancelled) setStatus({ text: "Could not load project settings.", error: true });
    });
    return () => { cancelled = true; };
  }, [projectId, user]);

  async function saveProjectName() {
    if (!user || !project || saving) return;
    const title = titleDraft.trim().slice(0, 160);
    if (!title) return;
    setSaving(true);
    try {
      await updateProjectTitle(project.id, user.uid, title);
      setProject({ ...project, title });
      setTitleDraft(title);
      closeEditor();
      setStatus({ text: "Project name saved." });
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : "Could not save project name.", error: true });
    } finally {
      setSaving(false);
    }
  }

  if (!user || !project) {
    if (presentation !== "dialog") return <div className="h-full" />;
    return typeof document === "undefined" ? null : createPortal(<div className={`popup-backdrop fixed inset-0 z-[100] flex items-center justify-center p-4 ${closing ? "popup-closing" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="project-settings-loading-title" className={`popup-surface w-full max-w-[560px] rounded-2xl bg-surface p-5 shadow-2xl ${closing ? "popup-closing" : ""}`}>
          <div className="flex items-center justify-between gap-4">
            <h2 id="project-settings-loading-title" className="text-[15px] font-medium text-foreground">Project settings</h2>
            <button type="button" aria-label="Close project settings" onClick={requestClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-background hover:text-foreground">
              <UiIcon name="close" size={17} />
            </button>
          </div>
          <p role="status" className="mt-5 text-[14px] text-muted">{!user ? "Sign in to view project settings." : "Loading project settings…"}</p>
        </section>
      </div>, document.body);
  }

  const isDialog = presentation === "dialog";

  const content = (
    <div
      className={isDialog ? `popup-backdrop fixed inset-0 z-[100] flex items-center justify-center p-4 ${closing ? "popup-closing" : ""}` : "h-full overflow-y-auto px-4 py-4"}
      onMouseDown={isDialog ? (event) => { if (event.target === event.currentTarget) requestClose(); } : undefined}
    >
      <section
        role={isDialog ? "dialog" : undefined}
        aria-modal={isDialog ? true : undefined}
        aria-labelledby={isDialog ? "project-settings-title" : undefined}
        className={isDialog ? `popup-surface max-h-[min(80vh,680px)] w-full max-w-[560px] overflow-y-auto rounded-2xl bg-surface p-5 shadow-2xl ${closing ? "popup-closing" : ""}` : undefined}
      >
      <div className={isDialog ? "mb-5 flex items-center justify-between gap-4" : "mb-5"}>
        <h2 id={isDialog ? "project-settings-title" : undefined} className="text-[15px] font-medium text-foreground">{project.title}</h2>
        {isDialog ? (
          <button type="button" aria-label="Close project settings" onClick={requestClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-background hover:text-foreground">
            <UiIcon name="close" size={17} />
          </button>
        ) : null}
      </div>
      <section>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-[14px] text-foreground">Project name</h3>
            <p className="mt-0.5 text-[13px] text-muted">{project.title}</p>
          </div>
          <button type="button" onClick={() => { setTitleDraft(project.title); setEditing(true); }} className="rounded-full bg-background px-3 py-1.5 text-[13px] text-foreground hover:bg-surface-2">Edit</button>
        </div>
        {status ? <p role={status.error ? "alert" : "status"} className={`mt-2 text-[12px] ${status.error ? "text-red-400" : "text-muted"}`}>{status.text}</p> : null}
      </section>

      {editing && typeof document !== "undefined" ? createPortal(<div className={`popup-backdrop fixed inset-0 z-[110] flex items-center justify-center p-4 ${editClosing ? "popup-closing" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="project-name-title" className={`popup-surface w-full max-w-[560px] rounded-2xl bg-surface p-5 shadow-2xl ${editClosing ? "popup-closing" : ""}`}>
          <div className="flex items-start justify-between gap-4">
            <div><h3 id="project-name-title" className="text-[14px] font-medium text-foreground">Project name</h3></div>
            <button type="button" aria-label="Close" onClick={closeEditor} className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-background hover:text-foreground"><UiIcon name="close" size={16} /></button>
          </div>
          <input autoFocus aria-label="Project name" value={titleDraft} onChange={event => setTitleDraft(event.target.value)} maxLength={160} placeholder="Project name" className="mt-4 w-full rounded-xl bg-background px-3 py-3 text-[14px] text-foreground outline-none" />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={closeEditor} className="rounded-full bg-background px-3 py-1.5 text-[13px] text-foreground hover:bg-surface-2">Cancel</button>
            <button type="button" disabled={saving || !titleDraft.trim()} onClick={() => void saveProjectName()} className="rounded-full bg-foreground px-3 py-1.5 text-[13px] text-background disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
          </div>
        </section>
      </div>, document.body) : null}
      </section>
    </div>
  );

  return isDialog && typeof document !== "undefined" ? createPortal(content, document.body) : content;
}
