"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { useShell } from "@/components/workspace/shell-context";
import { GuestGoogleCta } from "@/components/guest-google-cta";
import { ChatComposer, type ChatComposerHandle, type ComposerChip } from "@/components/workspace/chat-composer";
import { HeadlineVerb } from "@/components/workspace/headline-verb";
import { UiIcon, type UiIconName } from "@/components/workspace/ui-icon";
import { newChipId } from "@/lib/composer/attach";
import { ensureSessionUser } from "@/lib/auth";
import { guestCapReached, GuestCapError, isGuestUser } from "@/lib/guest";
import { startChatInProject, startProjectFromPrompt } from "@/lib/workspace/start-project";
import { promptIsKa, type ComposerIntent } from "@/lib/composer/intent";
import { uploadStatusText } from "@/components/workspace/composer-status";
import {
  COMPOSER_SKILL_META,
  consumeSlashCommand,
  type ComposerSkill,
} from "@/lib/composer/slash";
import { loadSavedChatMode, saveChatMode } from "@/lib/workspace/chat-mode";
import type { ChatMode } from "@/types/chat";
import type { PendingAttachment } from "@/lib/workspace/pending-start";
import { chatPath } from "@/lib/workspace/routes";
import { subscribeProjectsForUser } from "@/lib/projects";
import type { Project } from "@/types/project";
import { CreateProjectModal } from "@/components/create-project-modal";

type StartMode = "practice" | "sheet" | "materials" | "explain";

const MODES: {
  id: StartMode;
  label: string;
  placeholder: string;
  intent: ComposerIntent;
  icon: UiIconName;
}[] = [
  { id: "practice", label: "Quiz", placeholder: "What should the quiz cover?", intent: "practice", icon: "check" },
  { id: "sheet", label: "Study notes", placeholder: "What should I take notes on?", intent: "study", icon: "notes" },
  { id: "materials", label: "Learn from a file", placeholder: "What should we learn from this?", intent: "ask", icon: "file" },
  { id: "explain", label: "Explain a topic", placeholder: "What should I explain?", intent: "ask", icon: "spark" },
];

const SUGGESTIONS: Record<StartMode, string[]> = {
  practice: ["Quadratic equations", "English verb tenses", "History of Georgia", "Derivatives"],
  sheet: ["A biology chapter", "Lecture notes", "Exam notes", "A topic summary"],
  materials: ["Learn from a PDF", "Questions from slides", "Notes from a recording", "Study this chapter"],
  explain: ["Photosynthesis", "Fractions", "The Pythagorean theorem", "World War II"],
};

type RowItem = {
  id: string;
  icon: UiIconName;
  label: string;
  action: "mode" | "prompt";
  mode?: StartMode;
};

function defaultRows(): RowItem[] {
  return MODES.map((item) => ({
    id: item.id,
    icon: item.icon,
    label: item.label,
    action: "mode" as const,
    mode: item.id,
  }));
}

