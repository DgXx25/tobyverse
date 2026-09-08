import { DEFAULT_AI_PROVIDER } from "@/lib/ai/catalog";
import { readChatSse } from "@/lib/ai/sse";
import { type ChatToolCall } from "@/lib/ai/tools";
import { dispatchChatTool } from "@/lib/chat/dispatch";
import {
  EVAL_FIXTURE_COUNT,
  EVAL_SUITES,
  evalProjectTitle,
  judgeEvalCase,
  lineNote,
  resolveEvalPrompt,
  resolveFollowupTopic,
  type EvalJudgeContext,
} from "@/lib/admin/eval";
import { authHeaders } from "@/lib/api/client";
import { chatArtifactToActive } from "@/lib/artifacts/active";
import { addChatMessage } from "@/lib/chats";
import { intentFromTool, pendingCreateFromMessages, resolvePendingKind } from "@/lib/composer/intent";
import { artifactFacts, historyTurnsFromMessages, latestArtifact } from "@/lib/composer/memory";
import { DEFAULT_CHAT_THREAD_ID, DEFAULT_PROJECT_GOAL } from "@/lib/core/constants";
import { exerciseStem, getExercise } from "@/lib/exercises/store";
import {
  createProject,
  deleteProject,
  getProjectById,
  updateProjectActiveArtifact,
} from "@/lib/projects";
import { getStudySheet } from "@/lib/study-sheets/store";
import type {
  EvalArtifactPreview,
  EvalCaseResult,
  EvalCaseSpec,
  EvalPracticePreviewItem,
  EvalRun,
  EvalSuiteId,
  EvalTranscriptMessage,
} from "@/types/admin";
import type { ChatArtifact, ChatMessage, ChatTurn, PendingKind } from "@/types/chat";
import type { ActiveArtifact, Project } from "@/types/project";

type Live = {
  onStatus?: (status: string) => void;
  onUser?: (message: EvalTranscriptMessage) => void;
  onStream?: (text: string) => void;
  onAssistant?: (message: EvalTranscriptMessage) => void;
  onArtifact?: (preview: EvalArtifactPreview) => void;
};

type Session = {
  userId: string;
  project: Project;
  messages: ChatMessage[];
  active: ActiveArtifact | null;
  practice: { id: string; title: string; count: number; ids: string[] } | null;
  sheet: { id: string; title: string } | null;
  followupTopic: string;
  live: Live;
};

type TurnResult = {
  tool: ChatToolCall;
  text: string;
  chips: boolean;
  created: boolean;
  card: boolean;
  artifact: ChatArtifact | null;
  error?: string;
};

function emptyTool(): ChatToolCall {
  return { name: "answer", args: {} };
}

function toUiMessage(message: ChatMessage): EvalTranscriptMessage {
  return {
    id: message.id,
    role: message.role === "user" ? "user" : "assistant",
    content: message.content,
    artifact: message.artifact
      ? {
          kind: message.artifact.kind,
          id: message.artifact.id,
          title: message.artifact.title,
          count: message.artifact.count,
        }
      : null,
  };
}

function pushMessage(session: Session, message: ChatMessage) {
  session.messages = [...session.messages, message];
}

async function record(
  session: Session,
  input: {
    role: "user" | "assistant";
    content: string;
    intent: ChatMessage["intent"];
    artifact?: ChatArtifact | null;
    options?: string[];
    pendingKind?: PendingKind;
    images?: ChatMessage["images"];
  },
): Promise<ChatMessage> {
  const id = await addChatMessage({
    projectId: session.project.id,
    userId: session.userId,
    role: input.role,
    mode: "normal",
    content: input.content,
    intent: input.intent,
    artifact: input.artifact ?? null,
    options: input.options,
    pendingKind: input.pendingKind,
    images: input.images,
  });
  const message: ChatMessage = {
    id,
    projectId: session.project.id,
    threadId: DEFAULT_CHAT_THREAD_ID,
    lessonId: null,
    exerciseId: null,
    role: input.role,
    mode: "normal",
    content: input.content,
    attachments: [],
    relatedExerciseType: null,
    intent: input.intent,
    artifact: input.artifact ?? null,
    options: input.options,
    pendingKind: input.pendingKind,
    images: input.images,
    createdAt: new Date().toISOString(),
  };
  pushMessage(session, message);
  const ui = toUiMessage(message);
  if (input.role === "user") session.live.onUser?.(ui);
  else session.live.onAssistant?.(ui);
  return message;
}

