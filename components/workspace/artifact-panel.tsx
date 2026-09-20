"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { subscribeChatMessages } from "@/lib/chats";
import { subscribeMaterials } from "@/lib/materials";
import { subscribeStudySheets } from "@/lib/study-sheets/store";
import { subscribeStudyPaths } from "@/lib/paths/store";
import { liveStudyPath } from "@/lib/paths/model";
import { PathView } from "@/components/workspace/path-view";
import { StatusWait } from "@/components/workspace/status-wait";
import { formatBytes, shortDate } from "@/lib/format";
import { loadPracticeProgress } from "@/lib/workspace/practice-progress";
import type { SetResult } from "@/lib/exercises/session";
import { PracticeSession } from "@/components/exercises/practice-session";
import { NoteDocument, NoteTitle } from "@/components/visuals/note-document";
import { VisualList } from "@/components/visuals/visual-block";
import { QuietIconCluster } from "@/components/workspace/quiet-icon-cluster";
import { MaterialViewer } from "@/components/workspace/material-viewer";
import { UiIcon } from "@/components/workspace/ui-icon";
import { useAuth } from "@/components/auth-provider";
import { isGuestUser } from "@/lib/guest";
import type { ChatArtifact, ChatMessage } from "@/types/chat";
import type { Material } from "@/types/material";
import type { PathLiveState, StudyPath } from "@/types/path";
import type { NotesLiveState, StudySheet } from "@/types/study-sheet";
import type { VisualBlock } from "@/types/visual";

type TabId = "materials" | "sheets" | "practice" | "path";

export type ArtifactFocus = ChatArtifact | { kind: "material"; id: string };

