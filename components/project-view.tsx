"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { asChatMode } from "@/lib/core/chat-modes";
import { DEFAULT_CHAT_THREAD_ID } from "@/lib/core/constants";
import { loadSavedChatMode, saveChatMode, writeLocalChatMode } from "@/lib/workspace/chat-mode";
import { peekOpeningProject, waitForOpeningProject } from "@/lib/workspace/start-project";
import {
  deleteProject,
  getProjectById,
  updateProjectActiveArtifact,
  updateProjectChatMode,
} from "@/lib/projects";
import { listEarlierChatMessages, setChatSharing, subscribeChatThreads } from "@/lib/chats";
import { subscribeMaterials } from "@/lib/materials";
import {
  loadWorkspacePrefs,
  saveWorkspacePrefs,
  type WorkspacePrefs,
} from "@/lib/workspace/prefs";
import { useAuth } from "@/components/auth-provider";
import { ProjectChat } from "@/components/project-chat";
import { ProjectLoading } from "@/components/project-loading";
import { ArtifactPanel, type ArtifactFocus, type ArtifactTabId } from "@/components/workspace/artifact-panel";
import { SourcesPane } from "@/components/workspace/sources-pane";
import type { StudioRequest, StudioTile } from "@/lib/workspace/studio";
import { useShell } from "@/components/workspace/shell-context";
import { QuietIconCluster, type QuietIconAction } from "@/components/workspace/quiet-icon-cluster";
import { UiIcon } from "@/components/workspace/ui-icon";
import { usePreferredModel } from "@/components/account/use-preferred-model";
import { chatArtifactToActive } from "@/lib/artifacts/active";
import type { ActiveArtifactStatus } from "@/types/project";
import type { Material } from "@/types/material";
import type { ChatArtifact, ChatMessage, ChatMode, Project } from "@/types";
import type { PathLiveState } from "@/types/path";
import type { NotesLiveState } from "@/types/study-sheet";
import type { NotesGenerateEvent } from "@/lib/study-sheets/generate-client";
import type { PathGenerateEvent } from "@/lib/paths/generate-client";
import { CREATING_NOTES_STATUS } from "@/lib/chat/dispatch";
import type { SetResult } from "@/lib/exercises/session";

const MIN_ARTIFACT = 300;
const MAX_ARTIFACT = 520;
const MIN_NOTES = 360;
const MIN_CHAT = 420;
const SOURCES_MIN = 260;
const SOURCES_MAX = 440;
const SOURCES_DEFAULT = 320;
const PANEL_OUTER_GAP = 8;
const SOURCES_KEY = "tv.sources.open";
const SOURCES_WIDTH_KEY = "tv.sources.width";
const STUDIO_KEY = "tv.studio.open";

function readWidth(key: string, fallback: number, min: number, max: number): number {
  if (typeof window === "undefined") return fallback;
  const value = Number(window.localStorage.getItem(key));
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function readFlag(key: string): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(key);
    return value === "1" ? true : value === "0" ? false : null;
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* private mode */
  }
}

function isDesktop() {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
}

function focusFromPending(pending: {
  kind: "material" | "sheet" | "plan" | "practice" | "path" | "settings";
  id: string;
  title?: string;
}): ArtifactFocus {
  if (pending.kind === "material") return { kind: "material", id: pending.id };
  if (pending.kind === "settings") return { kind: "settings", id: pending.id };
  if (pending.kind === "practice") return { kind: "practice", id: pending.id, title: pending.title || "Quiz" };
  if (pending.kind === "path") return { kind: "path", id: pending.id, title: pending.title || "Path" };
  if (pending.kind === "plan") return { kind: "plan", id: pending.id, title: pending.title || "Study plan" };
  return { kind: "sheet", id: pending.id, title: pending.title || "Notes" };
}