function activeContext(active: ActiveArtifact | null) {
  if (!active) return null;
  return {
    kind: active.kind,
    id: active.id,
    title: active.title,
    count: active.count ?? active.ids?.length,
    status: active.status,
  };
}

async function streamChat(session: Session, prompt: string): Promise<{ text: string; tool: ChatToolCall }> {
  const history: ChatTurn[] = historyTurnsFromMessages(session.messages);
  const pending = pendingCreateFromMessages(session.messages);
  const pendingKind = resolvePendingKind(prompt, pending);
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({
      prompt,
      mode: "normal",
      provider: DEFAULT_AI_PROVIDER,
      history,
      context: {
        projectId: session.project.id,
        projectTitle: session.project.title,
        projectDescription: session.project.description,
        goal: session.project.goal,
        materials: [],
        knowledgeItems: [],
        artifacts: artifactFacts(session.messages),
        latestArtifact: latestArtifact(session.messages),
        activeArtifact: activeContext(session.active),
        hasMaterials: false,
        priorClarify: pending.priorClarify,
        pendingTopic: pending.pendingTopic ?? undefined,
        pendingKind: pendingKind ?? undefined,
      },
    }),
  });
  let streamed = "";
  const result = await readChatSse(response, {
    onDelta: (delta) => {
      streamed += delta;
      session.live.onStream?.(streamed);
    },
  });
  const tool = result.tool ?? emptyTool();
  const text = result.text.trim() || tool.args.question || "";
  return { text, tool };
}

async function remember(session: Session, artifact: ChatArtifact) {
  const active = chatArtifactToActive(artifact, "ready");
  session.active = active;
  session.project = { ...session.project, activeArtifact: active };
  await updateProjectActiveArtifact(session.project.id, session.userId, active).catch(() => undefined);
}

function previewStem(data: Record<string, unknown>, fallback: string): string {
  const stem = [data.question, data.statement, data.prompt, data.problem, data.scenario, data.text].find(
    (value) => typeof value === "string" && value.trim(),
  ) as string | undefined;
  return (stem ?? fallback).replace(/\s+/g, " ").trim().slice(0, 400);
}

async function emitPracticePreview(session: Session): Promise<number> {
  const practice = session.practice;
  if (!practice) return 0;
  const items: EvalPracticePreviewItem[] = [];
  for (const id of practice.ids) {
    const exercise = await getExercise(session.project.id, id);
    if (!exercise) continue;
    items.push({
      id: exercise.id,
      type: exercise.type,
      stem: previewStem(exercise.data as Record<string, unknown>, exerciseStem(exercise)),
    });
  }
  session.live.onArtifact?.({
    kind: "practice",
    id: practice.id,
    title: practice.title,
    count: items.length,
    items,
  });
  return items.length;
}

async function emitSheetPreview(session: Session): Promise<number> {
  const sheetId = session.sheet?.id;
  if (!sheetId) return 0;
  const sheet = await getStudySheet(session.project.id, sheetId);
  if (!sheet) return 0;
  session.live.onArtifact?.({
    kind: "sheet",
    id: sheet.id,
    title: sheet.title,
    content: sheet.content,
  });
  return sheet.content.trim().length;
}

