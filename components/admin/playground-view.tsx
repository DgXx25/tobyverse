"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { RichContent } from "@/components/rich-content";
import { ChatBlockStateProvider, ChatBlockStateScope } from "@/components/workspace/chat-block-state";
import { CitationProvider } from "@/components/workspace/citations";
import { readChatSse } from "@/lib/ai/sse";
import {
  PLAYGROUND_PRESETS,
  PLAYGROUND_VERSIONS,
} from "@/lib/admin/playground";
import type { PlaygroundVersionId } from "@/types/admin";
import type { ChatImageHit, ChatSourceRef } from "@/types/chat";
import {
  AI_EFFORT_LEVELS,
  aiEffortDisplayName,
  availableAiModels,
  DEFAULT_AI_EFFORT,
  type AiEffort,
  type AiModelSelection,
} from "@/lib/ai/catalog";

type ColumnStatus = "idle" | "running" | "done" | "error";

type ColumnState = {
  prompt: string;
  started: boolean;
  output: string;
  images: ChatImageHit[];
  sources: ChatSourceRef[];
  activity: string;
  status: ColumnStatus;
  error: string | null;
};

function emptyColumns(presetId = PLAYGROUND_PRESETS[0]!.id): Record<PlaygroundVersionId, ColumnState> {
  const preset = PLAYGROUND_PRESETS.find((item) => item.id === presetId) ?? PLAYGROUND_PRESETS[0]!;
  return {
    1: makeColumn(1, preset.prompts[0]),
    2: makeColumn(2, preset.prompts[1]),
    3: makeColumn(3, preset.prompts[2]),
  };
}

function makeColumn(id: PlaygroundVersionId, prompt: string): ColumnState {
  return {
    prompt,
    started: false,
    output: "",
    images: [],
    sources: [],
    activity: "",
    status: "idle",
    error: null,
  };
}

