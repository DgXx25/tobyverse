import {
  deleteProject,
  markProjectHidden,
  rememberDiscardedProject,
  reserveProjectId,
} from "@/lib/projects";
import { allocateChatMessageId, createChatThread } from "@/lib/chats";
import { asChatMode } from "@/lib/core/chat-modes";
import { DEFAULT_PROJECT_GOAL } from "@/lib/core/constants";
import { recipeForGoal } from "@/lib/core/recipes";
import { stashPendingStart, type PendingAttachment, type PendingStart } from "@/lib/workspace/pending-start";
import type { ComposerIntent } from "@/lib/composer/intent";
import type { ComposerSkill } from "@/lib/composer/slash";
import type { ChatMode } from "@/types/chat";
import type { Project } from "@/types/project";
import { requireSignedInUser } from "@/lib/auth";
import {
  discardPreparedMaterials,
  commitMaterialText,
  prepareMaterialIngest,
  type IngestPhase,
  type PreparedMaterial,
} from "@/lib/materials/ingest-client";
import { DEFAULT_FIRST_PROMPT, PLACEHOLDER_CHAT_TITLE } from "@/lib/workspace/title";

const ingestByProject = new Map<string, Promise<string[]>>();

type OpeningProject = {
  project: Project;
  pending: PendingStart;
  ready: Promise<void>;
};

const openingByProject = new Map<string, OpeningProject>();

