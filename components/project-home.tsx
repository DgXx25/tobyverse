"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { UiIcon } from "@/components/workspace/ui-icon";
import { ingestMaterialFile } from "@/lib/materials/ingest-client";
import { newChipId } from "@/lib/composer/attach";
import { subscribeMaterials } from "@/lib/materials";
import { asProjectMemory, PROJECT_MEMORY_MAX } from "@/lib/memory/project";
import { getProjectById, updateProjectMemory, updateProjectTitle } from "@/lib/projects";
import { promptIsKa } from "@/lib/composer/intent";
import { ComposerStatus, uploadStatusText } from "@/components/workspace/composer-status";
import { MATERIAL_FILE_ACCEPT } from "@/lib/materials/types";
import type { Material } from "@/types/material";
import type { Project } from "@/types/project";

export function ProjectHome({
  projectId,
  compact = false,
  onOpenMaterial,
}: {
  projectId: string;
  compact?: boolean;
  onOpenMaterial?: (materialId: string) => void;
}) {
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [titleDraft, setTitleDraft] = useState("");
  const [memoryDraft, setMemoryDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [retryUpload, setRetryUpload] = useState<File | null>(null);
  const [chips, setChips] = useState<{ id: string; title: string; status: "uploading" | "ready" | "error" }[]>([]);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getProjectById(projectId).then((item) => {
      if (cancelled) return;
      if (!item || item.userId !== user.uid) {
        setError(item ? "You do not have access to this project." : "Project not found.");
        return;
      }
      setProject(item);
      setTitleDraft(item.title);
      setMemoryDraft(item.projectMemory.join("\n"));
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, user]);

  useEffect(() => {
    return subscribeMaterials(projectId, setMaterials);
  }, [projectId]);

  async function saveTitle() {
    if (!user || !project) return;
    const next = titleDraft.replace(/\s+/g, " ").trim();
    if (!next || next === project.title) {
      setTitleDraft(project.title);
      return;
    }
    try {
      await updateProjectTitle(project.id, user.uid, next);
      setProject({ ...project, title: next });
      setError(null);
      setStatus(null);
    } catch (err) {
      setRetryUpload(null);
      setError(err instanceof Error ? err.message : "Could not rename.");
    }
  }

  async function saveMemory() {
    if (!user || !project) return;
    const lines = asProjectMemory(memoryDraft.split("\n"));
    try {
      const next = await updateProjectMemory(project.id, user.uid, lines);
      setProject({ ...project, projectMemory: next });
      setMemoryDraft(next.join("\n"));
      setError(null);
      setStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save memory.");
    }
  }

  async function addFile(file: File) {
    if (!user || uploading) return;
    const id = newChipId();
    const ka = promptIsKa(titleDraft || file.name);
    setUploading(true);
    setError(null);
    setRetryUpload(file);
    setStatus(uploadStatusText(file.name, "file", ka));
    setChips((current) => [...current, { id, title: file.name, status: "uploading" }]);
    try {
      await ingestMaterialFile({ projectId, userId: user.uid, file });
      setChips((current) => current.map((chip) => (chip.id === id ? { ...chip, status: "ready" } : chip)));
      setStatus(null);
      setRetryUpload(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setStatus(null);
      setChips((current) => current.map((chip) => (chip.id === id ? { ...chip, status: "error" } : chip)));
    } finally {
      setUploading(false);
    }
  }

  if (!user) return null;
  if (error && !project) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <p className="text-sm text-muted">{error}</p>
        <Link href="/new" className="mt-4 inline-block text-sm text-muted hover:text-foreground">
          Back
        </Link>
      </div>
    );
  }
  if (!project) {
    return <div className="h-full" />;
  }

  return (
    <div
      className={`relative flex h-full w-full flex-col overflow-y-auto ${compact ? "gap-6 px-4 py-4" : "mx-auto max-w-xl gap-10 px-8 py-10 max-md:pt-16"}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) void addFile(file);
      }}
    >
      <ComposerStatus
        status={
          error
            ? {
                text: error,
                error: true,
                onRetry: retryUpload ? () => void addFile(retryUpload) : undefined,
              }
            : status
              ? { text: status }
              : dragging
                ? { text: "Drop a file" }
                : null
        }
      />

      <div>
        <p className="mb-3 text-[13px] text-muted">Project settings</p>
        <input
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.target.value)}
          onBlur={() => void saveTitle()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          aria-label="Project title"
          className="w-full bg-transparent text-[20px] font-medium tracking-tight text-foreground outline-none"
        />
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] text-muted">Files</h2>
          <label className="cursor-pointer text-[13px] text-muted hover:text-foreground">
            Upload
            <input
              type="file"
              accept={MATERIAL_FILE_ACCEPT}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (file) void addFile(file);
              }}
            />
          </label>
        </div>
        {materials.length === 0 && chips.every((chip) => chip.status !== "uploading") ? (
          <p className="text-[13px] text-muted">No files yet.</p>
        ) : (
          <ul className="space-y-0.5">
            {materials.map((item) => (
            <li key={item.id} className="list-none">
              <button
                type="button"
                onClick={() => onOpenMaterial?.(item.id)}
                disabled={!onOpenMaterial}
                className="flex h-9 w-full items-center rounded-lg px-2 text-left text-[14px] text-foreground hover:bg-surface-2 disabled:cursor-default"
              >
                <UiIcon name="file" size={16} className="mr-2 text-muted" />
                <span className="min-w-0 truncate">{item.title}</span>
              </button>
            </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-[13px] text-muted">Project instructions · {PROJECT_MEMORY_MAX} lines, 200 chars max</h2>
        <textarea
          value={memoryDraft}
          onChange={(event) => setMemoryDraft(event.target.value)}
          onBlur={() => void saveMemory()}
          rows={6}
          className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-[14px] text-foreground outline-none"
        />
      </section>
    </div>
  );
}
