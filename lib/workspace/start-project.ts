import {
  createProject,
  deleteProject,
  markProjectHidden,
  rememberDiscardedProject,
  reserveProjectId,
} from "@/lib/projects";
import { DEFAULT_PROJECT_GOAL } from "@/lib/core/constants";
import { stashPendingStart, type PendingAttachment } from "@/lib/workspace/pending-start";
import { requireSignedInUser } from "@/lib/auth";
import {
  discardPreparedMaterials,
  commitMaterialText,
  finalizeMaterialImages,
  prepareMaterialIngest,
  type IngestPhase,
  type PreparedMaterial,
} from "@/lib/materials/ingest-client";
import { DEFAULT_COMPOSER_INTENT, type ComposerIntent } from "@/lib/composer/intent";
import { PLACEHOLDER_CHAT_TITLE } from "@/lib/workspace/title";

const ingestByProject = new Map<string, Promise<string[]>>();

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
    void Promise.allSettled(prepared.map((item) => finalizeMaterialImages(item)));
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
  onPhase?: (phase: IngestPhase) => void;
}): Promise<string> {
  const attachments = input.attachments ?? [];
  const prompt = input.prompt.trim();
  if (!prompt && attachments.length === 0) {
    throw new Error("Type a prompt or attach a source to start.");
  }

  const signedIn = await requireSignedInUser();
  const userId = signedIn.uid;
  const intent = input.intent ?? DEFAULT_COMPOSER_INTENT;

  let projectId: string | null = null;
  let created = false;

  try {
    projectId = reserveProjectId();

    input.onPhase?.("uploading");
    await createProject({
      id: projectId,
      title: PLACEHOLDER_CHAT_TITLE,
      userId,
      goal: DEFAULT_PROJECT_GOAL,
    });
    created = true;

    stashPendingStart(projectId, {
      prompt,
      materialIds: [],
      intent,
      awaitingIngest: attachments.length > 0,
    });

    if (attachments.length > 0) {
      const ingest = ingestAttachments({
        projectId,
        userId,
        attachments,
        onPhase: input.onPhase,
      });
      ingestByProject.set(projectId, ingest);
      void ingest.finally(() => {
        const clear = () => {
          if (ingestByProject.get(projectId!) === ingest) ingestByProject.delete(projectId!);
        };
        if (typeof window === "undefined") {
          clear();
          return;
        }
        window.setTimeout(clear, 120_000);
      });
    }

    return projectId;
  } catch (error) {
    if (created && projectId) {
      await discardFailedStart(projectId, userId);
    }
    throw error;
  }
}
