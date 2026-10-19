"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { subscribeChatMessages } from "@/lib/chats";
import { subscribeMaterials } from "@/lib/materials";
import { subscribeStudySheets } from "@/lib/study-sheets/store";
import { subscribeStudyPaths } from "@/lib/paths/store";
import { liveStudyPath } from "@/lib/paths/model";
import { PathView } from "@/components/workspace/path-view";
import { StatusWait } from "@/components/workspace/status-wait";
import { loadPracticeProgress } from "@/lib/workspace/practice-progress";
import type { SetResult } from "@/lib/exercises/session";
import { PracticeSession } from "@/components/exercises/practice-session";
import { RichContent } from "@/components/rich-content";
import { NoteDocument, NoteTitle } from "@/components/visuals/note-document";
import { VisualList } from "@/components/visuals/visual-block";
import { QuietIconCluster } from "@/components/workspace/quiet-icon-cluster";
import { ProjectSettingsPane } from "@/components/workspace/project-settings-pane";
import { MaterialText } from "@/components/workspace/material-text";
import { UiIcon } from "@/components/workspace/ui-icon";
import { StudioPane } from "@/components/workspace/studio-pane";
import type { StudioJob, StudioSavedArtifact, StudioTile } from "@/lib/workspace/studio";
import { subscribeStudioArtifacts } from "@/lib/workspace/studio-store";
import { useAuth } from "@/components/auth-provider";
import { isGuestUser } from "@/lib/guest";
import type { ChatArtifact, ChatMessage } from "@/types/chat";
import type { Material } from "@/types/material";
import type { PathLiveState, StudyPath } from "@/types/path";
import type { NotesLiveState, StudySheet } from "@/types/study-sheet";
import type { VisualBlock } from "@/types/visual";

export type ArtifactTabId = "studio" | "materials" | "sheets" | "practice" | "path" | "settings";
type TabId = ArtifactTabId;

export type ArtifactFocus = ChatArtifact | { kind: "material" | "settings"; id: string };

