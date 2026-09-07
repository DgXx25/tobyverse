"use client";

import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { subscribeChatMessages } from "@/lib/chats";
import { subscribeMaterials } from "@/lib/materials";
import { subscribeStudySheets } from "@/lib/study-sheets/store";
import { formatBytes, shortDate } from "@/lib/format";
import { loadPracticeProgress } from "@/lib/workspace/practice-progress";
import { PracticeSession } from "@/components/exercises/practice-session";
import { NoteDocument } from "@/components/visuals/note-document";
import {
  IconBack,
  IconFile,
  IconPractice,
  IconSheet,
  IconX,
} from "@/components/workspace/icons";
import type { ChatArtifact, ChatMessage } from "@/types/chat";
import type { Material } from "@/types/material";
import type { StudySheet } from "@/types/study-sheet";

type TabId = "materials" | "sheets" | "practice";

export type ArtifactFocus = ChatArtifact | { kind: "material"; id: string };

export function ArtifactPanel({
  projectId,
  userId,
  width,
  focus,
  session,
  onResizeStart,
  onClose,
  onStartPractice,
  onExitSession,
  onActivate,
}: {
  projectId: string;
  userId: string;
  width: number;
  focus: ArtifactFocus | null;
  session: { setId: string; ids: string[] } | null;
  onResizeStart: (event: MouseEvent) => void;
  onClose: () => void;
  onStartPractice: (artifact: ChatArtifact) => void;
  onExitSession: () => void;
  onActivate?: (artifact: ChatArtifact) => void;
}) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [sheets, setSheets] = useState<StudySheet[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tab, setTab] = useState<TabId>("materials");
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [practiceId, setPracticeId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});

  useEffect(() => subscribeMaterials(projectId, setMaterials), [projectId]);
  useEffect(
    () =>
      subscribeStudySheets(
        projectId,
        setSheets,
        (err) => setSheetError(err.message),
      ),
    [projectId],
  );
  useEffect(() => subscribeChatMessages(projectId, setMessages), [projectId]);
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

  const counts = {
    materials: materials.length,
    sheets: sheets.length,
    practice: practiceSets.length,
  };

  useEffect(() => {
    if (session || !focus) return;
    if (focus.kind === "practice") {
      setTab("practice");
      setPracticeId(focus.id);
      return;
    }
    if (focus.kind === "sheet" || focus.kind === "plan") {
      setTab("sheets");
      setSheetError(null);
      setSheetId(focus.id);
      return;
    }
    if (focus.kind === "material") {
      setTab("materials");
      setMaterialId(focus.id);
    }
  }, [focus, session]);

  useEffect(() => {
    if (session || focus || counts[tab] > 0) return;
    if (counts.materials > 0) setTab("materials");
    else if (counts.sheets > 0) setTab("sheets");
    else if (counts.practice > 0) setTab("practice");
  }, [counts.materials, counts.sheets, counts.practice, session, tab, focus]);

  const selectedMaterial = materials.find((item) => item.id === materialId) ?? null;
  const selectedSheet = sheets.find((item) => item.id === sheetId) ?? null;
  const selectedSet = practiceSets.find((item) => item.id === practiceId) ?? null;

  return (
    <aside className="relative z-[1] flex h-full shrink-0 flex-col bg-transparent py-2 pl-1 pr-2 max-md:!w-full" style={{ width }}>
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
            onExit={onExitSession}
          />
        ) : (
          <>
            <header className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2.5">
              <nav className="flex min-w-0 flex-1 items-center gap-0.5">
                <TabButton
                  label="Materials"
                  icon={<IconFile />}
                  active={tab === "materials"}
                  enabled={counts.materials > 0}
                  onClick={() => {
                    setTab("materials");
                    setMaterialId(null);
                  }}
                />
                <TabButton
                  label="Notes"
                  icon={<IconSheet />}
                  active={tab === "sheets"}
                  enabled={counts.sheets > 0}
                  onClick={() => {
                    setTab("sheets");
                    setSheetId(null);
                  }}
                />
                <TabButton
                  label="Practice"
                  icon={<IconPractice />}
                  active={tab === "practice"}
                  enabled={counts.practice > 0}
                  onClick={() => {
                    setTab("practice");
                    setPracticeId(null);
                  }}
                />
              </nav>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg p-1.5 text-muted hover:text-foreground"
                aria-label="Close panel"
              >
                <IconX />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {tab === "materials" && (
                <MaterialsView
                  items={materials}
                  selectedId={materialId}
                  onSelect={setMaterialId}
                  selected={selectedMaterial}
                />
              )}
              {tab === "sheets" && (
                <SheetsView
                  items={sheets}
                  selected={selectedSheet}
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
                  onBack={() => setSheetId(null)}
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

function TabButton({
  label,
  icon,
  active,
  enabled,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  enabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onClick}
      title={label}
      className={`flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] tracking-tight ${
        !enabled
          ? "cursor-default text-muted opacity-35"
          : active
            ? "bg-surface-2 text-foreground"
            : "text-muted hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
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

function ArtifactBack({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="flex shrink-0 items-center border-b border-border px-2 py-1.5">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="flex min-w-0 max-w-full items-center gap-1.5 rounded-lg py-1 pl-1 pr-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-2">
          <IconBack />
        </span>
        <span className="min-w-0 truncate text-[12px]">{label}</span>
      </button>
    </div>
  );
}

function MaterialsView({
  items,
  selectedId,
  onSelect,
  selected,
}: {
  items: Material[];
  selectedId: string | null;
  onSelect: (id: string) => void;
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

  return (
    <div className="space-y-2 px-4 py-4">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-left ${
              selectedId === item.id
                ? "border-border bg-surface-2 text-foreground"
                : "border-border text-muted hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            <span className="font-mono text-[9px] uppercase tracking-wide">{item.type}</span>
            <span className="max-w-[180px] truncate text-[12px]">{item.title}</span>
          </button>
        ))}
      </div>
      {selected && (
        <div className="rounded-xl border border-border bg-background px-4 py-3">
          <p className="text-[13px] text-foreground">{selected.title}</p>
          <p className="mt-1 text-[11px] text-muted">
            {[formatBytes(selected.sizeBytes), shortDate(selected.createdAt)].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-[12px] leading-5 text-muted">
            {selected.extractedTextPreview || "No preview yet."}
          </p>
        </div>
      )}
    </div>
  );
}

function SheetsView({
  items,
  selected,
  error,
  onSelect,
  onBack,
}: {
  items: StudySheet[];
  selected: StudySheet | null;
  error: string | null;
  onSelect: (id: string) => void;
  onBack: () => void;
}) {
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
        <ArtifactBack label={`Practice set · ${count}`} onBack={onBack} />
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 py-10 text-center">
          <p className="text-[15px] font-medium tracking-tight text-foreground">Practice set · {count} items</p>
          <p className="mt-2 max-w-[240px] text-[13px] leading-5 text-muted">
            {saved > 0 ? `Resume from item ${saved + 1}.` : "Start when you want. Chat stays on the left."}
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