function suggestionRows(mode: StartMode): RowItem[] {
  const icon = MODES.find((item) => item.id === mode)?.icon ?? "spark";
  return SUGGESTIONS[mode].map((label) => ({
    id: `${mode}-${label}`,
    icon,
    label,
    action: "prompt" as const,
  }));
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(media.matches);
    const onChange = () => setReduced(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function StartScreen({ publicHome = false }: { publicHome?: boolean }) {
  const router = useRouter();
  const { user } = useAuth();
  const { selectedProjectId, setSelectedProjectId } = useShell();
  const composerRef = useRef<ChatComposerHandle>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [ingestPhase, setIngestPhase] = useState<"uploading" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<StartMode | null>(null);
  const [skill, setSkill] = useState<ComposerSkill | null>(null);
  const [chatMode, setChatMode] = useState<ChatMode>("auto");
  const [needGoogle, setNeedGoogle] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const projectPickerRef = useRef<HTMLSpanElement>(null);
  const guest = publicHome || isGuestUser(user);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    setChatMode(loadSavedChatMode());
  }, []);

  useEffect(() => {
    if (!user?.uid || guest) {
      setProjects([]);
      return;
    }
    return subscribeProjectsForUser(
      user.uid,
      (next) => setProjects(next.filter((project) => project.listed !== false && !project.hidden)),
      () => setProjects([]),
    );
  }, [guest, user?.uid]);

  useEffect(() => {
    if (!projectPickerOpen) return;
    function closeOutside(event: PointerEvent) {
      if (!projectPickerRef.current?.contains(event.target as Node)) setProjectPickerOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [projectPickerOpen]);

  useEffect(() => {
    router.prefetch("/c/_");
  }, [router]);

  useEffect(() => {
    if (!guest) {
      setNeedGoogle(false);
      return;
    }
    if (guestCapReached()) setNeedGoogle(true);
  }, [guest]);

  const activeMode = mode ? MODES.find((item) => item.id === mode) : null;
  const rows = mode ? suggestionRows(mode) : defaultRows();
  const rowKey = mode ?? "default";
  const shownRef = useRef(rowKey);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const [shownRows, setShownRows] = useState(rows);
  const [rowPhase, setRowPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    if (rowKey === shownRef.current) return;
    if (reducedMotion) {
      shownRef.current = rowKey;
      setShownRows(rowsRef.current);
      setRowPhase("in");
      return;
    }
    setRowPhase("out");
    const timer = window.setTimeout(() => {
      shownRef.current = rowKey;
      setShownRows(rowsRef.current);
      setRowPhase("in");
    }, 90);
    return () => window.clearTimeout(timer);
  }, [rowKey, reducedMotion]);

  const chips: ComposerChip[] = attachments.map((item) => {
    const status = ingestPhase ?? "ready";
    if (item.kind === "file") {
      return {
        id: item.id,
        title: item.file.name,
        type: item.file.name.split(".").pop() || "file",
        size: item.file.size,
        status,
        previewUrl: previews[item.id],
      };
    }
    if (item.kind === "paste") {
      return { id: item.id, title: item.title || "Pasted notes", type: "txt", size: item.text.length, status };
    }
    return { id: item.id, title: item.url, type: "url", status };
  });

  function addFile(file: File) {
    if (guest) return;
    const id = newChipId();
    if (file.type.startsWith("image/")) {
      setPreviews((current) => ({ ...current, [id]: URL.createObjectURL(file) }));
    }
    setAttachments((current) => [...current, { id, kind: "file", file }]);
  }

  function pickMode(next: StartMode) {
    setMode(next);
    setSkill(next === "practice" ? "practice" : next === "sheet" ? "notes" : null);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function fillTopic(title: string) {
    setDraft(title);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  async function start() {
    if (sending) return;
    const prompt = draft.trim();
    const packed = guest ? [] : attachments;
    if (!prompt && packed.length === 0) return;
    if (guest && (mode === "practice" || mode === "sheet" || mode === "materials")) return;
    if (guest && guestCapReached()) {
      setNeedGoogle(true);
      return;
    }

    setSending(true);
    setIngestPhase(packed.length > 0 ? "uploading" : null);
    setError(null);
    let navigated = false;
    try {
      const signedIn = user ?? (await ensureSessionUser());
      if (isGuestUser(signedIn) && guestCapReached()) {
        setNeedGoogle(true);
        return;
      }
      const slash = consumeSlashCommand(prompt);
      if (slash.mode) {
        setChatMode(slash.mode);
        saveChatMode(slash.mode);
      }
      const nextSkill = slash.skill ?? skill;
      const nextMode = slash.mode ?? chatMode;
      const nextPrompt = slash.skill || slash.mode ? slash.prompt.trim() : prompt;
      const id = !guest && selectedProjectId
        ? await startChatInProject({
            projectId: selectedProjectId,
            userId: signedIn.uid,
            prompt: nextPrompt || prompt,
            attachments: packed,
            intent: guest ? undefined : nextSkill ? COMPOSER_SKILL_META[nextSkill].intent : activeMode?.intent,
            skill: guest ? undefined : nextSkill ?? undefined,
            mode: nextMode,
          })
        : await startProjectFromPrompt({
            userId: signedIn.uid,
            prompt: nextPrompt || prompt,
            attachments: packed,
            intent: guest ? undefined : nextSkill ? COMPOSER_SKILL_META[nextSkill].intent : activeMode?.intent,
            skill: guest ? undefined : nextSkill ?? undefined,
            mode: nextMode,
          });
      if (!id) throw new Error("Could not start.");
      navigated = true;
      router.replace(chatPath(id));
    } catch (err) {
      if (err instanceof GuestCapError) {
        setNeedGoogle(true);
        return;
      }
      setError(err instanceof Error && err.message.trim() ? err.message : "Could not start.");
    } finally {
      setIngestPhase(null);
      if (!navigated) setSending(false);
    }
  }

  function clearMode() {
    setMode(null);
    setSkill(null);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function onChatMode(next: ChatMode) {
    setChatMode(next);
    saveChatMode(next);
  }

  function onSkill(next: ComposerSkill | null) {
    setSkill(next);
    setMode(next === "practice" ? "practice" : next === "notes" ? "sheet" : null);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function onListKey(event: KeyboardEvent<HTMLButtonElement>, index: number, count: number) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = event.currentTarget.parentElement?.querySelectorAll("button")[Math.min(index + 1, count - 1)];
      (next as HTMLButtonElement | undefined)?.focus();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index === 0) {
        composerRef.current?.focus();
        return;
      }
      const prev = event.currentTarget.parentElement?.querySelectorAll("button")[index - 1];
      (prev as HTMLButtonElement | undefined)?.focus();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (mode) clearMode();
      else composerRef.current?.focus();
    }
  }

  const prefixMeta = activeMode
    ? { icon: activeMode.icon, label: activeMode.label }
    : skill
      ? { icon: COMPOSER_SKILL_META[skill].icon, label: COMPOSER_SKILL_META[skill].label }
      : null;
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const selectedProjectTitle = selectedProject?.title ?? "project";
  const matchingProjects = projects.filter((project) =>
    project.title.toLocaleLowerCase().includes(projectSearch.trim().toLocaleLowerCase()),
  );
  const fieldStart =
    !guest && prefixMeta ? (
      <span className="start-action-prefix pointer-events-none inline-flex shrink-0 select-none items-center gap-1.5 whitespace-nowrap pt-3 text-[15px] leading-6 text-foreground">
        <UiIcon name={prefixMeta.icon} size={18} className="accent-symbol" />
        <span>{prefixMeta.label}</span>
      </span>
    ) : null;

  const composer = (
    <>
      <ChatComposer
        ref={composerRef}
        draft={draft}
        onDraft={setDraft}
        sending={sending}
        error={needGoogle ? null : error}
        status={
          needGoogle || error || ingestPhase !== "uploading" || chips.length === 0
            ? null
            : {
                text: uploadStatusText(chips[0].title, chips[0].type === "url" ? "url" : "file", promptIsKa(draft)),
              }
        }
        chips={guest ? [] : chips}
        placeholder={guest ? "Ask anything" : (activeMode?.placeholder ?? "Ask anything")}
        fadePlaceholder={!guest}
        fieldStart={fieldStart}
        dropActive={dragging}
        pad={false}
        allowAttach={!guest}
        showParameters
        chatMode={chatMode}
        onChatMode={onChatMode}
        skill={guest ? null : skill}
        onSkill={guest ? undefined : onSkill}
        slashSkills={!guest}
        onBackspaceEmpty={!guest && (mode || skill) ? clearMode : undefined}
        onEscape={!guest && (mode || skill) ? clearMode : undefined}
        onArrowDown={guest ? undefined : () => firstActionRef.current?.focus()}
        onRemoveChip={(id) => {
          setAttachments((current) => current.filter((item) => item.id !== id));
          const url = previews[id];
          if (url) URL.revokeObjectURL(url);
          setPreviews((current) => {
            const next = { ...current };
            delete next[id];
            return next;
          });
        }}
        onSend={() => void start()}
        onFile={addFile}
        onPasteText={(text) =>
          setAttachments((current) => [
            ...current,
            { id: newChipId(), kind: "paste", text, title: "Pasted notes" },
          ])
        }
        onUrl={(url) => setAttachments((current) => [...current, { id: newChipId(), kind: "url", url }])}
      />
      {needGoogle ? <div className="px-4"><GuestGoogleCta /></div> : null}
    </>
  );

  const heading = (
    <h1 className="flex flex-wrap items-center justify-center gap-x-2 text-center text-[32px] font-medium leading-[1.2] tracking-tight text-foreground max-md:text-[26px]">
      {selectedProjectId && !guest ? (
        <>
          <span>What should we <HeadlineVerb /> in</span>
          <span ref={projectPickerRef} className="relative inline-flex max-w-full">
            <button
              type="button"
              aria-label={`Project: ${selectedProjectTitle}`}
              aria-haspopup="listbox"
              aria-expanded={projectPickerOpen}
              onClick={() => {
                setProjectSearch("");
                setProjectPickerOpen((open) => !open);
              }}
              className="max-w-[min(40vw,360px)] truncate border-b border-dotted border-foreground/40 text-left hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {selectedProjectTitle}
            </button>
            {projectPickerOpen ? (
              <div className="absolute left-1/2 top-full z-30 mt-3 w-[260px] -translate-x-1/2 rounded-xl border border-border bg-surface p-1.5 text-left text-[13px] text-foreground shadow-xl">
                <label className="flex h-8 items-center gap-2 border-b border-border px-2 text-muted">
                  <UiIcon name="search" size={14} />
                  <input
                    autoFocus
                    aria-label="Search projects"
                    placeholder="Search projects"
                    value={projectSearch}
                    onChange={(event) => setProjectSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setProjectPickerOpen(false);
                    }}
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted"
                  />
                </label>
                <div role="listbox" aria-label="Projects" className="my-1 max-h-52 overflow-y-auto">
                  {matchingProjects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      role="option"
                      aria-selected={project.id === selectedProjectId}
                      onClick={() => {
                        setSelectedProjectId(project.id);
                        setProjectPickerOpen(false);
                      }}
                      className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-foreground/10 ${project.id === selectedProjectId ? "bg-foreground/10" : ""}`}
                    >
                      <UiIcon name="projectFolder" size={15} className="shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate">{project.title}</span>
                      {project.id === selectedProjectId ? <UiIcon name="check" size={14} /> : null}
                    </button>
                  ))}
                  {matchingProjects.length === 0 ? <p className="px-2 py-2 text-muted">No projects found</p> : null}
                </div>
                <div className="border-t border-border pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setProjectPickerOpen(false);
                      setCreateProjectOpen(true);
                    }}
                    className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-foreground/10"
                  >
                    <UiIcon name="plus" size={14} className="text-muted" />
                    New project
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProjectId(null);
                      setProjectPickerOpen(false);
                    }}
                    className="flex h-8 w-full items-center rounded-lg px-2 text-left hover:bg-foreground/10"
                  >
                    Don&apos;t work in a project
                  </button>
                </div>
              </div>
            ) : null}
          </span>
          <span>?</span>
        </>
      ) : (
        <>
          <span className="sr-only">What should we learn?</span>
          <span aria-hidden="true" className="whitespace-nowrap">
            What should we <HeadlineVerb />?
          </span>
        </>
      )}
    </h1>
  );

  if (publicHome || guest) {
    return (
      <div className="relative flex h-full min-h-0 flex-col items-center justify-center pb-20">
        <div className="mb-10">{heading}</div>
        <div className="mx-auto w-full max-w-3xl px-8 max-md:px-4 composer-pad">{composer}</div>
      </div>
    );
  }

  if (selectedProjectId) {
    return (
      <>
        <div className="relative flex h-full min-h-0 flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center">{heading}</div>
          <div className="mx-auto w-full max-w-3xl px-8 max-md:px-4 composer-pad">{composer}</div>
        </div>
        {createProjectOpen && user?.uid ? (
          <CreateProjectModal
            userId={user.uid}
            onClose={() => setCreateProjectOpen(false)}
            onCreated={(projectId) => {
              setSelectedProjectId(projectId);
              setCreateProjectOpen(false);
            }}
          />
        ) : null}
      </>
    );
  }

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
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
        if (file) addFile(file);
      }}
    >
      <div className="flex min-h-0 flex-1 items-center justify-center px-8 md:hidden">{heading}</div>

      <div className="start-stage-pin mx-auto w-full max-w-3xl px-8 max-md:px-4 composer-pad max-md:mt-auto">
        <div className="start-stage-title hidden md:block">{heading}</div>
        {composer}
        <div className="start-suggest-list mt-8" aria-live="polite">
          {shownRows.map((item, index) => (
            <button
              key={item.id}
              ref={index === 0 ? firstActionRef : undefined}
              type="button"
              onClick={() => {
                if (item.action === "mode" && item.mode) pickMode(item.mode);
                else fillTopic(item.label);
              }}
              onKeyDown={(event) => onListKey(event, index, shownRows.length)}
              className={`start-suggest-row ${rowPhase === "out" ? "start-suggest-out" : "start-suggest-in"}`}
              style={rowPhase === "in" && !reducedMotion ? { animationDelay: `${index * 20}ms` } : undefined}
            >
              <span className="start-suggest-icon">
                <UiIcon name={item.icon} size={20} />
              </span>
              <span className="start-suggest-label">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