async function applyDispatch(
  session: Session,
  input: {
    prompt: string;
    text: string;
    tool: ChatToolCall;
    onStatus: (status: string) => void;
  },
): Promise<{ artifact: ChatArtifact | null; error?: string }> {
  try {
    const dispatched = await dispatchChatTool({
      tool: input.tool,
      text: input.text,
      prompt: input.prompt,
      project: session.project,
      userId: session.userId,
      materials: [],
      active: session.active,
      messages: session.messages,
      count: input.tool.name === "create_practice" ? EVAL_FIXTURE_COUNT : undefined,
      pendingKind: resolvePendingKind(input.prompt, pendingCreateFromMessages(session.messages)),
      onStatus: input.onStatus,
    });
    await record(session, {
      role: "assistant",
      content: dispatched.content || input.text || "(empty)",
      intent: dispatched.intent,
      artifact: dispatched.artifact ?? null,
      options: dispatched.options,
      pendingKind: dispatched.pendingKind,
      images: dispatched.images,
    });
    if (dispatched.artifact) {
      await remember(session, dispatched.artifact);
      if (dispatched.artifact.kind === "practice") {
        session.practice = {
          id: dispatched.artifact.id,
          title: dispatched.artifact.title,
          count: dispatched.artifact.count ?? dispatched.artifact.ids?.length ?? 0,
          ids: dispatched.artifact.ids ?? [],
        };
        await emitPracticePreview(session);
      } else if (dispatched.artifact.kind === "sheet" || dispatched.artifact.kind === "plan") {
        session.sheet = { id: dispatched.artifact.id, title: dispatched.artifact.title };
        await emitSheetPreview(session);
      }
    }
    return { artifact: dispatched.artifact ?? null };
  } catch (error) {
    return { artifact: null, error: error instanceof Error ? error.message : "Artifact step failed." };
  }
}

async function runTurn(session: Session, prompt: string, onStatus: (status: string) => void): Promise<TurnResult> {
  await record(session, { role: "user", content: prompt, intent: "ask" });
  onStatus("Routing…");
  session.live.onStream?.("");
  const { text, tool } = await streamChat(session, prompt);
  const chips = tool.name === "suggest_practice" || tool.name === "suggest_sheet";
  const created = tool.name === "create_practice" || tool.name === "create_sheet";

  session.live.onStream?.(created ? "" : text);
  const applied = await applyDispatch(session, { prompt, text, tool, onStatus });
  if (applied.error) {
    await record(session, {
      role: "assistant",
      content: applied.error,
      intent: intentFromTool(tool.name),
    }).catch(() => undefined);
  }
  return {
    tool,
    text,
    chips,
    created,
    card: Boolean(applied.artifact),
    artifact: applied.artifact,
    error: applied.error,
  };
}

function snapshotPractice(session: Session) {
  return {
    practiceId: session.practice?.id ?? null,
    practiceCount: session.practice?.count ?? null,
    practiceTitle: session.practice?.title ?? null,
  };
}

function snapshotSheet(session: Session) {
  return { sheetId: session.sheet?.id ?? null };
}

export async function runEvalSuite(input: {
  userId: string;
  suiteId?: EvalSuiteId;
  variant?: string;
  onStatus?: (status: string) => void;
  onUser?: (message: EvalTranscriptMessage) => void;
  onStream?: (text: string) => void;
  onAssistant?: (message: EvalTranscriptMessage) => void;
  onArtifact?: (preview: EvalArtifactPreview) => void;
  onRow?: (row: EvalCaseResult, run: EvalRun) => void;
}): Promise<EvalRun> {
  const suiteId = input.suiteId ?? "core";
  const variant = (input.variant ?? "").trim();
  const cases = EVAL_SUITES[suiteId];
  const startedAt = new Date().toISOString();
  const title = evalProjectTitle(suiteId);
  const run: EvalRun = {
    id: `run-${Date.now()}`,
    suiteId,
    variant,
    projectId: null,
    projectTitle: title,
    startedAt,
    finishedAt: null,
    cases: [],
    passed: 0,
    failed: 0,
  };

  const status = (line: string) => input.onStatus?.(line);
  const live: Live = {
    onStatus: input.onStatus,
    onUser: input.onUser,
    onStream: input.onStream,
    onAssistant: input.onAssistant,
    onArtifact: input.onArtifact,
  };
  let projectId: string | null = null;

  try {
    status("Creating throwaway project…");
    projectId = await createProject({
      title,
      description: "admin eval throwaway",
      userId: input.userId,
      goal: DEFAULT_PROJECT_GOAL,
    });
    const project = await getProjectById(projectId);
    if (!project) throw new Error("Could not load eval project.");
    run.projectId = project.id;

    const session: Session = {
      userId: input.userId,
      project,
      messages: [],
      active: null,
      practice: null,
      sheet: null,
      followupTopic: resolveFollowupTopic(variant),
      live,
    };

    for (const spec of cases) {
      const prompt = resolveEvalPrompt(spec, variant);
      status(`Case ${spec.id}/${cases.length} · ${prompt}`);
      const prevPractice = snapshotPractice(session);
      const prevSheet = snapshotSheet(session);
      const row = await runCase(session, spec, prompt, prevPractice, prevSheet, status);
      run.cases = [...run.cases, row];
      run.passed = run.cases.filter((item) => item.pass).length;
      run.failed = run.cases.length - run.passed;
      input.onRow?.(row, { ...run });
    }
  } catch (error) {
    const note = error instanceof Error ? error.message : "Suite failed.";
    if (run.cases.length < cases.length) {
      for (const spec of cases.slice(run.cases.length)) {
        run.cases = [
          ...run.cases,
          {
            id: spec.id,
            prompt: resolveEvalPrompt(spec, variant),
            expected: spec.expected,
            actual: "error",
            pass: false,
            note: lineNote(note),
          },
        ];
      }
      run.passed = run.cases.filter((item) => item.pass).length;
      run.failed = run.cases.length - run.passed;
    }
  } finally {
    if (projectId) {
      status("Deleting throwaway project…");
      await deleteProject(projectId, input.userId).catch(() => undefined);
    }
    run.finishedAt = new Date().toISOString();
    status("Done");
  }

  return run;
}

