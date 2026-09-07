"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteProject, getProjectById, updateProjectActiveArtifact } from "@/lib/projects";
import { subscribeMaterials } from "@/lib/materials";
import { trackEvent } from "@/lib/analytics/track";
import {
  loadWorkspacePrefs,
  saveWorkspacePrefs,
  type WorkspacePrefs,
} from "@/lib/workspace/prefs";
import { useAuth } from "@/components/auth-provider";
import { ProjectChat } from "@/components/project-chat";
import { ArtifactPanel, type ArtifactFocus } from "@/components/workspace/artifact-panel";
import { useShell } from "@/components/workspace/shell-context";
import { IconPanel, IconShare } from "@/components/workspace/icons";
import { DEFAULT_AI_PROVIDER } from "@/lib/ai/catalog";
import { chatArtifactToActive } from "@/lib/artifacts/active";
import type { ChatArtifact, ChatMode } from "@/types/chat";
import type { ActiveArtifactStatus } from "@/types/project";
import type { Material } from "@/types/material";
import type { Project } from "@/types";

const MIN_ARTIFACT = 360;

function focusFromPending(pending: {
  kind: "material" | "sheet" | "plan" | "practice";
  id: string;
  title?: string;
}): ArtifactFocus {
  if (pending.kind === "material") return { kind: "material", id: pending.id };
  if (pending.kind === "practice") return { kind: "practice", id: pending.id, title: pending.title || "Practice" };
  if (pending.kind === "plan") return { kind: "plan", id: pending.id, title: pending.title || "Study plan" };
  return { kind: "sheet", id: pending.id, title: pending.title || "Notes" };
}

