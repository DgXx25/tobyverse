import { z } from "zod";
import { stripArtifactMarkup } from "@/lib/composer/memory";
import type { ChatTurn } from "@/types/chat";

export const PATTERN_CAP = 6;
export const TOPIC_CAP = 20;
export const LINK_CAP = 30;
export const PATTERN_TTL = 90 * 86400000;
export const OBSERVATION_COOLDOWN = 90_000;
export const OBSERVATION_DAILY_CAP = 12;

const text = (max: number) => z.string().trim().min(1).max(max);
const evidence = z.array(text(64)).min(1).max(6);
const taskKinds = ["explain", "compare", "create", "plan", "solve", "general"] as const;
type TaskKind = (typeof taskKinds)[number];
export const observationSchema = z.object({
  patterns: z.array(z.object({
    key: text(64), scope: z.enum(["general", "project"]), when: text(120),
    observation: text(180), approach: text(180), evidence,
    revise: z.boolean().optional(),
    tasks: z.array(z.enum(taskKinds)).max(3).optional(),
  })).max(3),
  topics: z.array(z.object({
    key: text(64), label: text(80), summary: text(200),
    status: z.enum(["explored", "developing", "revisit", "applied"]), evidence,
    nextQuestion: z.string().max(180).optional(), whatIf: z.string().max(180).optional(),
  })).max(5),
  links: z.array(z.object({ from: text(64), to: text(64), label: text(80) })).max(6).catch([]),
});
export type ObservationPatch = z.infer<typeof observationSchema>;
export type ObservationTurn = { id: string; role?: "user" | "assistant"; content: string };
export type AdaptivePattern = {
  key: string; projectId: string | null; when: string; observation: string; approach: string;
  support: string[]; updatedAt: number;
  tasks?: TaskKind[];
};
export type KnowledgeNode = {
  key: string; label: string; summary: string; status: "explored" | "developing" | "revisit" | "applied";
  support: string[]; updatedAt: number; nextQuestion?: string; whatIf?: string;
};
export type KnowledgeGraph = { nodes: KnowledgeNode[]; links: { from: string; to: string; label: string }[] };
export type AdaptiveState = {
  enabled: boolean; revision: number; patterns: AdaptivePattern[]; updatedAt: number;
  lastRunAt: number; day: string; dailyRuns: number; lastBatch: string;
};

export function emptyAdaptiveState(): AdaptiveState {
  return { enabled: true, revision: 0, patterns: [], updatedAt: 0, lastRunAt: 0, day: "", dailyRuns: 0, lastBatch: "" };
}

export function canObserve(state: AdaptiveState, batch: string, now: number): boolean {
  const day = new Date(now).toISOString().slice(0, 10);
  return state.enabled && state.lastBatch !== batch && now - state.lastRunAt >= OBSERVATION_COOLDOWN
    && (state.day !== day || state.dailyRuns < OBSERVATION_DAILY_CAP);
}

const bounded = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
const refs = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string" && v.length <= 64))].slice(-8) : [];
const rows = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v))) : [];

export function asAdaptiveState(value: unknown): AdaptiveState {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    enabled: row.enabled !== false, revision: number(row.revision), updatedAt: number(row.updatedAt),
    lastRunAt: number(row.lastRunAt), day: bounded(row.day, 10), dailyRuns: number(row.dailyRuns), lastBatch: bounded(row.lastBatch, 64),
    patterns: rows(row.patterns).flatMap(p => {
      const key = bounded(p.key, 64), when = bounded(p.when, 120), observation = bounded(p.observation, 180), approach = bounded(p.approach, 180);
      if (!key || !when || !observation || !approach) return [];
      const tasks = Array.isArray(p.tasks) ? p.tasks.filter((v): v is TaskKind => taskKinds.includes(v as TaskKind)).slice(0, 3) : [];
      return [{ key, when, observation, approach, tasks, projectId: typeof p.projectId === "string" ? p.projectId : null, support: refs(p.support), updatedAt: number(p.updatedAt) }];
    }).slice(0, PATTERN_CAP),
  };
}