async function runCase(
  session: Session,
  spec: EvalCaseSpec,
  prompt: string,
  prevPractice: { practiceId: string | null; practiceCount: number | null; practiceTitle: string | null },
  prevSheet: { sheetId: string | null },
  onStatus: (status: string) => void,
): Promise<EvalCaseResult> {
  if (spec.skipIfPracticeExists && session.practice) {
    const judged = judgeEvalCase(spec.judge, {
      tool: emptyTool(),
      text: "",
      chips: false,
      created: false,
      card: Boolean(session.practice),
      practiceId: session.practice.id,
      prevPracticeId: prevPractice.practiceId,
      practiceCount: session.practice.count,
      prevPracticeCount: prevPractice.practiceCount,
      sheetId: session.sheet?.id ?? null,
      prevSheetId: prevSheet.sheetId,
      practiceTitle: session.practice.title,
      skipped: true,
      itemsCount: session.practice.ids.length,
    });
    return { id: spec.id, prompt, expected: spec.expected, ...judged };
  }

  const turn = await runTurn(session, prompt, onStatus);
  let followupTool: ChatToolCall | null = null;

  if (spec.followupIfClarify && turn.tool.name === "clarify") {
    onStatus(`Follow-up after clarify · ${session.followupTopic}`);
    const follow = await runTurn(session, session.followupTopic, onStatus);
    followupTool = follow.tool;
    if (follow.error) {
      return {
        id: spec.id,
        prompt,
        expected: spec.expected,
        actual: "clarify → error",
        pass: false,
        note: lineNote(follow.error),
      };
    }
  }

  if (turn.error && !(spec.followupIfClarify && turn.tool.name === "clarify")) {
    return {
      id: spec.id,
      prompt,
      expected: spec.expected,
      actual: turn.tool.name,
      pass: false,
      note: lineNote(turn.error),
    };
  }

  const ctx: EvalJudgeContext = {
    tool: turn.tool,
    text: turn.text,
    chips: turn.chips,
    created: turn.created,
    card: turn.card || Boolean(session.practice) || Boolean(session.sheet),
    practiceId: session.practice?.id ?? null,
    prevPracticeId: prevPractice.practiceId,
    practiceCount: session.practice?.count ?? null,
    prevPracticeCount: prevPractice.practiceCount,
    sheetId: session.sheet?.id ?? null,
    prevSheetId: prevSheet.sheetId,
    practiceTitle: session.practice?.title ?? prevPractice.practiceTitle,
    followupTool,
    itemsCount: session.practice?.ids.length,
    sheetChars: undefined,
  };

  if (spec.judge === "sheet-create" && session.sheet) {
    const sheet = await getStudySheet(session.project.id, session.sheet.id);
    ctx.sheetChars = sheet?.content.trim().length ?? 0;
  }

  const judged = judgeEvalCase(spec.judge, ctx);
  return { id: spec.id, prompt, expected: spec.expected, ...judged };
}
