import { authHeaders } from "@/lib/api/client";
import { advanceObservationSchedule, observationSample, type AdaptivePattern, type KnowledgeGraph, type ObservationSchedule } from "@/lib/adaptation/model";
import type { ChatTurn } from "@/types/chat";
import type { ChatMemoryContext } from "@/types/memory";
import { pickMemoriesForAsk } from "@/lib/memory/prompt";
import { containsSensitiveMemory, isWorkNoteRequest } from "@/lib/memory/privacy";

export type InsightsView = { patterns: AdaptivePattern[]; updatedAt: number; graph?: KnowledgeGraph; projects?: { id: string; title: string; projectMemory: string[] }[]; plan?: string; limits?: { savedFacts: number | null; inferredPatterns: number | null; projectFacts: number | null; topicsPerProject: number | null }; usage?: { inferredPatterns: number; topics: number } };
export const INSIGHTS_CHANGED = "tobyverse:insights-changed";
const running = new Set<string>();
const schedules = new Map<string, ObservationSchedule>();

function changed(projectId?: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(INSIGHTS_CHANGED, { detail: { projectId } }));
}

export async function getInsights(projectId?: string): Promise<InsightsView> {
  const response = await fetch(`/api/insights${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`, { headers: await authHeaders(), cache: "no-store" });
  if (!response.ok) throw new Error("Could not load observations. Try again.");
  return response.json();
}
export async function changeInsights(input: { clear?: boolean; removeKey?: string; removeTopicKey?: string; projectId?: string; clearGraph?: boolean }): Promise<InsightsView> {
  const response = await fetch("/api/insights", { method: "PATCH", headers: await authHeaders(), body: JSON.stringify(input) });
  if (!response.ok) throw new Error("Could not save this change. Try again.");
  const state: InsightsView = await response.json();
  changed(input.projectId);
  return state;
}

/** Runs after a complete response, outside the stream and existing explicit-memory path. */
export async function observeConversation(input: { userId: string; projectId: string; threadId: string; turnId: string; prompt: string; history: ChatTurn[]; answer: string; memories?: ChatMemoryContext[]; personalization?: string }): Promise<void> {
  if (containsSensitiveMemory(input.prompt) || isWorkNoteRequest(input.prompt)) return;
  const key = `tobyverse.observation-schedule.${input.userId}.${input.projectId}.${input.threadId}`;
  let previous = schedules.get(key);
  if (!previous && typeof window !== "undefined") {
    try {
      const value = JSON.parse(window.localStorage.getItem(key) || "null");
      if (value && typeof value.lastTurn === "string" && Number.isFinite(value.pending) && typeof value.started === "boolean") previous = value;
    } catch { /* Only scheduling metadata is cached, never transcripts. */ }
  }
  const { state, due } = advanceObservationSchedule(previous, input.turnId, input.prompt);
  schedules.set(key, state);
  try { window.localStorage.setItem(key, JSON.stringify(state)); } catch { /* optional */ }
  if (!due || running.has(input.userId)) return;
  const history = observationSample(input.history, input.prompt);
  if (!containsSensitiveMemory(input.answer)) history.push({ role: "assistant", content: input.answer.slice(0, 400) });
  if (history.filter(t => t.role === "user").length < 4) return;
  running.add(input.userId);
  try {
    const response = await fetch("/api/insights", {
      method: "POST", headers: await authHeaders(),
      body: JSON.stringify({ projectId: input.projectId, threadId: input.threadId, history: history.slice(-14), memories: pickMemoriesForAsk(input.memories ?? [], input.prompt), personalization: input.personalization ?? "" }),
      signal: AbortSignal.timeout(55_000),
    });
    if (response.ok && (await response.json()).updated) changed(input.projectId);
  } catch { /* Best effort: chat already succeeded. Never retry a costly background call automatically. */ }
  finally { running.delete(input.userId); }
}