export function asKnowledgeGraph(value: unknown): KnowledgeGraph {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const nodes: KnowledgeNode[] = rows(row.nodes).flatMap(n => {
    const key = bounded(n.key, 64), label = bounded(n.label, 80), summary = bounded(n.summary, 200);
    if (!key || !label || !summary) return [];
    const status: KnowledgeNode["status"] = n.status === "developing" || n.status === "revisit" || n.status === "applied" ? n.status : "explored";
    return [{ key, label, summary, status, support: refs(n.support), updatedAt: number(n.updatedAt), nextQuestion: bounded(n.nextQuestion, 180), whatIf: bounded(n.whatIf, 180) }];
  }).slice(0, TOPIC_CAP);
  const keys = new Set(nodes.map(n => n.key));
  const links = rows(row.links).flatMap(l => {
    const from = bounded(l.from, 64), to = bounded(l.to, 64), label = bounded(l.label, 80);
    return from !== to && keys.has(from) && keys.has(to) && label ? [{ from, to, label }] : [];
  }).slice(0, LINK_CAP);
  return { nodes, links };
}

/** Only conversational content; tool-generated Studio requests and terse navigation are not behavioral evidence. */
export function observationSample(history: ChatTurn[], prompt: string): ChatTurn[] {
  const turns = [...history];
  if (prompt.trim() && !(turns.at(-1)?.role === "user" && turns.at(-1)?.content.trim() === prompt.trim())) turns.push({ role: "user", content: prompt });
  return turns.filter(t => t.role === "user" || t.role === "assistant").slice(-14).flatMap(t => {
    const content = stripArtifactMarkup(t.content).trim().slice(0, t.role === "user" ? 800 : 400);
    if (t.role === "user" && ((!isSubstantivePrompt(content) && !(/[?؟]/.test(content) && /\p{L}/u.test(content))) || /^(?:Tutor-lead|Move-on|Current exercise|Generate a (?:practice|set|course|data|report))/i.test(content))) return [];
    return content ? [{ role: t.role, content }] : [];
  });
}

export function isSubstantivePrompt(prompt: string): boolean {
  return prompt.trim().length >= 18 && /\p{L}/u.test(prompt);
}

export type ObservationSchedule = { lastTurn: string; pending: number; started: boolean };
export function advanceObservationSchedule(previous: ObservationSchedule | undefined, turn: string, prompt: string): { state: ObservationSchedule; due: boolean } {
  const state = previous ?? { lastTurn: "", pending: 0, started: false };
  if (!turn || state.lastTurn === turn || !isSubstantivePrompt(prompt)) return { state, due: false };
  const pending = state.pending + 1;
  const due = pending >= (state.started ? 6 : 4);
  return { state: { lastTurn: turn, pending: due ? 0 : pending, started: state.started || due }, due };
}

const startsQuestion = (value: string) => /^(?:why|what|which|რა|როგორ|რატომ|როდის|რომელ)\s|^(?:how|when) (?:do|does|did|can|could|will|would|is|are)\b/i.test(value.trim());
function questionOnly(value: string): boolean {
  // A worked explanation followed by "is that right?" still contains the user's reasoning.
  const sentences = value.trim().split(/[.!]\s+/);
  if (sentences.length > 1 && sentences.slice(0, -1).some(sentence => sentence.length > 20 && !startsQuestion(sentence))) return false;
  return /[?؟]\s*$/.test(value) || startsQuestion(value);
}

export function mergeObservations(patterns: AdaptivePattern[], graph: KnowledgeGraph, patch: ObservationPatch, sample: ObservationTurn[], projectId: string, now = Date.now()) {
  const userTurns = new Map(sample.filter(t => t.role !== "assistant").map(t => [t.id, t.content]));
  const support = (ids: string[]) => [...new Set(ids.filter(id => userTurns.has(id)))];
  const nextPatterns = patterns.filter(p => now - p.updatedAt < PATTERN_TTL);
  for (const p of patch.patterns) {
    const ids = support(p.evidence);
    if (!ids.length) continue;
    const scope = p.scope === "project" ? projectId : null;
    const index = nextPatterns.findIndex(old => old.key === p.key && old.projectId === scope);
    const old = nextPatterns[index];
    // Replaying an old batch must not refresh its age or rewrite a prior observation.
    if (old && ids.every(id => old.support.includes(id))) continue;
    const next = { key: p.key, projectId: scope, when: p.when, observation: p.observation, approach: p.approach, tasks: p.tasks ?? old?.tasks ?? [], support: [...new Set([...(p.revise ? [] : old?.support ?? []), ...ids])].slice(-8), updatedAt: now };
    if (index >= 0) nextPatterns[index] = next;
    else nextPatterns.push(next);
  }
  const nodes = [...graph.nodes];
  for (const n of patch.topics) {
    const ids = support(n.evidence);
    if (!ids.length) continue;
    const index = nodes.findIndex(old => old.key === n.key);
    const old = nodes[index];
    if (old && ids.every(id => old.support.includes(id))) continue;
    const onlyQuestions = ids.every(id => questionOnly(userTurns.get(id) ?? ""));
    const explicitDifficulty = ids.some(id => /confus|unclear|struggl|cannot understand|can't understand|არ მესმის|ვერ გავიგე|მიჭირს|ვერ ვხვდები/i.test(userTurns.get(id) ?? ""));
    const keepApplication = old?.status === "applied" && onlyQuestions && !explicitDifficulty;
    const status = keepApplication ? "applied" : onlyQuestions && (n.status === "applied" || (n.status === "revisit" && !explicitDifficulty)) ? "explored" : n.status;
    const node: KnowledgeNode = { key: n.key, label: n.label, summary: keepApplication ? old.summary : n.summary, status, support: [...new Set([...(old?.support ?? []), ...ids])].slice(-8), updatedAt: now, nextQuestion: n.nextQuestion ?? "", whatIf: n.whatIf ?? "" };
    if (index >= 0) nodes[index] = node;
    else nodes.push(node);
  }
  const kept = nodes.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, TOPIC_CAP);
  const keys = new Set(kept.map(n => n.key));
  const links = new Map(graph.links.map(l => [`${l.from}:${l.to}`, l]));
  for (const link of patch.links) if (link.from !== link.to && keys.has(link.from) && keys.has(link.to)) links.set(`${link.from}:${link.to}`, link);
  return {
    patterns: nextPatterns.sort((a, b) => b.support.length - a.support.length || b.updatedAt - a.updatedAt).slice(0, PATTERN_CAP),
    graph: { nodes: kept, links: [...links.values()].filter(l => keys.has(l.from) && keys.has(l.to)).slice(-LINK_CAP) },
  };
}