export function ProjectView({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const { setProjectSettings, setSidebarHidden, pendingPanel, setPendingPanel, setMobileTopActions } = useShell();
  const [project, setProject] = useState<Project | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [mode, setMode] = useState<ChatMode>("normal");
  const model = DEFAULT_AI_PROVIDER;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [prefsReady, setPrefsReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [focus, setFocus] = useState<ArtifactFocus | null>(null);
  const [session, setSession] = useState<{ setId: string; ids: string[] } | null>(null);
  const [artifactWidth, setArtifactWidth] = useState(420);
  const [resizing, setResizing] = useState(false);
  const openedAt = useRef(Date.now());
  const prefsRef = useRef<WorkspacePrefs | null>(null);
  const widthRef = useRef(420);
  const savedLayout = useRef<{ width: number } | null>(null);
  widthRef.current = artifactWidth;

  useEffect(() => {
    openedAt.current = Date.now();
    return () => {
      if (!user) return;
      if (Date.now() - openedAt.current < 20_000) {
        trackEvent({ userId: user.uid, projectId, type: "dropped_off", value: "chat" });
      }
    };
  }, [projectId, user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getProjectById(projectId)
      .then((item) => {
        if (cancelled) return;
        if (!item || item.userId !== user.uid) {
          setError(item ? "You do not have access to this project." : "Project not found.");
          return;
        }
        setProject(item);
        const prefs = loadWorkspacePrefs(projectId, item.preferredChatMode);
        prefsRef.current = prefs;
        setMode(prefs.mode);
        setSelectedIds(prefs.selectedMaterialIds);
        setArtifactWidth(prefs.artifactWidth);
        setPrefsReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load project.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, user]);

  useEffect(() => {
    return subscribeMaterials(projectId, setMaterials, (err) => setError(err.message));
  }, [projectId]);

  useEffect(() => {
    const valid = new Set(materials.map((item) => item.id));
    setSelectedIds((current) => {
      const next = current.filter((id) => valid.has(id));
      return next.length === current.length ? current : next;
    });
  }, [materials]);

  useEffect(() => {
    if (!prefsReady || session) return;
    const prefs: WorkspacePrefs = {
      tab: "chat",
      mode,
      intent: "ask",
      model,
      useMaterials: true,
      selectedMaterialIds: selectedIds,
      contextOpen: false,
      artifactWidth,
    };
    prefsRef.current = prefs;
    saveWorkspacePrefs(projectId, prefs);
  }, [projectId, prefsReady, mode, model, selectedIds, artifactWidth, session]);

  useEffect(() => {
    return () => setSidebarHidden(false);
  }, [setSidebarHidden]);

  useEffect(() => {
    if (!pendingPanel || pendingPanel.projectId !== projectId) return;
    const next = focusFromPending(pendingPanel);
    setFocus(next);
    setPanelOpen(true);
    if (next.kind !== "material" && "title" in next) rememberActive(next, "open");
    setPendingPanel(null);
  }, [pendingPanel, projectId, setPendingPanel]);

  async function onDelete() {
    if (!user || !project) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteProject(project.id, user.uid);
      router.replace("/");
    } catch (err) {
      setDeleting(false);
      setDeleteError(err instanceof Error ? err.message : "Could not delete project.");
    }
  }

  useEffect(() => {
    if (!project) {
      setProjectSettings(null);
      return;
    }
    setProjectSettings({
      projectTitle: project.title,
      deleting,
      deleteError,
      onDelete: () => void onDelete(),
    });
    return () => setProjectSettings(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, deleting, deleteError]);

  function rememberActive(artifact: ChatArtifact, status: ActiveArtifactStatus) {
    if (!user) return;
    const active = chatArtifactToActive(artifact, status);
    setProject((current) => (current ? { ...current, activeArtifact: active } : current));
    void updateProjectActiveArtifact(projectId, user.uid, active).catch(() => undefined);
  }

  function openArtifact(next: ChatArtifact) {
    setFocus(next);
    setPanelOpen(true);
    rememberActive(next, "open");
  }

  function togglePanel() {
    if (session) {
      exitSession();
      return;
    }
    setPanelOpen((open) => !open);
  }

  async function copyShare() {
    try {
      const url = `${window.location.origin}/project/${projectId}`;
      await navigator.clipboard.writeText(url);
    } catch {
      // Ignore clipboard failures.
    }
  }

  function startPractice(artifact: ChatArtifact) {
    const ids = artifact.ids?.length ? artifact.ids : [artifact.id];
    if (!session) {
      savedLayout.current = { width: widthRef.current };
    }
    setSidebarHidden(true);
    setSession({ setId: artifact.id, ids });
    setPanelOpen(true);
    const expanded = Math.round(window.innerWidth * 0.62);
    setArtifactWidth(Math.min(Math.round(window.innerWidth * 0.78), Math.max(420, expanded)));
    rememberActive(artifact, "in_progress");
  }

  function exitSession() {
    setSession(null);
    setSidebarHidden(false);
    if (savedLayout.current) {
      setArtifactWidth(savedLayout.current.width);
    }
  }

  function closePanel() {
    if (session) exitSession();
    setPanelOpen(false);
  }

  useEffect(() => {
    setMobileTopActions(
      <>
        <button
          type="button"
          onClick={() => void copyShare()}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-foreground"
          aria-label="Share"
        >
          <IconShare />
        </button>
        {!panelOpen ? (
          <button
            type="button"
            onClick={togglePanel}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-foreground"
            aria-label="Open panel"
          >
            <IconPanel />
          </button>
        ) : null}
      </>,
    );
    return () => setMobileTopActions(null);
  }, [panelOpen, setMobileTopActions]);

  function onResizeStart(event: ReactMouseEvent) {
    event.preventDefault();
    setResizing(true);
    const startX = event.clientX;
    const startW = widthRef.current;
    function move(ev: MouseEvent) {
      const minChat = 240;
      const max = session
        ? Math.max(420, window.innerWidth - minChat)
        : Math.round(window.innerWidth * 0.55);
      const min = session ? Math.round(window.innerWidth * 0.42) : MIN_ARTIFACT;
      const next = Math.min(max, Math.max(min, startW + (startX - ev.clientX)));
      setArtifactWidth(next);
    }
    function up() {
      setResizing(false);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  if (loading) {
    return <div className="flex h-full items-center px-8 text-sm text-muted">Loading project…</div>;
  }

  if (!project || !user) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <p className="text-sm text-muted">{error ?? "Project not found."}</p>
        <Link href="/" className="mt-4 inline-block text-sm text-muted hover:text-foreground">
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 bg-transparent">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
        <div className="pointer-events-none absolute right-3 top-3 z-20 hidden items-center gap-1 md:flex">
          <button
            type="button"
            onClick={() => void copyShare()}
            className="pointer-events-auto rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
            aria-label="Share"
          >
            <IconShare />
          </button>
          {!panelOpen && (
            <button
              type="button"
              onClick={togglePanel}
              className="pointer-events-auto rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
              aria-label="Open panel"
            >
              <IconPanel />
            </button>
          )}
        </div>
        <ProjectChat
          project={project}
          userId={user.uid}
          model={model}
          materials={materials}
          selectedIds={selectedIds}
          onOpenArtifact={openArtifact}
          onProjectPatch={(patch) => setProject((current) => (current ? { ...current, ...patch } : current))}
        />
      </div>
      <div
        className={`h-full shrink-0 overflow-hidden max-md:absolute max-md:inset-0 max-md:z-30 max-md:bg-surface ${
          resizing ? "" : "transition-[width,opacity] duration-[220ms] ease-[ease]"
        } ${panelOpen ? "opacity-100 max-md:!w-full" : "pointer-events-none opacity-0 max-md:!w-0"}`}
        style={{ width: panelOpen ? artifactWidth : 0 }}
        aria-hidden={!panelOpen}
      >
        <div className="h-full max-md:!w-full" style={{ width: artifactWidth }}>
          <ArtifactPanel
            projectId={project.id}
            userId={user.uid}
            focus={focus}
            session={session}
            width={artifactWidth}
            onResizeStart={onResizeStart}
            onClose={closePanel}
            onStartPractice={startPractice}
            onExitSession={exitSession}
            onActivate={(artifact) => rememberActive(artifact, "open")}
          />
        </div>
      </div>
    </div>
  );
}