export function ProjectView({
  projectId,
  threadId,
  initialProject,
  initialMessages,
}: {
  projectId: string;
  threadId?: string;
  initialProject?: Project;
  initialMessages?: ChatMessage[];
  initialOlderCursor?: string | null;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { setProjectSettings, setSidebarHidden, pendingPanel, setPendingPanel, setProjectShare } = useShell();
  const [project, setProject] = useState<Project | null>(null);
  const [bootstrapMessages, setBootstrapMessages] = useState<ChatMessage[]>(initialMessages ?? []);
  const [threadTitle, setThreadTitle] = useState<string | undefined>();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [mode, setMode] = useState<ChatMode>(() => loadSavedChatMode());
  const { model } = usePreferredModel();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [prefsReady, setPrefsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [panelOwnChrome, setPanelOwnChrome] = useState(false);
  const [composerHeight, setComposerHeight] = useState(128);
  const activeRouteProjectId = pathname.match(/^\/(?:p|c)\/([^/]+)/)?.[1] ?? null;
  const isActiveProjectView = activeRouteProjectId === projectId;
  const [focus, setFocus] = useState<ArtifactFocus | null>(null);
  const [session, setSession] = useState<{ setId: string; ids: string[]; mode?: "practice" | "exam" } | null>(null);
  const [artifactWidth, setArtifactWidth] = useState(420);
  const [sourcesWidth, setSourcesWidth] = useState(SOURCES_DEFAULT);
  const [resizing, setResizing] = useState(false);
  const [panelView, setPanelView] = useState<ArtifactTabId>("studio");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [phone, setPhone] = useState(false);
  const [mobilePane, setMobilePane] = useState<"chat" | "sources" | "studio">("chat");
  const [studioRequest, setStudioRequest] = useState<StudioRequest | null>(null);
  const [readingId, setReadingId] = useState<string | null>(null);
  const studioSeq = useRef(0);
  const sourcesWidthRef = useRef(0);
  const [notesLive, setNotesLive] = useState<NotesLiveState | null>(null);
  const [pathLive, setPathLive] = useState<PathLiveState | null>(null);
  const [finishedSet, setFinishedSet] = useState<SetResult | null>(null);
  const [shareNotice, setShareNotice] = useState<"copied" | "error" | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  const [shareActive, setShareActive] = useState(false);
  const [sharing, setSharing] = useState(false);
  const openedAt = useRef(Date.now());
  const prefsRef = useRef<WorkspacePrefs | null>(null);
  const widthRef = useRef(420);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const materialReturn = useRef<{ focus: ArtifactFocus | null; panelOpen: boolean } | null>(null);
  widthRef.current = artifactWidth;
  sourcesWidthRef.current = sourcesOpen ? sourcesWidth : 0;

  useEffect(() => {
    if (!shareNotice) return;
    const timeout = window.setTimeout(() => setShareNotice(null), shareNotice === "copied" ? 2600 : 5000);
    return () => window.clearTimeout(timeout);
  }, [shareNotice]);

  const getWorkspaceWidth = useCallback(() => {
    const total = workspaceRef.current?.clientWidth || (typeof window === "undefined" ? 0 : window.innerWidth);
    return Math.max(0, total - sourcesWidthRef.current);
  }, []);

  const ensureMinWidth = useCallback((min: number) => {
    const max = Math.max(min, getWorkspaceWidth() - MIN_CHAT);
    const floor = Math.min(min, max);
    setArtifactWidth((current) => Math.min(max, Math.max(floor, current)));
  }, [getWorkspaceWidth]);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    function apply() {
      const mobile = mq.matches;
      setPhone(mobile);
      if (mobile) return;
      setSourcesOpen(readFlag(SOURCES_KEY) ?? true);
      setPanelOpen(readFlag(STUDIO_KEY) ?? true);
      setSourcesWidth(readWidth(SOURCES_WIDTH_KEY, SOURCES_DEFAULT, SOURCES_MIN, SOURCES_MAX));
    }
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [projectId]);

  useEffect(() => {
    if (!prefsReady) return;
    function clampPanelWidths() {
      const workspace = workspaceRef.current?.clientWidth || window.innerWidth;
      let sources = sourcesOpen ? sourcesWidth : 0;
      let artifact = panelOpen ? artifactWidth : 0;
      const overflow = Math.max(0, sources + artifact + MIN_CHAT - workspace);
      const sourcesSlack = sourcesOpen ? Math.max(0, sources - SOURCES_MIN) : 0;
      const artifactMin = session
        ? Math.round(window.innerWidth * 0.42)
        : panelView === "sheets" || panelView === "path"
          ? MIN_NOTES
          : MIN_ARTIFACT;
      const artifactSlack = panelOpen ? Math.max(0, artifact - artifactMin) : 0;
      const totalSlack = sourcesSlack + artifactSlack;
      if (overflow > 0 && totalSlack > 0) {
        const sourceReduction = Math.min(sourcesSlack, overflow * (sourcesSlack / totalSlack));
        const artifactReduction = Math.min(artifactSlack, overflow - sourceReduction);
        sources -= sourceReduction;
        artifact -= artifactReduction;
      }
      if (sourcesOpen) setSourcesWidth((current) => Math.min(current, sources));
      if (panelOpen) setArtifactWidth((current) => Math.min(current, artifact));
    }
    clampPanelWidths();
    window.addEventListener("resize", clampPanelWidths);
    return () => window.removeEventListener("resize", clampPanelWidths);
  }, [prefsReady, sourcesOpen, sourcesWidth, panelOpen, artifactWidth, panelView, session]);

  useLayoutEffect(() => {
    const seeded = peekOpeningProject(projectId);
    if (seeded) {
      setProject(seeded);
      setError(null);
      return;
    }
    if (initialProject?.id === projectId) {
      setProject(initialProject);
      setError(null);
      setPrefsReady(false);
      return;
    }
    setProject(null);
    setPrefsReady(false);
  }, [projectId, initialProject]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      if (initialProject?.id === projectId && initialProject.userId === user.uid) {
        const prefs = loadWorkspacePrefs(projectId, asChatMode(initialProject.preferredChatMode));
        if (cancelled) return;
        setProject(initialProject);
        prefsRef.current = prefs;
        setMode(prefs.mode);
        writeLocalChatMode(prefs.mode);
        setSelectedIds(prefs.selectedMaterialIds);
        setArtifactWidth(prefs.artifactWidth);
        setPrefsReady(true);
        return;
      }
      try {
        await waitForOpeningProject(projectId);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error && err.message.trim() ? err.message : "Could not start.");
        }
      }
      try {
        const item = await getProjectById(projectId);
        if (cancelled) return;
        if (!item || item.userId !== user.uid) {
          if (peekOpeningProject(projectId)) return;
          setError(item ? "You do not have access to this project." : "Project not found.");
          return;
        }
        setProject(item);
        const prefs = loadWorkspacePrefs(projectId, asChatMode(item.preferredChatMode));
        prefsRef.current = prefs;
        setMode(prefs.mode);
        writeLocalChatMode(prefs.mode);
        setSelectedIds(prefs.selectedMaterialIds);
        setArtifactWidth(prefs.artifactWidth);
        setPrefsReady(true);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load project.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialProject, projectId, user, threadId]);

  const loadOlderMessages = useCallback((beforeId: string) =>
    listEarlierChatMessages(projectId, threadId || DEFAULT_CHAT_THREAD_ID, beforeId), [projectId, threadId]);

  useEffect(() => {
    return subscribeMaterials(projectId, setMaterials, (err) => setError(err.message));
  }, [projectId]);

  useEffect(() => {
    return subscribeChatThreads(projectId, (threads) => {
      const id = threadId || DEFAULT_CHAT_THREAD_ID;
      setThreadTitle(threads.find((item) => item.id === id)?.title);
    });
  }, [projectId, threadId]);

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

  const rememberActive = useCallback((artifact: ChatArtifact, status: ActiveArtifactStatus) => {
    if (!user) return;
    const active = chatArtifactToActive(artifact, status);
    setProject((current) => (current ? { ...current, activeArtifact: active } : current));
    void updateProjectActiveArtifact(projectId, user.uid, active).catch(() => undefined);
  }, [user, projectId]);

  useEffect(() => {
    if (!pendingPanel || pendingPanel.projectId !== projectId) return;
    const next = focusFromPending(pendingPanel);
    if (next.kind === "material") {
      setReadingId(next.id);
      setMobilePane("sources");
      setPendingPanel(null);
      return;
    }
    setFocus(next);
    revealStudio();
    if (next.kind === "sheet" || next.kind === "plan" || next.kind === "path") ensureMinWidth(MIN_NOTES);
    if (next.kind !== "material" && "title" in next) rememberActive(next, "open");
    setPendingPanel(null);
  }, [pendingPanel, projectId, setPendingPanel, rememberActive, ensureMinWidth]);

  async function onDelete() {
    if (!user || !project) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteProject(project.id, user.uid);
      router.replace("/new");
    } catch (err) {
      setDeleting(false);
      setDeleteError(err instanceof Error ? err.message : "Could not delete project.");
    }
  }

  useEffect(() => {
    if (!isActiveProjectView) {
      setProjectSettings(null);
      return;
    }
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
  }, [project, deleting, deleteError, isActiveProjectView]);

  function keepPathPanel() {
    return panelOpen && (focus?.kind === "path" || panelView === "path");
  }

  function openArtifact(next: ChatArtifact) {
    if (next.kind === "sheet" && keepPathPanel()) {
      rememberActive(next, "open");
      ensureMinWidth(MIN_NOTES);
      return;
    }
    setFocus(next);
    revealStudio();
    if (next.kind === "sheet" || next.kind === "plan" || next.kind === "path") ensureMinWidth(MIN_NOTES);
    rememberActive(next, "open");
  }

  function openMaterial(id: string) {
    setReadingId(id);
  }

  function closeMaterial() {
    const previous = materialReturn.current;
    materialReturn.current = null;
    if (previous?.panelOpen) {
      setFocus(previous.focus);
      revealStudio();
      return;
    }
    closePanel();
  }

  function handleNotesLive(event: NotesGenerateEvent | "start" | null) {
    if (event === null) {
      setNotesLive(null);
      return;
    }
    if (event === "start") {
      setNotesLive({ title: "Notes", blocks: [], status: CREATING_NOTES_STATUS });
      if (keepPathPanel()) {
        ensureMinWidth(MIN_NOTES);
        return;
      }
      setFocus({ kind: "sheet", id: "", title: "Notes" });
      revealStudio();
      ensureMinWidth(MIN_NOTES);
      return;
    }
    setNotesLive((current) => {
      const base = current ?? { title: "Notes", blocks: [], status: CREATING_NOTES_STATUS };
      return {
        title: event.title?.trim() || base.title,
        blocks: event.blocks ?? base.blocks,
        content: event.content ?? base.content,
        status: event.status === undefined ? base.status : event.status,
        sheetId: event.sheetId || base.sheetId,
      };
    });
    revealStudio();
    ensureMinWidth(MIN_NOTES);
    if (event.sheetId) {
      if (keepPathPanel()) return;
      setFocus({
        kind: "sheet",
        id: event.sheetId,
        title: event.title || "Notes",
      });
    }
  }

  function handlePathLive(event: PathGenerateEvent | "start" | null) {
    if (event === null) {
      setPathLive(null);
      return;
    }
    if (event === "start") {
      setPathLive({ title: "Path", courses: [], status: "Mapping the path…" });
      setFocus({ kind: "path", id: "", title: "Path" });
      revealStudio();
      ensureMinWidth(MIN_NOTES);
      return;
    }
    setPathLive((current) => {
      const base = current ?? { title: "Path", courses: [], status: "Mapping the path…" };
      return {
        title: event.title?.trim() || base.title,
        courses: event.courses ?? base.courses,
        status: event.status === undefined ? base.status : event.status,
        pathId: event.pathId || base.pathId,
      };
    });
    revealStudio();
    ensureMinWidth(MIN_NOTES);
    if (event.pathId) {
      setFocus({ kind: "path", id: event.pathId, title: event.title || "Path" });
    }
  }

  async function copyShare() {
    if (sharing) return;
    setSharing(true);
    try {
      const body = await setChatSharing(projectId, threadId, true);
      if (!body.shareId) throw new Error("Could not create a share link.");
      setShareActive(true);
      const url = `${window.location.origin}/s/${body.shareId}`;
      await navigator.clipboard.writeText(url);
      setShareError(null);
      setShareNotice("copied");
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "Could not share chat.");
      setShareNotice("error");
    } finally {
      setSharing(false);
    }
  }

  async function unshare() {
    if (sharing) return;
    setSharing(true);
    try {
      await setChatSharing(projectId, threadId, false);
      setShareActive(false);
      setShareError(null);
      setShareNotice(null);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "Could not unshare chat.");
      setShareNotice("error");
    } finally {
      setSharing(false);
    }
  }

  function startPractice(artifact: ChatArtifact) {
    const ids = artifact.ids?.length ? artifact.ids : [artifact.id];
    setSession({ setId: artifact.id, ids, mode: artifact.mode === "exam" ? "exam" : "practice" });
    revealStudio();
    rememberActive(artifact, "in_progress");
  }

  function exitSession() {
    setSession(null);
    setSidebarHidden(false);
  }

  function setSources(open: boolean) {
    setSourcesOpen(open);
    writeFlag(SOURCES_KEY, open);
  }

  function setStudio(open: boolean) {
    setPanelOpen(open);
    if (isDesktop()) writeFlag(STUDIO_KEY, open);
  }

  function createFromStudio(tile: StudioTile, run?: { prompt: string; tool?: StudioTile["tool"] }) {
    studioSeq.current += 1;
    setStudioRequest({
      id: studioSeq.current,
      label: tile.label,
      prompt: run?.prompt ?? tile.prompt,
      tool: run && !run.tool ? undefined : run?.tool ?? tile.tool,
    });
    if (!isDesktop()) setPanelOpen(false);
  }

  function closePanel() {
    if (session) exitSession();
    setPanelExpanded(false);
    setPanelOwnChrome(false);
    setStudio(false);
  }

  useEffect(() => {
    if (!panelOpen) {
      setPanelExpanded(false);
      setPanelOwnChrome(false);
    }
  }, [panelOpen]);

  const onPanelViewChange = useCallback((view: ArtifactTabId) => {
    setPanelView(view);
    if (view === "sheets" || view === "path") ensureMinWidth(MIN_NOTES);
  }, [ensureMinWidth]);

  const panelToggleAction: QuietIconAction = {
    id: "sidebar",
    label: panelOpen ? "Hide Studio" : "Show Studio",
    icon: "sidebarRight",
    onClick: () => setStudio(!panelOpen),
  };
  const sourcesToggleAction: QuietIconAction = {
    id: "sources",
    label: sourcesOpen ? "Hide sources" : "Show sources",
    icon: "sidebarLeft",
    onClick: () => setSources(!sourcesOpen),
  };

  useEffect(() => {
    if (!isActiveProjectView) {
      setProjectShare(null);
      return;
    }
    setProjectShare({
      active: shareActive,
      busy: sharing,
      onToggle: () => void (shareActive ? unshare() : copyShare()),
    });
    return () => setProjectShare(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setProjectShare, shareActive, sharing, projectId, threadId, isActiveProjectView]);

  function clampPane(width: number, min: number, max: number, other: number) {
    const workspace = workspaceRef.current?.clientWidth || window.innerWidth;
    const room = Math.max(min, workspace - other - MIN_CHAT);
    const cap = Math.min(max, room);
    return Math.min(cap, Math.max(Math.min(min, cap), width));
  }

  function paintWidth(reserve: HTMLDivElement | null, slot: HTMLDivElement | null, inner: HTMLDivElement | null, width: number) {
    const reservePx = `${width}px`;
    const panelPx = `${Math.max(0, width - PANEL_OUTER_GAP)}px`;
    if (reserve) reserve.style.width = reservePx;
    if (slot) slot.style.width = panelPx;
    if (inner) {
      inner.style.width = panelPx;
      inner.style.minWidth = panelPx;
    }
  }

  function onSourcesResizeStart(event: ReactMouseEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startW = sourcesWidth;
    const reserve = event.currentTarget.parentElement?.previousElementSibling as HTMLDivElement | null;
    const slot = event.currentTarget.parentElement as HTMLDivElement | null;
    const inner = slot?.firstElementChild as HTMLDivElement | null;
    setResizing(true);
    function move(ev: MouseEvent) {
      const next = clampPane(startW + (ev.clientX - startX), SOURCES_MIN, SOURCES_MAX, panelOpen ? widthRef.current : 0);
      sourcesWidthRef.current = next;
      paintWidth(reserve, slot, inner, next);
    }
    function up() {
      setResizing(false);
      const next = sourcesWidthRef.current || startW;
      setSourcesWidth(next);
      try { window.localStorage.setItem(SOURCES_WIDTH_KEY, String(next)); } catch { /* private mode */ }
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function onResizeStart(event: ReactMouseEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startW = widthRef.current;
    const slot = (event.currentTarget.closest(".artifact-panel-slot") as HTMLDivElement | null);
    const reserve = slot?.previousElementSibling as HTMLDivElement | null;
    const inner = slot?.firstElementChild as HTMLDivElement | null;
    const min = session ? Math.round(window.innerWidth * 0.42) : panelView === "sheets" || panelView === "path" ? MIN_NOTES : MIN_ARTIFACT;
    setResizing(true);
    function move(ev: MouseEvent) {
      const next = clampPane(startW + (startX - ev.clientX), min, MAX_ARTIFACT, sourcesOpen ? sourcesWidthRef.current : 0);
      widthRef.current = next;
      paintWidth(reserve, slot, inner, next);
    }
    function up() {
      setResizing(false);
      setArtifactWidth(widthRef.current);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function revealStudio() {
    setPanelOpen(true);
    setMobilePane("studio");
  }

  const studioShown = phone ? mobilePane === "studio" : panelOpen;

  if (!user) return null;

  if (!project) {
    if (error) {
      return (
        <div className="mx-auto max-w-3xl px-8 py-10">
          <p className="text-sm text-muted">{error}</p>
          <Link href="/new" className="mt-4 inline-block text-sm text-muted hover:text-foreground">
            Back
          </Link>
        </div>
      );
    }
    return <ProjectLoading />;
  }

  return (
    <div ref={workspaceRef} className={`project-workspace relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent md:overflow-x-auto md:overflow-y-hidden ${resizing ? "pane-resizing" : ""}`}>
      <div
        className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden"
        style={phone ? undefined : {
          minWidth: (sourcesOpen ? sourcesWidth : 0) + (panelOpen ? artifactWidth : 0) + MIN_CHAT,
        }}
      >
      <div
        aria-hidden="true"
        className="artifact-panel-reserve pointer-events-none relative hidden h-full shrink-0 md:block"
        style={{ width: sourcesOpen ? sourcesWidth : 0 }}
      />
      {phone ? null : (
      <div
        className={`artifact-panel-slot edge-stroke absolute left-0 top-0 bottom-0 z-30 hidden max-w-full bg-surface md:left-2 md:top-2 md:bottom-2 md:rounded-2xl shrink-0 overflow-hidden md:block ${
          sourcesOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        style={{ width: sourcesOpen ? Math.max(0, sourcesWidth - PANEL_OUTER_GAP) : 0 }}
        data-panel-open={sourcesOpen}
        aria-hidden={!sourcesOpen}
        inert={sourcesOpen ? undefined : true}
      >
        <div
          className={`absolute inset-y-0 left-0 h-full overflow-hidden transition-opacity duration-[160ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${sourcesOpen ? "opacity-100" : "opacity-0"}`}
          style={{
            width: Math.max(0, sourcesWidth - PANEL_OUTER_GAP),
            minWidth: Math.max(0, sourcesWidth - PANEL_OUTER_GAP),
          }}
        >
          <SourcesPane
            className="h-full"
            projectId={project.id}
            userId={user.uid}
            items={materials}
            selectedIds={selectedIds}
            onSelectedIds={setSelectedIds}
            onOpenMaterial={openMaterial}
            readingId={readingId}
            onCloseReading={() => setReadingId(null)}
          />
        </div>
        <button type="button" aria-label="Resize sources" onMouseDown={onSourcesResizeStart} className="absolute inset-y-0 right-0 z-10 hidden w-2 cursor-col-resize md:block" />
      </div>
      )}
      {phone && mobilePane === "sources" ? (
        <div className="absolute inset-2 z-[35] min-w-0 overflow-hidden rounded-2xl border border-border bg-surface-2">
          <SourcesPane
            className="h-full w-full"
            projectId={project.id}
            userId={user.uid}
            items={materials}
            selectedIds={selectedIds}
            onSelectedIds={setSelectedIds}
            onOpenMaterial={openMaterial}
            readingId={readingId}
            onCloseReading={() => setReadingId(null)}
          />
        </div>
      ) : null}
      <div className="pointer-events-none absolute left-3 top-2 z-40 hidden md:flex">
        <QuietIconCluster className="pointer-events-auto" size={18} actions={[sourcesToggleAction]} />
      </div>
      <div className="pointer-events-none absolute right-3 top-2 z-40 hidden md:flex">
        <QuietIconCluster className="pointer-events-auto" size={18} actions={[panelToggleAction]} />
      </div>
      <div className={`relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent ${mobilePane === "chat" ? "" : "max-md:hidden"}`} style={phone ? undefined : { minWidth: MIN_CHAT }}>
        {shareNotice ? (
          <div
            role={shareNotice === "error" ? "alert" : "status"}
            className="fixed bottom-4 right-4 z-[80] flex max-w-[min(92vw,420px)] items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-[14px] text-foreground shadow-lg"
          >
            <span>{shareNotice === "copied" ? "Public link copied" : shareError || "Could not update sharing."}</span>
            <button type="button" aria-label="Dismiss" onClick={() => setShareNotice(null)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-foreground/10 hover:text-foreground">
              <span aria-hidden className="text-[20px] leading-none">×</span>
            </button>
          </div>
        ) : null}
        <ProjectChat
          key={`${project.id}:${threadId || DEFAULT_CHAT_THREAD_ID}`}
          project={project}
          isActive={isActiveProjectView}
          initialMessages={bootstrapMessages}
          onLoadOlder={loadOlderMessages}
          userId={user.uid}
          threadId={threadId}
          threadTitle={threadTitle}
          chatMode={mode}
          onChatMode={(next) => {
            setMode(next);
            saveChatMode(next);
            void updateProjectChatMode(project.id, user.uid, next).catch(() => undefined);
          }}
          materials={materials}
          selectedIds={selectedIds}
          onOpenArtifact={openArtifact}
          onStartPractice={startPractice}
          onNotesLive={handleNotesLive}
          onPathLive={handlePathLive}
          onOpenMaterial={openMaterial}
          onProjectPatch={(patch) => setProject((current) => (current ? { ...current, ...patch } : current))}
          finishedSet={finishedSet}
          onFinishedSetHandled={() => setFinishedSet(null)}
          onComposerHeightChange={setComposerHeight}
          chatLayoutWidth={panelOpen ? artifactWidth : 0}
          studioRequest={studioRequest}
          onStudioRequestHandled={(id) => setStudioRequest((current) => (current?.id === id ? null : current))}
        />
      </div>
      <div
        aria-hidden="true"
        className="artifact-panel-reserve pointer-events-none relative hidden h-full shrink-0 md:block"
        style={{ width: panelOpen ? artifactWidth : 0 }}
      />
      <div
        className={`artifact-panel-slot edge-stroke absolute inset-y-0 right-0 z-30 max-w-full bg-surface md:right-2 md:top-2 md:bottom-2 md:rounded-2xl shrink-0 overflow-hidden ${
          mobilePane === "studio" ? "mobile-page max-md:pointer-events-auto" : "max-md:hidden"
        } ${
          panelExpanded
            ? "max-md:max-w-none"
            : "max-md:top-0 max-md:bottom-0 max-md:h-auto max-md:!w-full max-md:max-w-none"
        } ${
          resizing ? "artifact-panel-resizing" : ""
        } ${studioShown ? "pointer-events-auto" : "pointer-events-none"}`}
        style={{
          width: studioShown
            ? phone
              ? "100%"
              : panelExpanded
                ? `calc(100% - ${PANEL_OUTER_GAP}px)`
                : Math.max(0, artifactWidth - PANEL_OUTER_GAP)
            : 0,
          ["--composer-height" as string]: `${composerHeight}px`,
        }}
        data-panel-open={studioShown}
        aria-hidden={!studioShown}
        inert={studioShown ? undefined : true}
      >
        <div
          className={`absolute inset-y-0 right-0 h-full overflow-hidden transition-opacity duration-[160ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${studioShown ? "opacity-100" : "opacity-0"}`}
          style={{
            width: phone || panelExpanded ? "100%" : Math.max(0, artifactWidth - PANEL_OUTER_GAP),
            minWidth: phone || panelExpanded ? undefined : Math.max(0, artifactWidth - PANEL_OUTER_GAP),
          }}
        >
          <ArtifactPanel
            projectId={project.id}
            userId={user.uid}
            listedProject
            onStudioCreate={createFromStudio}
            studioBusy={studioRequest !== null || notesLive != null || pathLive != null}
            generatingLabel={
              studioRequest?.label ?? (notesLive != null || pathLive != null ? "Studio" : null)
            }
            focus={focus}
            session={session}
            onResizeStart={onResizeStart}
            onCloseMaterial={closeMaterial}
            onStartPractice={startPractice}
            onExitSession={exitSession}
            onPracticeComplete={setFinishedSet}
            onViewChange={onPanelViewChange}
            onActivate={(artifact) => rememberActive(artifact, "open")}
            onPanelChromeChange={setPanelOwnChrome}
            liveNote={notesLive}
            livePath={pathLive}
            onLiveSettled={() => setNotesLive(null)}
            onLivePathSettled={() => setPathLive(null)}
          />
        </div>
      </div>
      </div>
      <nav aria-label="Workspace" className="mobile-tabbar flex shrink-0 border-t border-border bg-background md:hidden">
        {(
          [
            ["chat", "Chat", "chat"],
            ["sources", "Sources", "materials"],
            ["studio", "Studio", "spark"],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            aria-current={mobilePane === id ? "page" : undefined}
            onClick={() => {
              const active = document.activeElement;
              if (active instanceof HTMLElement) active.blur();
              setMobilePane(id);
            }}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] ${
              mobilePane === id ? "text-foreground" : "text-muted"
            }`}
          >
            <UiIcon name={icon} size={18} />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