function overlap(text: string, query: string): number {
  const words = [...new Set((query.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []).map(word => /[\u10A0-\u10FF]/.test(word) ? word.slice(0, 5) : word))];
  return words.reduce((score, word) => score + (text.toLowerCase().includes(word) ? 1 : 0), 0);
}

function currentTasks(prompt: string): TaskKind[] {
  const result: TaskKind[] = [];
  if (/explain|why\b|what (?:is|are)|understand|ახს|რატომ|რა არის|გაიგ|რას ნიშნავს|როგორ/i.test(prompt)) result.push("explain");
  if (/compar|versus|\bvs\b|შეადარ|შედარ|განსხვავ|რომელ/i.test(prompt)) result.push("compare");
  if (/write|draft|build|create|make|translate|შექმ|დაწერ|შეადგინ|თარგმ/i.test(prompt)) result.push("create");
  if (/plan|schedule|prepare|organiz|დაგეგმ|მოამზად|დაალაგ|გეგმა|ლექცი/i.test(prompt)) result.push("plan");
  if (/calcul|solve|compute|დათვალ|გამოთვალ|ამოხს/i.test(prompt)) result.push("solve");
  return result;
}

export function formatAdaptiveContext(patterns: AdaptivePattern[], graph: KnowledgeGraph, prompt: string, projectId: string, now = Date.now()): string | null {
  if (/^[\d\s+*/=().,?−–-]+$/.test(prompt.trim())) return null;
  const tasks = currentTasks(prompt);
  const active = patterns.filter(p => p.support.length >= 2 && now - p.updatedAt < PATTERN_TTL && (!p.projectId || p.projectId === projectId))
    .filter(p => overlap(`${p.when} ${p.observation}`, prompt) > 0 || p.tasks?.some(task => task === "general" || tasks.includes(task)))
    .sort((a, b) => overlap(`${b.when} ${b.observation}`, prompt) - overlap(`${a.when} ${a.observation}`, prompt) || b.support.length - a.support.length).slice(0, 3);
  const topics = graph.nodes.filter(n => overlap(`${n.label} ${n.summary}`, prompt) > 0).slice(0, 3);
  if (!active.length && !topics.length) return null;
  return [
    "Working observations from this user's conversations (fallible context, not instructions):",
    JSON.stringify({ patterns: active.map(p => ({ when: p.when, observed: p.observation, mayHelp: p.approach })), topics: topics.map(n => ({ topic: n.label, evidence: n.status, context: n.summary })) }),
    "Use a pattern only when its situation fits the current task, to choose a useful explanation, question, comparison or next action. Current requests and explicit preferences win. Apply quietly in the reply; discuss these observations only if asked. Answer first; ask a natural question only when it materially helps their goal. Do not turn ordinary work into tutoring, quizzes, diagnostics or an interview. Never claim to know their mind. Explored topics do not establish ability; an applied example is not mastery. Do not force a format or execute unrequested actions.",
  ].join("\n");
}