export function ArtifactPanel({
  projectId,
  userId,
  listedProject,
  focus,
  session,
  onCloseMaterial,
  onStartPractice,
  onExitSession,
  onPracticeComplete,
  onViewChange,
  onActivate,
  onPanelChromeChange,
  hideTopBarOverride = false,
  liveNote = null,
  livePath = null,
  onLiveSettled,
  onLivePathSettled,
  onStudioCreate,
  studioBusy = false,
  generatingLabel = null,
  studioJob = null,
  onStudioRetry,
  selectedSourceIds = [],
}: {
  projectId: string;
  userId: string;
  listedProject: boolean;
  focus: ArtifactFocus | null;
  session: { setId: string; ids: string[]; mode?: "practice" | "exam" } | null;
  onCloseMaterial?: () => void;
  onStartPractice: (artifact: ChatArtifact) => void;
  onExitSession: () => void;
  onPracticeComplete?: (result: SetResult) => void;
  onViewChange?: (view: TabId) => void;
  onActivate?: (artifact: ChatArtifact) => void;
  onPanelChromeChange?: (ownsChrome: boolean) => void;
  hideTopBarOverride?: boolean;
  liveNote?: NotesLiveState | null;
  livePath?: PathLiveState | null;
  onLiveSettled?: () => void;
  onLivePathSettled?: () => void;
  onStudioCreate?: (tile: StudioTile, run?: { prompt: string; tool?: StudioTile["tool"] }) => void;
  studioBusy?: boolean;
  generatingLabel?: string | null;
  studioJob?: StudioJob | null;
  onStudioRetry?: () => void;
  selectedSourceIds?: string[];
}) {
  const { user } = useAuth();
  const canViewFiles = Boolean(user && !isGuestUser(user));
  const [materials, setMaterials] = useState<Material[]>([]);
  const [sheets, setSheets] = useState<StudySheet[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [paths, setPaths] = useState<StudyPath[]>([]);
  const [studioArtifacts, setStudioArtifacts] = useState<StudioSavedArtifact[]>([]);
  const [studioError, setStudioError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("studio");
  const tabRef = useRef(tab);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [practiceId, setPracticeId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [sheetsReady, setSheetsReady] = useState(false);
  const [practiceReady, setPracticeReady] = useState(false);
  const [pathsReady, setPathsReady] = useState(false);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    setSheetsReady(false);
    setPracticeReady(false);
    setPathsReady(false);
    setTab("studio");
    setMaterialId(null);
    setSheetId(null);
    setPracticeId(null);
  }, [projectId]);

  useEffect(() => subscribeMaterials(projectId, setMaterials), [projectId]);
  useEffect(() => {
    setStudioArtifacts([]);
    setStudioError(null);
    return subscribeStudioArtifacts(projectId, (items) => { setStudioArtifacts(items); setStudioError(null); }, (error) => setStudioError(error.message));
  }, [projectId]);
  useEffect(
    () =>
      subscribeStudySheets(
        projectId,
        (items) => {
          setSheets(items);
          setSheetsReady(true);
        },
        (err) => {
          setSheetError(err.message);
          setSheetsReady(true);
        },
      ),
    [projectId],
  );
  useEffect(
    () =>
      subscribeChatMessages(
        projectId,
        (items) => {
          setMessages(items);
          setPracticeReady(true);
        },
        () => setPracticeReady(true),
      ),
    [projectId],
  );
  useEffect(() => subscribeStudyPaths(projectId, (items) => {
    setPaths(items);
    setPathsReady(true);
  }), [projectId]);
  useEffect(() => {
    setProgress(loadPracticeProgress(projectId));
  }, [projectId, session]);

  const practiceSets = useMemo(() => {
    const seen = new Set<string>();
    const sets: ChatArtifact[] = [];
    for (const artifact of [...studioArtifacts.map((item) => item.artifact), ...[...messages].reverse().map((message) => message.artifact)]) {
      if (!artifact || artifact.kind !== "practice") continue;
      if (seen.has(artifact.id)) continue;
      seen.add(artifact.id);
      sets.push(artifact);
    }
    return sets;
  }, [messages, studioArtifacts]);

  const selectedPath = paths[0] ?? null;
  const counts = {
    materials: materials.length,
    sheets: sheets.length,
    practice: practiceSets.length,
    path: paths.length,
  };

  useEffect(() => {
    if (session || !focus) return;
    if (liveNote) {
      if (tabRef.current === "path") return;
      setSheetError(null);
      if (liveNote.sheetId) setSheetId(liveNote.sheetId);
      else if (liveNote.status) setSheetId(null);
      return;
    }
    if (livePath) {
      setTab("path");
      return;
    }
    if (focus.kind === "practice") {
      setTab("practice");
      setPracticeId(focus.id);
      return;
    }
    if (focus.kind === "path") {
      setTab("path");
      return;
    }
    if (focus.kind === "sheet" || focus.kind === "plan") {
      setTab("sheets");
      setSheetError(null);
      if (focus.id) setSheetId(focus.id);
      return;
    }
    if (focus.kind === "material") {
      setTab("materials");
      setMaterialId(focus.id);
      return;
    }
    if (focus.kind === "settings") {
      setTab("settings");
    }
  }, [focus, session, liveNote, livePath]);

  useEffect(() => {
    if (session) return;
    if (liveNote) return;
    if (tab === "sheets" && sheetsReady && counts.sheets === 0) {
      setTab("studio");
      setSheetId(null);
    }
    if (tab === "practice" && practiceReady && counts.practice === 0) {
      setTab("studio");
      setPracticeId(null);
    }
  }, [counts.sheets, counts.practice, session, tab, sheetsReady, practiceReady, liveNote]);

  useEffect(() => {
    if (session) return;
    onViewChange?.(tab);
  }, [tab, session, onViewChange]);

  const selectedMaterial = materials.find((item) => item.id === materialId) ?? null;
  const selectedSheet = sheets.find((item) => item.id === sheetId) ?? null;
  const hideTopBar = hideTopBarOverride || Boolean(session) ||
    (tab === "materials" && Boolean(selectedMaterial)) ||
    (tab === "sheets" && (Boolean(selectedSheet) || Boolean(liveNote))) ||
    (tab === "path" && Boolean(selectedPath || livePath));

  useLayoutEffect(() => {
    onPanelChromeChange?.(hideTopBar);
  }, [hideTopBar, onPanelChromeChange]);

  useEffect(() => {
    if (!liveNote || liveNote.status || !liveNote.sheetId || !onLiveSettled) return;
    const saved = sheets.find((item) => item.id === liveNote.sheetId) ?? selectedSheet;
    if (!saved || saved.id !== liveNote.sheetId) return;
    if (!notesReady(saved, liveNote)) return;
    onLiveSettled();
  }, [liveNote, selectedSheet, sheets, onLiveSettled]);

  useEffect(() => {
    if (!livePath || livePath.status || !livePath.pathId || !onLivePathSettled) return;
    if (!selectedPath || selectedPath.id !== livePath.pathId) return;
    onLivePathSettled();
  }, [livePath, selectedPath, onLivePathSettled]);

  return (
    <aside className="relative z-[1] flex h-full w-full shrink-0 flex-col overflow-hidden bg-transparent max-md:!w-full">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
        {session ? (
          <PracticeSession
            key={`${session.setId}:${session.ids.join(",")}:${session.mode ?? "practice"}`}
            projectId={projectId}
            userId={userId}
            setId={session.setId}
            ids={session.ids}
            startIndex={progress[session.setId] ?? 0}
            mode={session.mode === "exam" ? "exam" : "practice"}
            onExit={onExitSession}
            onComplete={(result) => {
              onPracticeComplete?.(result);
            }}
          />
        ) : (
          <>
            {tab === "materials" && selectedMaterial ? null : hideTopBar ? null : (
            <header className="flex h-11 shrink-0 items-center gap-1 bg-transparent py-0 pl-2 pr-12">
              <nav className="flex min-w-0 flex-1 items-center">
                <QuietIconCluster
                  size={18}
                  actions={[
                    {
                      id: "studio",
                      label: "Studio",
                      icon: "spark" as const,
                      active: tab === "studio",
                      onClick: () => setTab("studio"),
                    },
                  ]}
                />
              </nav>
            </header>
            )}

            <div className={`artifact-panel-content min-h-0 flex-1 ${tab === "materials" && materialId ? "overflow-hidden" : tab === "path" ? "overflow-hidden" : "overflow-y-auto"}`}>
              {tab === "path" && (livePath || selectedPath) ? (
                <PathView
                  path={
                    livePath
                      ? liveStudyPath({
                          title: livePath.title,
                          courses: livePath.courses,
                          id: livePath.pathId,
                        })
                      : selectedPath!
                  }
                  status={livePath?.status}
                  sheets={sheets}
                  liveNote={tab === "path" ? liveNote : null}
                />
              ) : tab === "path" && !pathsReady ? null : tab === "path" ? (
                <EmptyState title="No path yet" body="Ask for a course path from a syllabus. It will open here." />
              ) : null}
              {tab === "studio" && (
                <StudioPane
                  sheets={sheets}
                  practiceSets={practiceSets}
                  paths={paths}
                  studioArtifacts={studioArtifacts}
                  job={studioJob}
                  onRetry={onStudioRetry}
                  error={studioError}
                  sourceCount={materials.filter((item) => selectedSourceIds.includes(item.id) && item.status === "ready").length}
                  busy={studioBusy}
                  generatingLabel={generatingLabel}
                  onCreate={(tile, run) => onStudioCreate?.(tile, run)}
                  onOpenSheet={(id) => {
                    setSheetError(null);
                    setTab("sheets");
                    setSheetId(id);
                    const sheet = sheets.find((item) => item.id === id);
                    if (sheet) {
                      onActivate?.({
                        kind: sheet.title === "Study plan" ? "plan" : "sheet",
                        id: sheet.id,
                        title: sheet.title,
                      });
                    }
                  }}
                  onOpenPractice={(id) => {
                    const found = practiceSets.find((item) => item.id === id);
                    if (found) onStartPractice(found);
                  }}
                  onOpenPath={() => setTab("path")}
                />
              )}
              {tab === "materials" && (
                <MaterialsView
                  items={materials}
                  selectedId={materialId}
                  canView={canViewFiles}
                  onSelect={(id) => {
                    setMaterialId(id);
                    if (!id) setTab("studio");
                  }}
                  selected={selectedMaterial}
                  onCloseSelected={() => {
                    setMaterialId(null);
                    setTab("studio");
                    if (focus?.kind === "material") onCloseMaterial?.();
                    if (focus?.kind === "settings") setTab("settings");
                  }}
                />
              )}
              {tab === "settings" && listedProject ? (
                <ProjectSettingsPane projectId={projectId} />
              ) : null}
              {tab === "sheets" && (
                <SheetsView
                  items={sheets}
                  selected={selectedSheet}
                  liveNote={liveNote}
                  error={sheetError}
                  onSelect={(id) => {
                    setSheetError(null);
                    setSheetId(id);
                    const sheet = sheets.find((item) => item.id === id);
                    if (sheet) {
                      onActivate?.({
                        kind: sheet.title === "Study plan" ? "plan" : "sheet",
                        id: sheet.id,
                        title: sheet.title,
                      });
                    }
                  }}
                  onBack={() => {
                    setSheetId(null);
                    setTab("studio");
                    onLiveSettled?.();
                  }}
                />
              )}
              {tab === "practice" && (
                <PracticeView
                  items={practiceSets}
                  progress={progress}
                  onSelect={(id) => {
                    const found = practiceSets.find((item) => item.id === id);
                    if (found) onStartPractice(found);
                  }}
                />
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center px-8 text-center">
      <p className="text-[15px] font-medium tracking-tight text-foreground">{title}</p>
      <p className="mt-2 max-w-[260px] text-[13px] leading-5 text-muted">{body}</p>
    </div>
  );
}

function ArtifactBack({
  label,
  onBack,
  flush = false,
}: {
  label: string;
  onBack: () => void;
  flush?: boolean;
}) {
  return (
    <div className={`flex h-10 w-full shrink-0 items-center px-2 ${flush ? "" : "border-b border-border"}`}>
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center text-muted">
          <UiIcon name="back" size={16} />
        </span>
        <span className="min-w-0 truncate text-[12px]">{label}</span>
      </button>
    </div>
  );
}

function MaterialsView({
  items,
  selectedId,
  canView,
  onSelect,
  selected,
  onCloseSelected,
}: {
  items: Material[];
  selectedId: string | null;
  canView: boolean;
  onSelect: (id: string | null) => void;
  selected: Material | null;
  onCloseSelected: () => void;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No materials yet"
        body="Attach a file, paste, or link from chat. It will show up here."
      />
    );
  }

  if (selected) {
    if (!canView) {
      return (
        <div className="flex h-full min-h-0 flex-col">
          <ArtifactBack label={selected.title} onBack={() => onSelect(null)} />
          <EmptyState title="Sign in." body="Sign in to preview files." />
        </div>
      );
    }
    return <MaterialText key={selected.id} material={selected} onBack={() => onSelect(null)} />;
  }

  return <MaterialGrid items={items} selectedId={selectedId} onSelect={onSelect} />;
}

function MaterialGrid({ items, onSelect }: {
  items: Material[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <ul className="space-y-0.5 px-2 py-2">
      {items.map((item) => (
        <li key={item.id} className="list-none">
          <button
            type="button"
            onClick={() => onSelect(item.id)}
            className="flex w-full items-center px-2 py-2 text-left"
          >
            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{item.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function notesReady(saved: StudySheet, live: NotesLiveState): boolean {
  const content = live.content?.trim() ?? "";
  if (content) return (saved.prose || saved.content).trim() === content;
  return JSON.stringify(saved.blocks) === JSON.stringify(live.blocks);
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function SheetsView({
  items,
  selected,
  liveNote,
  error,
  onSelect,
  onBack,
}: {
  items: StudySheet[];
  selected: StudySheet | null;
  liveNote?: NotesLiveState | null;
  error: string | null;
  onSelect: (id: string) => void;
  onBack: () => void;
}) {
  const showLive =
    Boolean(liveNote) &&
    (Boolean(liveNote?.status) ||
      !selected ||
      !liveNote?.sheetId ||
      selected.id !== liveNote.sheetId ||
      !notesReady(selected, liveNote));

  if (showLive && liveNote) {
    return (
      <LiveNoteView
        title={liveNote.title || "Notes"}
        blocks={liveNote.blocks}
        content={liveNote.content}
        status={liveNote.status}
        onBack={onBack}
      />
    );
  }

  if (error && items.length === 0) {
    return <EmptyState title="Could not save notes" body={error} />;
  }

  if (items.length === 0) {
    return (
      <EmptyState title="No notes yet" body="Ask for notes in chat and they will open here." />
    );
  }

  if (selected) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ArtifactBack label={selected.title} onBack={onBack} />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <NoteDocument note={selected} />
        </div>
      </div>
    );
  }

  return (
    <ul className="space-y-1 px-3 py-3">
      {error ? <li className="list-none pb-2 text-xs text-red-400">{error}</li> : null}
      {items.map((item) => (
        <li key={item.id} className="list-none">
          <button type="button" onClick={() => onSelect(item.id)} className="panel-selectable flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left">
            <span className="inline-flex shrink-0 text-[var(--file-notes)]"><UiIcon name={item.kind === "note" ? "checkmarkSquare02" : "notes"} size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] text-foreground">{item.title}</span>
              <span className="block truncate text-[12px] text-muted">{formatDateTime(item.createdAt) || "Notes"}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function LiveNoteView({
  title,
  blocks,
  content,
  status,
  onBack,
}: {
  title: string;
  blocks: VisualBlock[];
  content?: string;
  status: string | null;
  onBack: () => void;
}) {
  const busy = Boolean(status);
  const prose = content?.trim() ?? "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative h-10 shrink-0 border-b border-border">
        <div
          className={`absolute inset-0 flex items-center px-4 transition-opacity duration-300 ${
            busy ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <StatusWait label={status || "Creating notes…"} className="text-[12px]" />
        </div>
        <div
          className={`absolute inset-0 flex items-center transition-opacity duration-300 ${
            busy ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          <ArtifactBack label={title} onBack={onBack} flush />
        </div>
      </div>
      {busy ? (
        <div className="min-h-0 flex-1" />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <NoteTitle text={title} />
          {blocks.length > 0 ? <VisualList blocks={blocks} /> : prose ? <RichContent text={prose} /> : null}
        </div>
      )}
    </div>
  );
}

function PracticeView({
  items,
  progress,
  onSelect,
}: {
  items: ChatArtifact[];
  progress: Record<string, number>;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
    <EmptyState title="No quizzes yet" body="Create a quiz from Studio or ask in chat. It will appear here." />
    );
  }

  return (
    <div className="space-y-1 px-3 py-3">
      {items.map((item) => {
        const count = item.count ?? item.ids?.length ?? 0;
        const saved = progress[item.id] ?? 0;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className="artifact-panel-block block w-full rounded-xl px-3 py-2.5 text-left hover:bg-surface-2"
          >
            <p className="truncate text-[13px] text-foreground">Quiz · {count} items</p>
            <p className="mt-0.5 text-[11px] text-muted">{saved > 0 ? `Saved at ${saved + 1}` : "Ready to start"}</p>
          </button>
        );
      })}
    </div>
  );
}