export function ArtifactPanel({
  projectId,
  userId,
  focus,
  session,
  onResizeStart,
  onClose,
  onStartPractice,
  onExitSession,
  onPracticeComplete,
  onViewChange,
  onActivate,
  liveNote = null,
  livePath = null,
  onLiveSettled,
  onLivePathSettled,
}: {
  projectId: string;
  userId: string;
  focus: ArtifactFocus | null;
  session: { setId: string; ids: string[]; mode?: "practice" | "exam" } | null;
  onResizeStart: (event: MouseEvent) => void;
  onClose: () => void;
  onStartPractice: (artifact: ChatArtifact) => void;
  onExitSession: () => void;
  onPracticeComplete?: (result: SetResult) => void;
  onViewChange?: (view: TabId) => void;
  onActivate?: (artifact: ChatArtifact) => void;
  liveNote?: NotesLiveState | null;
  livePath?: PathLiveState | null;
  onLiveSettled?: () => void;
  onLivePathSettled?: () => void;
}) {
  const { user } = useAuth();
  const canViewFiles = Boolean(user && !isGuestUser(user));
  const [materials, setMaterials] = useState<Material[]>([]);
  const [sheets, setSheets] = useState<StudySheet[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [paths, setPaths] = useState<StudyPath[]>([]);
  const [tab, setTab] = useState<TabId>("materials");
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [practiceId, setPracticeId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [sheetsReady, setSheetsReady] = useState(false);
  const [practiceReady, setPracticeReady] = useState(false);
  const [pathsReady, setPathsReady] = useState(false);

  useEffect(() => {
    setSheetsReady(false);
    setPracticeReady(false);
    setPathsReady(false);
    setTab("materials");
    setMaterialId(null);
    setSheetId(null);
    setPracticeId(null);
  }, [projectId]);

  useEffect(() => subscribeMaterials(projectId, setMaterials), [projectId]);
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
    for (const message of [...messages].reverse()) {
      const artifact = message.artifact;
      if (!artifact || artifact.kind !== "practice") continue;
      if (seen.has(artifact.id)) continue;
      seen.add(artifact.id);
      sets.push(artifact);
    }
    return sets;
  }, [messages]);

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
      if (tab === "path") return;
      setTab("sheets");
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
    }
  }, [focus, session, liveNote, livePath, tab]);

  useEffect(() => {
    if (session) return;
    if (liveNote) return;
    if (tab === "sheets" && sheetsReady && counts.sheets === 0) {
      setTab("materials");
      setSheetId(null);
    }
    if (tab === "practice" && practiceReady && counts.practice === 0) {
      setTab("materials");
      setPracticeId(null);
    }
  }, [counts.sheets, counts.practice, session, tab, sheetsReady, practiceReady, liveNote]);

  useEffect(() => {
    if (session) return;
    onViewChange?.(tab);
  }, [tab, session, onViewChange]);

  const selectedMaterial = materials.find((item) => item.id === materialId) ?? null;
  const selectedSheet = sheets.find((item) => item.id === sheetId) ?? null;
  const selectedSet = practiceSets.find((item) => item.id === practiceId) ?? null;
  const showSheets = counts.sheets > 0 || Boolean(liveNote) || (tab === "sheets" && !sheetsReady);
  const showPractice = counts.practice > 0 || (tab === "practice" && !practiceReady);
  const showPath = counts.path > 0 || tab === "path" || Boolean(livePath);
  const hideTopBar = tab === "sheets" && (Boolean(selectedSheet) || Boolean(liveNote));

  useEffect(() => {
    if (!liveNote || liveNote.status || !liveNote.sheetId || !onLiveSettled) return;
    const saved = sheets.find((item) => item.id === liveNote.sheetId) ?? selectedSheet;
    if (!saved || saved.id !== liveNote.sheetId) return;
    if (!notesMatch(saved.blocks, liveNote.blocks)) return;
    onLiveSettled();
  }, [liveNote, selectedSheet, sheets, onLiveSettled]);

  useEffect(() => {
    if (!livePath || livePath.status || !livePath.pathId || !onLivePathSettled) return;
    if (!selectedPath || selectedPath.id !== livePath.pathId) return;
    onLivePathSettled();
  }, [livePath, selectedPath, onLivePathSettled]);

  return (
    <aside className="relative z-[1] flex h-full w-full shrink-0 flex-col bg-transparent py-2 pl-1 pr-2 max-md:!w-full">
      <button
        type="button"
        aria-label="Resize panel"
        onMouseDown={onResizeStart}
        className="absolute inset-y-0 left-0 z-10 hidden w-2 cursor-col-resize md:block"
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-transparent">
        {session ? (
          <PracticeSession
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
            {hideTopBar ? null : (
            <header className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
              <nav className="flex min-w-0 flex-1 items-center">
                <QuietIconCluster
                  size={18}
                  actions={[
                    {
                      id: "materials",
                      label: "Materials",
                      icon: "materials",
                      active: tab === "materials",
                      disabled: counts.materials === 0,
                      onClick: () => {
                        setTab("materials");
                        setMaterialId(null);
                      },
                    },
                    ...(showPath
                      ? [
                          {
                            id: "path",
                            label: "Path",
                            icon: "plan" as const,
                            active: tab === "path",
                            onClick: () => setTab("path"),
                          },
                        ]
                      : []),
                    ...(showSheets
                      ? [
                          {
                            id: "sheets",
                            label: "Notes",
                            icon: "notes" as const,
                            active: tab === "sheets",
                            onClick: () => {
                              setTab("sheets");
                              setSheetId(null);
                            },
                          },
                        ]
                      : []),
                    ...(showPractice
                      ? [
                          {
                            id: "practice",
                            label: "Practice",
                            icon: "practice" as const,
                            active: tab === "practice",
                            onClick: () => {
                              setTab("practice");
                              setPracticeId(null);
                            },
                          },
                        ]
                      : []),
                  ]}
                />
              </nav>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-transparent text-muted hover:text-foreground"
                aria-label="Close panel"
              >
                <UiIcon name="close" size={18} />
              </button>
            </header>
            )}

            <div className={`min-h-0 flex-1 ${tab === "materials" && materialId ? "overflow-hidden" : tab === "path" ? "overflow-hidden" : "overflow-y-auto"}`}>
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
              {tab === "materials" && (
                <MaterialsView
                  items={materials}
                  selectedId={materialId}
                  canView={canViewFiles}
                  onSelect={setMaterialId}
                  selected={selectedMaterial}
                />
              )}
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
                    onLiveSettled?.();
                  }}
                />
              )}
              {tab === "practice" && (
                <PracticeView
                  items={practiceSets}
                  selected={selectedSet}
                  progress={progress}
                  onSelect={(id) => {
                    setPracticeId(id);
                    const found = practiceSets.find((item) => item.id === id);
                    if (found) onActivate?.(found);
                  }}
                  onBack={() => setPracticeId(null)}
                  onStart={(artifact) => onStartPractice(artifact)}
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
        className="flex min-w-0 max-w-full items-center gap-1.5 rounded-lg py-1 pl-1 pr-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
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
}: {
  items: Material[];
  selectedId: string | null;
  canView: boolean;
  onSelect: (id: string | null) => void;
  selected: Material | null;
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
    return <MaterialViewer material={selected} onClose={() => onSelect(null)} />;
  }

  return (
    <div className="space-y-1 px-3 py-3">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          className={`block w-full rounded-xl px-3 py-2.5 text-left hover:bg-surface-2 ${
            selectedId === item.id ? "bg-surface-2" : ""
          }`}
        >
          <p className="truncate text-[13px] text-foreground">{item.title}</p>
          <p className="mt-0.5 text-[11px] text-muted">
            {[item.type.toUpperCase(), formatBytes(item.sizeBytes), shortDate(item.createdAt)].filter(Boolean).join(" · ")}
          </p>
        </button>
      ))}
    </div>
  );
}