async function createProjectViaApi(input: {
  title: string;
  id?: string;
  listed?: boolean;
  createThread?: boolean;
  goal?: string;
  preferredChatMode?: ChatMode;
  timeoutMs?: number;
}): Promise<string> {
  const controller = new AbortController();
  let timeoutId = 0;
  try {
    return await Promise.race([
      (async () => {
        const user = await requireSignedInUser();
        const token = await user.getIdToken();
        if (controller.signal.aborted) throw new Error("Could not reach the server. Disable ad blocker if this persists.");
        const response = await fetch("/api/projects/create", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(input),
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => ({}))) as { projectId?: string; error?: string };
        if (!response.ok || !data.projectId) throw new Error(data.error || "Could not create project.");
        return data.projectId;
      })(),
      new Promise<string>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          controller.abort();
          reject(new Error("Could not reach the server. Disable ad blocker if this persists."));
        }, input.timeoutMs ?? 12_000);
      }),
    ]);
  } catch (error) {
    if (error instanceof TypeError) throw new Error("Could not reach the server. Disable ad blocker if this persists.");
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function openingProject(id: string, userId: string, mode?: ChatMode): Project {
  const goal = DEFAULT_PROJECT_GOAL;
  return {
    id,
    title: PLACEHOLDER_CHAT_TITLE,
    description: "",
    userId,
    goal,
    recipe: recipeForGoal(goal),
    preferredChatMode: asChatMode(mode),
    activeArtifact: null,
    projectMemory: [],
    listed: false,
    createdAt: null,
    updatedAt: null,
  };
}

export function peekOpeningProject(projectId: string): Project | null {
  return openingByProject.get(projectId)?.project ?? null;
}

export function peekOpeningPending(projectId: string): PendingStart | null {
  return openingByProject.get(projectId)?.pending ?? null;
}

export function waitForOpeningProject(projectId: string): Promise<void> {
  return openingByProject.get(projectId)?.ready ?? Promise.resolve();
}

function attachmentSource(attachment: PendingAttachment) {
  if (attachment.kind === "file") {
    return { kind: "file" as const, file: attachment.file };
  }
  if (attachment.kind === "paste") {
    return { kind: "paste" as const, text: attachment.text, title: attachment.title };
  }
  return { kind: "url" as const, url: attachment.url };
}

async function discardFailedStart(projectId: string, userId: string): Promise<void> {
  rememberDiscardedProject(projectId);
  openingByProject.delete(projectId);
  try {
    await deleteProject(projectId, userId);
    return;
  } catch (first) {
    console.error("Failed to delete project after ingest error; retrying.", first);
  }
  try {
    await deleteProject(projectId, userId);
  } catch (second) {
    console.error("Failed to delete project after ingest error; hiding sidebar row.", second);
    try {
      await markProjectHidden(projectId, userId);
    } catch (hideError) {
      console.error("Failed to hide leftover project after ingest error.", hideError);
    }
  }
}

async function ingestAttachments(input: {
  projectId: string;
  userId: string;
  attachments: PendingAttachment[];
  onPhase?: (phase: IngestPhase) => void;
}): Promise<string[]> {
  const prepared: PreparedMaterial[] = [];
  try {
    for (const attachment of input.attachments) {
      prepared.push(
        await prepareMaterialIngest({
          projectId: input.projectId,
          userId: input.userId,
          source: attachmentSource(attachment),
          onPhase: input.onPhase,
        }),
      );
    }
    const materialIds: string[] = [];
    for (const item of prepared) {
      materialIds.push(await commitMaterialText(item));
    }
    return materialIds;
  } catch (error) {
    await discardPreparedMaterials(prepared);
    throw error;
  }
}

/** In-memory ingest started from the home screen. Files cannot go in sessionStorage. */
export function takeProjectStartIngest(projectId: string): Promise<string[]> | null {
  return ingestByProject.get(projectId) ?? null;
}

export async function startProjectFromPrompt(input: {
  userId: string;
  prompt: string;
  attachments?: PendingAttachment[];
  intent?: ComposerIntent;
  skill?: ComposerSkill;
  mode?: ChatMode;
  onPhase?: (phase: IngestPhase) => void;
}): Promise<string> {
  const attachments = input.attachments ?? [];
  const prompt = input.prompt.trim() || (attachments.length > 0 ? DEFAULT_FIRST_PROMPT : "");
  if (!prompt && attachments.length === 0) {
    throw new Error("Type a prompt or attach a source to start.");
  }

  const projectId = reserveProjectId();
  const userMessageId = allocateChatMessageId(projectId);
  const pending: PendingStart = {
    prompt,
    materialIds: [],
    awaitingIngest: attachments.length > 0,
    intent: input.intent,
    skill: input.skill,
    mode: input.mode,
    userMessageId,
  };
  const project = openingProject(projectId, input.userId, input.mode);
  stashPendingStart(projectId, pending);

  const ready = (async () => {
    input.onPhase?.("uploading");
    const createdId = await createProjectViaApi({
      id: projectId,
      title: PLACEHOLDER_CHAT_TITLE,
      goal: DEFAULT_PROJECT_GOAL,
      preferredChatMode: input.mode,
    });
    if (createdId !== projectId) throw new Error("Project ID allocation changed unexpectedly.");
  })();

  openingByProject.set(projectId, { project, pending, ready });
  void ready.catch(async () => {
    await discardFailedStart(projectId, input.userId);
  });

  if (attachments.length > 0) {
    const ingest = ready
      .then(() =>
        ingestAttachments({
          projectId,
          userId: input.userId,
          attachments,
          onPhase: input.onPhase,
        }),
      )
      .then((ids) => {
        const next: PendingStart = {
          ...pending,
          materialIds: ids,
          awaitingIngest: false,
        };
        stashPendingStart(projectId, next);
        const current = openingByProject.get(projectId);
        if (current) openingByProject.set(projectId, { ...current, pending: next });
        return ids;
      });
    ingestByProject.set(projectId, ingest);
    void ingest
      .catch(async () => {
        await discardFailedStart(projectId, input.userId);
      })
      .finally(() => {
        const clear = () => {
          if (ingestByProject.get(projectId) === ingest) ingestByProject.delete(projectId);
        };
        if (typeof window === "undefined") {
          clear();
          return;
        }
        window.setTimeout(clear, 120_000);
      });
  }

  return projectId;
}

export async function createListedProject(input: { userId: string; title: string }): Promise<string> {
  const title = input.title.trim() || "New project";
  return createProjectViaApi({
    title,
    listed: true,
    createThread: false,
    timeoutMs: 12_000,
  });
}

export async function startChatInProject(input: {
  projectId: string;
  userId: string;
  prompt: string;
  attachments?: PendingAttachment[];
  intent?: ComposerIntent;
  skill?: ComposerSkill;
  mode?: ChatMode;
  title?: string;
  onPhase?: (phase: IngestPhase) => void;
}): Promise<string> {
  const attachments = input.attachments ?? [];
  const prompt = input.prompt.trim() || (attachments.length > 0 ? DEFAULT_FIRST_PROMPT : "");
  if (!prompt && attachments.length === 0) {
    throw new Error("Type a prompt or attach a source to start.");
  }

  const signedIn = await requireSignedInUser();
  const threadId = await createChatThread({
    projectId: input.projectId,
    userId: signedIn.uid,
    mode: asChatMode(input.mode),
    title: input.title?.trim() || PLACEHOLDER_CHAT_TITLE,
    kind: "main",
  });
  const userMessageId = allocateChatMessageId(input.projectId, threadId);
  const pending: PendingStart = {
    prompt,
    materialIds: [],
    awaitingIngest: attachments.length > 0,
    intent: input.intent,
    skill: input.skill,
    mode: input.mode,
    userMessageId,
  };
  stashPendingStart(threadId, pending);

  if (attachments.length > 0) {
    input.onPhase?.("uploading");
    const ingest = ingestAttachments({
      projectId: input.projectId,
      userId: input.userId,
      attachments,
      onPhase: input.onPhase,
    }).then((ids) => {
      stashPendingStart(threadId, { ...pending, materialIds: ids, awaitingIngest: false });
      return ids;
    });
    ingestByProject.set(threadId, ingest);
    void ingest.finally(() => {
      const clear = () => {
        if (ingestByProject.get(threadId) === ingest) ingestByProject.delete(threadId);
      };
      if (typeof window === "undefined") {
        clear();
        return;
      }
      window.setTimeout(clear, 120_000);
    });
  }

  return threadId;
}
