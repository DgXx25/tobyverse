import { createProject, deleteProject, reserveProjectId } from "@/lib/projects";
import { DEFAULT_PROJECT_GOAL } from "@/lib/core/constants";
import { stashPendingStart, type PendingAttachment } from "@/lib/workspace/pending-start";
import { requireSignedInUser } from "@/lib/auth";
import {
  discardPreparedMaterials,
  finalizeMaterialIngest,
  prepareMaterialIngest,
  type PreparedMaterial,
} from "@/lib/materials/ingest-client";
import { listMaterials, removeMaterial } from "@/lib/materials";
import { DEFAULT_COMPOSER_INTENT, type ComposerIntent } from "@/lib/composer/intent";
import { PLACEHOLDER_CHAT_TITLE } from "@/lib/workspace/title";

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
  try {
    await deleteProject(projectId, userId);
  } catch {
    const materials = await listMaterials(projectId).catch(() => []);
    await Promise.all(materials.map((item) => removeMaterial(item)));
  }
}

export async function startProjectFromPrompt(input: {
  userId: string;
  prompt: string;
  attachments?: PendingAttachment[];
  intent?: ComposerIntent;
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
  const prepared: PreparedMaterial[] = [];

  try {
    const materialIds: string[] = [];
    projectId = reserveProjectId();

    for (const attachment of attachments) {
      prepared.push(
        await prepareMaterialIngest({
          projectId,
          userId,
          source: attachmentSource(attachment),
        }),
      );
    }

    await createProject({
      id: projectId,
      title: PLACEHOLDER_CHAT_TITLE,
      userId,
      goal: DEFAULT_PROJECT_GOAL,
    });

    for (const item of prepared) {
      materialIds.push(await finalizeMaterialIngest(item));
    }

    stashPendingStart(projectId, {
      prompt,
      materialIds,
      intent,
    });

    return projectId;
  } catch (error) {
    if (projectId) {
      await discardFailedStart(projectId, userId);
    }
    await discardPreparedMaterials(prepared);
    throw error;
  }
}