function notesMatch(a: VisualBlock[], b: VisualBlock[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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
      !notesMatch(selected.blocks, liveNote.blocks));

  if (showLive && liveNote) {
    return (
      <LiveNoteView
        title={liveNote.title || "Notes"}
        blocks={liveNote.blocks}
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
    <div className="space-y-1 px-3 py-3">
      {error ? <p className="px-3 pb-2 text-xs text-red-400">{error}</p> : null}
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          className="block w-full rounded-xl px-3 py-2.5 text-left hover:bg-surface-2"
        >
          <p className="truncate text-[13px] text-foreground">{item.title}</p>
          <p className="mt-0.5 text-[11px] text-muted">{shortDate(item.createdAt) || "Notes"}</p>
        </button>
      ))}
    </div>
  );
}

function LiveNoteView({
  title,
  blocks,
  status,
  onBack,
}: {
  title: string;
  blocks: VisualBlock[];
  status: string | null;
  onBack: () => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const busy = Boolean(status);

  useLayoutEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [blocks.length, status]);

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
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <NoteTitle text={title} />
        <VisualList blocks={blocks} appear />
      </div>
    </div>
  );
}

function PracticeView({
  items,
  selected,
  progress,
  onSelect,
  onBack,
  onStart,
}: {
  items: ChatArtifact[];
  selected: ChatArtifact | null;
  progress: Record<string, number>;
  onSelect: (id: string) => void;
  onBack: () => void;
  onStart: (artifact: ChatArtifact) => void;
}) {
  if (items.length === 0) {
    return (
      <EmptyState title="No practice sets yet" body="Ask to practice a topic in chat. Generated sets will land here." />
    );
  }

  if (selected) {
    const count = selected.count ?? selected.ids?.length ?? 0;
    const saved = progress[selected.id] ?? 0;
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ArtifactBack label={`${selected.mode === "exam" ? "Exam" : "Practice set"} · ${count}`} onBack={onBack} />
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 py-10 text-center">
          <p className="text-[15px] font-medium tracking-tight text-foreground">
            {selected.mode === "exam" ? "Exam" : "Practice set"} · {count} items
          </p>
          <p className="mt-2 max-w-[240px] text-[13px] leading-5 text-muted">
            {saved > 0
              ? `Resume from item ${saved + 1}.`
              : selected.mode === "exam"
                ? "One check each. About 50% counts as a pass."
                : "Work through mistakes until you finish."}
          </p>
          <button
            type="button"
            onClick={() => onStart(selected)}
            className="mt-5 rounded-full border border-border px-4 py-1.5 text-[13px] text-foreground hover:bg-surface-2"
          >
            {saved > 0 ? "Continue" : "Start"}
          </button>
        </div>
      </div>
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
            className="block w-full rounded-xl px-3 py-2.5 text-left hover:bg-surface-2"
          >
            <p className="truncate text-[13px] text-foreground">Practice set · {count} items</p>
            <p className="mt-0.5 text-[11px] text-muted">{saved > 0 ? `Saved at ${saved + 1}` : "Ready to start"}</p>
          </button>
        );
      })}
    </div>
  );
}
