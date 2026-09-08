"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { GuestGoogleCta } from "@/components/guest-google-cta";
import { ChatComposer, type ChatComposerHandle, type ComposerChip } from "@/components/workspace/chat-composer";
import { IconDumbbell, IconFile, IconPlus, IconSheet, IconSpark, IconX } from "@/components/workspace/icons";
import { newChipId } from "@/lib/composer/attach";
import { ensureSessionUser } from "@/lib/auth";
import { guestCapReached, GuestCapError, isGuestUser } from "@/lib/guest";
import { startProjectFromPrompt } from "@/lib/workspace/start-project";
import type { ComposerIntent } from "@/lib/composer/intent";
import type { PendingAttachment } from "@/lib/workspace/pending-start";

type StartMode = "practice" | "sheet" | "materials" | "explain";

const MODES: {
  id: StartMode;
  label: string;
  hint: string;
  placeholder: string;
  intent: ComposerIntent;
  icon: ReactNode;
}[] = [
  { id: "practice", label: "პრაქტიკა", hint: "სავარჯიშოები და კითხვები", placeholder: "What should I practice?", intent: "practice", icon: <IconDumbbell className="h-4 w-4" /> },
  { id: "sheet", label: "კონსპექტი", hint: "მოკლე, მკაფიო ჩანაწერი", placeholder: "What should I take notes on?", intent: "study", icon: <IconSheet className="h-4 w-4" /> },
  { id: "materials", label: "მასალიდან სწავლა", hint: "ატვირთე ფაილი და ისწავლე", placeholder: "What should we learn from this?", intent: "ask", icon: <IconFile className="h-4 w-4" /> },
  { id: "explain", label: "ახსენი თემა", hint: "ნაბიჯ-ნაბიჯ ახსნა", placeholder: "What should I explain?", intent: "ask", icon: <IconSpark className="h-4 w-4" /> },
];

