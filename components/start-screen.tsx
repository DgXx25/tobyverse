"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { GuestGoogleCta } from "@/components/guest-google-cta";
import { ChatComposer, type ChatComposerHandle, type ComposerChip } from "@/components/workspace/chat-composer";
import { UiIcon, type UiIconName } from "@/components/workspace/ui-icon";
import { newChipId } from "@/lib/composer/attach";
import { ensureSessionUser } from "@/lib/auth";
import { guestCapReached, GuestCapError, isGuestUser } from "@/lib/guest";
import { startProjectFromPrompt } from "@/lib/workspace/start-project";
import { urlsInText } from "@/lib/materials/ingest-client";
import { type ComposerIntent } from "@/lib/composer/intent";
import {
  COMPOSER_SKILL_META,
  consumeSlashCommand,
  type ComposerSkill,
} from "@/lib/composer/slash";
import { loadSavedChatMode, saveChatMode } from "@/lib/workspace/chat-mode";
import type { ChatMode } from "@/types/chat";
import type { PendingAttachment } from "@/lib/workspace/pending-start";

type StartMode = "practice" | "sheet" | "materials" | "explain";

const MODES: {
  id: StartMode;
  label: string;
  placeholder: string;
  intent: ComposerIntent;
  icon: UiIconName;
}[] = [
  { id: "practice", label: "Practice", placeholder: "What should I practice?", intent: "practice", icon: "practice" },
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
  const guest = publicHome || isGuestUser(user);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    setChatMode(loadSavedChatMode());
  }, []);

  useEffect(() => {
    router.prefetch("/project/_");
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
    const promptUrls = urlsInText(prompt);
    const packed = guest
      ? []
      : [
          ...attachments,
          ...promptUrls
            .filter((url) => !attachments.some((item) => item.kind === "url" && item.url === url))
            .map((url) => ({ id: newChipId(), kind: "url" as const, url })),
        ];
    if (!prompt && packed.length === 0) return;
    if (guest && (mode === "practice" || mode === "sheet" || mode === "materials")) return;
    if (guest && guestCapReached()) {
      setNeedGoogle(true);
      return;
    }

    setSending(true);
    setIngestPhase(packed.length > 0 ? "uploading" : null);
    setError(null);
    try {
      const signedIn = user ?? (await ensureSessionUser());
      if (isGuestUser(signedIn) && guestCapReached()) {
        setNeedGoogle(true);
        setSending(false);
        setIngestPhase(null);
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
      const id = await startProjectFromPrompt({
        userId: signedIn.uid,
        prompt: nextPrompt || prompt,
        attachments: packed,
        intent: guest ? undefined : nextSkill ? COMPOSER_SKILL_META[nextSkill].intent : activeMode?.intent,
        skill: guest ? undefined : nextSkill ?? undefined,
        mode: nextMode,
      });
      if (!id) throw new Error("Could not start.");
      router.replace(`/project/${id}`);
    } catch (err) {
      if (err instanceof GuestCapError) {
        setNeedGoogle(true);
        setSending(false);
        setIngestPhase(null);
        return;
      }
      setError(err instanceof Error && err.message.trim() ? err.message : "Could not start.");
      setSending(false);
      setIngestPhase(null);
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

  const fieldStart = !guest && activeMode ? (
    <span className="start-action-prefix pointer-events-none inline-flex shrink-0 select-none items-center gap-1.5 whitespace-nowrap pt-3 text-[15px] leading-6 text-foreground">
      <UiIcon name={activeMode.icon} size={18} className="accent-symbol" />
      <span>{activeMode.label}</span>
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
        chips={guest ? [] : chips}
        placeholder={guest ? "Ask anything" : (activeMode?.placeholder ?? "Ask anything")}
        fieldStart={fieldStart}
        fadePlaceholder={!guest}
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
    <h1 className="text-center text-[32px] font-medium tracking-tight text-foreground">What should we learn?</h1>
  );

  if (publicHome || guest) {
    return (
      <div className="relative flex h-full min-h-0 flex-col items-center justify-center px-6 pb-16">
        <div className="mb-8">{heading}</div>
        <div className="mx-auto w-full max-w-[850px] composer-pad">{composer}</div>
      </div>
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
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/80">
          <p className="rounded-xl border border-dashed border-white/20 px-6 py-4 text-sm text-foreground">
            Drop a file or image
          </p>
        </div>
      )}

      <div className="flex min-h-0 flex-1 items-center justify-center px-6 md:hidden">{heading}</div>

      <div className="start-stage-pin mx-auto w-[min(850px,calc(100%-32px))] composer-pad max-md:mt-auto">
        <div className="start-stage-title hidden md:block">{heading}</div>
        {composer}
        <div className="start-suggest-list mt-6" aria-live="polite">
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