async function authHeader(): Promise<HeadersInit> {
  const { getFirebaseAuth } = await import("@/lib/firebase");
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

export function PlaygroundView() {
  const { user } = useAuth();
  const [presetId, setPresetId] = useState(PLAYGROUND_PRESETS[0]!.id);
  const [columns, setColumns] = useState(() => emptyColumns());
  const [model, setModel] = useState<AiModelSelection>("auto");
  const [effort, setEffort] = useState<AiEffort>(DEFAULT_AI_EFFORT);
  const running = PLAYGROUND_VERSIONS.some((id) => columns[id].status === "running");
  const models = availableAiModels("admin");

  function patch(id: PlaygroundVersionId, partial: Partial<ColumnState>) {
    setColumns((current) => ({ ...current, [id]: { ...current[id], ...partial } }));
  }

  function selectPreset(nextId: string) {
    const preset = PLAYGROUND_PRESETS.find((item) => item.id === nextId);
    if (!preset || running) return;
    setPresetId(nextId);
    setColumns((current) => ({
      1: { ...current[1], prompt: preset.prompts[0], started: false, output: "", images: [], sources: [], status: "idle", error: null, activity: "" },
      2: { ...current[2], prompt: preset.prompts[1], started: false, output: "", images: [], sources: [], status: "idle", error: null, activity: "" },
      3: { ...current[3], prompt: preset.prompts[2], started: false, output: "", images: [], sources: [], status: "idle", error: null, activity: "" },
    }));
  }

  async function runAll() {
    if (running || PLAYGROUND_VERSIONS.some((id) => !columns[id].prompt.trim()) || !user) return;
    const snapshot = columns;
    const headers = await authHeader();

    await Promise.all(PLAYGROUND_VERSIONS.map(async (id) => {
      const column = snapshot[id];
      patch(id, { started: true, status: "running", output: "", images: [], sources: [], error: null, activity: "Thinking…" });
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers,
          body: JSON.stringify({
            prompt: column.prompt.trim(),
            mode: "auto",
            model,
            effort,
            history: [],
            context: {
              projectId: "",
              projectTitle: "",
              projectDescription: "",
              goal: "understand_topic",
              hasMaterials: false,
              materials: [],
            },
          }),
        });

        const result = await readChatSse(response, {
          onDelta: (delta) => setColumns((current) => ({
            ...current,
            [id]: { ...current[id], output: current[id].output + delta, activity: "" },
          })),
          onSources: (sources) => patch(id, { sources }),
          onImages: (images) => patch(id, { images }),
          onStatus: (activity) => patch(id, { activity }),
        });
        if (!result.text.trim() && !result.tool) throw new Error("Empty response.");
        patch(id, {
          status: "done",
          activity: "",
        });
      } catch (error) {
        patch(id, {
          status: "error",
          activity: "",
          error: error instanceof Error ? error.message : "Request failed.",
        });
      }
    }));
  }

  const promptsReady = PLAYGROUND_VERSIONS.every((id) => columns[id].prompt.trim());

  return (
    <ChatBlockStateProvider>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {PLAYGROUND_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => selectPreset(preset.id)}
                disabled={running}
                aria-pressed={presetId === preset.id}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${presetId === preset.id ? "border-foreground/30 bg-surface-2 text-foreground" : "border-border text-muted hover:text-foreground"}`}
              >
                {preset.label}
              </button>
            ))}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <select
                aria-label="Model"
                value={model}
                onChange={(event) => setModel(event.target.value as AiModelSelection)}
                disabled={running}
                className="h-9 rounded-md border border-border bg-surface px-2.5 text-xs text-foreground outline-none focus:border-white/30"
              >
                {models.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
              <select
                aria-label="Effort"
                value={effort}
                onChange={(event) => setEffort(event.target.value as AiEffort)}
                disabled={running}
                className="h-9 rounded-md border border-border bg-surface px-2.5 text-xs text-foreground outline-none focus:border-white/30"
              >
                {AI_EFFORT_LEVELS.map((value) => <option key={value} value={value}>{aiEffortDisplayName(value)}</option>)}
              </select>
              <button
                type="button"
                onClick={() => void runAll()}
                disabled={running || !promptsReady}
                className="rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background disabled:opacity-40"
              >
                {running ? "Running 3 chats…" : "Run all 3"}
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-3 sm:p-4">
          <div className="grid h-full min-h-0 min-w-[900px] grid-cols-3 gap-3">
            {PLAYGROUND_VERSIONS.map((id) => (
              <PlaygroundColumn
                key={id}
                id={id}
                state={columns[id]}
              />
            ))}
          </div>
        </div>
      </div>
    </ChatBlockStateProvider>
  );
}

function PlaygroundColumn({
  id,
  state,
}: {
  id: PlaygroundVersionId;
  state: ColumnState;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!state.output) return;
    await navigator.clipboard.writeText(state.output);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Chat {id}</p>
        </div>
        {state.output && <button
          type="button"
          onClick={() => void copy()}
          disabled={!state.output}
          aria-label="Copy response"
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-30"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {state.started && <>
          <article className="chat-msg chat-msg-user flex justify-end">
            <div className="flex w-fit max-w-[min(100%,36rem)] flex-col items-end gap-2">
              <div className="prompt-bubble chat-body rounded-2xl bg-surface-2 px-4 py-2.5 text-left text-foreground">
                <p className="whitespace-pre-wrap text-sm leading-6">{state.prompt}</p>
              </div>
            </div>
          </article>

        <article className="chat-msg chat-msg-assistant mt-6 flex min-w-0 justify-start">
          <div className="min-w-0 w-full text-sm leading-6 text-foreground">
            {state.activity && <p className="mb-3 text-xs text-muted">{state.activity}</p>}
            {state.output && (
              <CitationProvider sources={state.sources}>
                <ChatBlockStateScope scope={`playground-v${id}`}>
                  <RichContent text={state.output} streaming={state.status === "running"} images={state.images} />
                </ChatBlockStateScope>
              </CitationProvider>
            )}
            {state.images.length > 0 && !state.output && (
              <RichContent text="" images={state.images} />
            )}
            {state.error && (
              <div className="mt-2 flex items-start gap-2 rounded-md border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-400">
                <span className="min-w-0 flex-1">{state.error}</span>
              </div>
            )}
          </div>
        </article>
        </>}
      </div>
    </section>
  );
}