const CARDS: Record<StartMode, { title: string; upload?: boolean }[]> = {
  practice: [
    { title: "კვადრატული განტოლებები" },
    { title: "ინგლისური ზმნები" },
    { title: "საქართველოს ისტორია" },
    { title: "წარმოებულები" },
  ],
  sheet: [
    { title: "ბიოლოგიის თავი" },
    { title: "ლექციის კონსპექტი" },
    { title: "გამოცდის ჩანაწერები" },
    { title: "თემის შემაჯამება" },
  ],
  materials: [
    { title: "ატვირთე ფაილი", upload: true },
    { title: "PDF-იდან სწავლა" },
    { title: "სლაიდებიდან კითხვები" },
    { title: "ჩანაწერებიდან კონსპექტი" },
  ],
  explain: [
    { title: "ფოტოსინთეზი" },
    { title: "წილადები" },
    { title: "პითაგორას თეორემა" },
    { title: "მეორე მსოფლიო ომი" },
  ],
};

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
  const [needGoogle, setNeedGoogle] = useState(false);
  const guest = publicHome || isGuestUser(user);

  useEffect(() => {
    if (!guest) {
      setNeedGoogle(false);
      return;
    }
    if (guestCapReached()) setNeedGoogle(true);
  }, [guest]);

  const activeMode = mode ? MODES.find((item) => item.id === mode) : null;

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
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function fillTopic(title: string) {
    setDraft(title);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  async function start() {
    if (sending) return;
    const prompt = draft.trim();
    if (!prompt && attachments.length === 0) return;
    if (guest && (mode === "practice" || mode === "sheet" || mode === "materials")) return;
    if (guest && guestCapReached()) {
      setNeedGoogle(true);
      return;
    }

    setSending(true);
    setIngestPhase(attachments.length > 0 ? "uploading" : null);
    setError(null);
    try {
      const signedIn = await ensureSessionUser();
      if (isGuestUser(signedIn) && guestCapReached()) {
        setNeedGoogle(true);
        setSending(false);
        setIngestPhase(null);
        return;
      }
      const id = await startProjectFromPrompt({
        userId: signedIn.uid,
        prompt,
        attachments: guest ? [] : attachments,
        intent: guest ? undefined : activeMode?.intent,
        onPhase: (phase) => setIngestPhase(phase === "uploading" ? "uploading" : null),
      });
      if (!id) throw new Error("Could not start.");
      setDraft("");
      setMode(null);
      router.push(`/project/${id}`);
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
    <span
      key={activeMode.id}
      className="composer-chip-in inline-flex h-8 max-w-[240px] shrink-0 items-center gap-1.5 rounded-full bg-accent/15 py-0.5 pl-2.5 pr-1 text-[13px] text-foreground"
    >
      <span className="text-muted">{activeMode.icon}</span>
      <span className="truncate">{activeMode.label}</span>
      <button
        type="button"
        onClick={clearMode}
        className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-foreground/10 hover:text-foreground"
        aria-label="Dismiss"
      >
        <IconX className="h-3 w-3" />
      </button>
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
        pad={false}
        allowAttach={!guest}
        showParameters
        onBackspaceEmpty={!guest && mode ? clearMode : undefined}
        onEscape={!guest && mode ? clearMode : undefined}
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

  if (publicHome || guest) {
    return (
      <div className="relative flex h-full min-h-0 flex-col items-center justify-center px-6 pb-16">
        <h1 className="mb-8 text-center text-[32px] font-medium tracking-tight text-foreground">What should we learn?</h1>
        <div className="w-full max-w-[850px] mx-auto composer-pad">{composer}</div>
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

      <div className="flex min-h-0 flex-1 flex-col md:items-center md:justify-center">
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 md:flex-none md:pb-8">
          <h1 className="text-center text-[32px] font-medium tracking-tight text-foreground">What should we learn?</h1>
        </div>

        <div className="mx-auto w-[min(850px,calc(100%-32px))] composer-pad max-md:mt-auto md:pb-8">
          {composer}

          {!mode ? (
            <div className="start-panel-in px-5 pb-4 pt-5">
              <div className="flex flex-col gap-1.5">
                {MODES.map((item, index) => (
                  <button
                    key={item.id}
                    ref={index === 0 ? firstActionRef : undefined}
                    type="button"
                    onClick={() => pickMode(item.id)}
                    onKeyDown={(event) => onListKey(event, index, MODES.length)}
                    className="flex w-full items-center gap-3.5 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.06] text-muted">
                      {item.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] text-foreground">{item.label}</span>
                      <span className="mt-0.5 block text-[13px] text-muted">{item.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="start-panel-in px-5 pb-5 pt-5">
              <p className="mb-3.5 text-[15px] font-medium text-foreground">სასწავლო იდეები</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {CARDS[mode].map((card, index) => (
                  <button
                    key={card.title}
                    ref={index === 0 ? firstActionRef : undefined}
                    type="button"
                    onClick={() => {
                      if (card.upload) {
                        composerRef.current?.openFile();
                        return;
                      }
                      fillTopic(card.title);
                    }}
                    onKeyDown={(event) => onListKey(event, index, CARDS[mode].length)}
                    className={
                      card.upload
                        ? "group flex aspect-[1.08] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-transparent p-4 text-center text-muted transition-colors hover:border-foreground/25 hover:bg-surface-2/60 hover:text-foreground"
                        : "group relative flex aspect-[1.08] flex-col items-start justify-between overflow-hidden rounded-2xl bg-surface-2 p-4 text-left text-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-foreground/[0.08]"
                    }
                  >
                    {card.upload ? (
                      <>
                        <IconPlus className="h-7 w-7" />
                        <span className="mt-3 text-[13px] leading-5">{card.title}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-muted transition-colors group-hover:text-foreground">{activeMode?.icon}</span>
                        <span className="text-[13px] font-medium leading-5">{card.title}</span>
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
