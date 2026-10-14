"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { UiIcon } from "@/components/workspace/ui-icon";
import { asProjectMemory, PROJECT_MEMORY_MAX } from "@/lib/memory/project";
import { getProjectById, updateProjectMemory } from "@/lib/projects";
import type { Project } from "@/types/project";

export function ProjectSettingsPane({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [editing, setEditing] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

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
      setMemoryDraft(value.projectMemory.join("\n"));
    }).catch(() => {
      if (!cancelled) setStatus({ text: "Could not load project settings.", error: true });
    });
    return () => { cancelled = true; };
  }, [projectId, user]);

  async function saveMemory() {
    if (!user || !project || saving) return;
    const clipped = memoryDraft.split("\n").slice(0, PROJECT_MEMORY_MAX).map((line) => line.slice(0, 200));
    const nextLines = asProjectMemory(clipped);
    setSaving(true);
    try {
      const saved = await updateProjectMemory(project.id, user.uid, nextLines);
      setProject({ ...project, projectMemory: saved });
      setMemoryDraft(saved.join("\n"));
      setEditing(false);
      setStatus({ text: "Instructions saved." });
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : "Could not save instructions.", error: true });
    } finally {
      setSaving(false);
    }
  }

  if (!user || !project) return <div className="h-full" />;

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      <h2 className="mb-5 text-[15px] font-medium text-foreground">{project.title}</h2>
      <section>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-[14px] text-foreground">Instructions</h3>
            <p className="mt-0.5 text-[13px] text-muted">Add instructions to customize responses in this notebook</p>
          </div>
          <button type="button" onClick={() => { setMemoryDraft(project.projectMemory.join("\n")); setEditing(true); }} className="rounded-full bg-background px-3 py-1.5 text-[13px] text-foreground hover:bg-surface-2">Edit</button>
        </div>
        {project.projectMemory.length > 0 ? <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-[13px] text-muted">{project.projectMemory.join("\n")}</p> : null}
        {status ? <p role={status.error ? "alert" : "status"} className={`mt-2 text-[12px] ${status.error ? "text-red-400" : "text-muted"}`}>{status.text}</p> : null}
      </section>

      {editing ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="project-instructions-title" className="w-full max-w-[560px] rounded-2xl bg-surface p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div><h3 id="project-instructions-title" className="text-[14px] font-medium text-foreground">Instructions</h3><p className="mt-1 text-[13px] text-muted">These stay with this notebook until you change them.</p></div>
            <button type="button" aria-label="Close" onClick={() => setEditing(false)} className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-background hover:text-foreground"><UiIcon name="close" size={16} /></button>
          </div>
          <textarea autoFocus value={memoryDraft} onChange={(event) => setMemoryDraft(event.target.value.split("\n").slice(0, PROJECT_MEMORY_MAX).map((line) => line.slice(0, 200)).join("\n"))} rows={8} maxLength={PROJECT_MEMORY_MAX * 201} placeholder="Add instructions for this notebook…" className="mt-4 w-full resize-none rounded-xl bg-background px-3 py-3 text-[14px] text-foreground outline-none" />
          <p className="mt-1 text-[11px] text-muted">Up to {PROJECT_MEMORY_MAX} lines, 200 characters per line.</p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="rounded-full bg-background px-3 py-1.5 text-[13px] text-foreground hover:bg-surface-2">Cancel</button>
            <button type="button" disabled={saving} onClick={() => void saveMemory()} className="rounded-full bg-foreground px-3 py-1.5 text-[13px] text-background disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
          </div>
        </section>
      </div> : null}
    </div>
  );
}
