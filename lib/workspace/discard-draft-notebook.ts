import { listChatMessages, listChatThreads } from "@/lib/chats";
import { deleteProject, getProjectById, rememberDiscardedProject } from "@/lib/projects";
import { listExercises } from "@/lib/exercises/store";
import { listMaterials } from "@/lib/materials/store";
import { listStudySheets } from "@/lib/study-sheets/store";
import { DEFAULT_CHAT_THREAD_ID } from "@/lib/core/constants";
import { clearUntouchedNotebook, isMarkedUntouchedNotebook, isUntouchedNotebook } from "@/lib/workspace/draft-notebook";

/** Delete a newly-created blank notebook after its owner leaves it. */
export async function discardUntouchedNotebook(projectId: string, userId: string): Promise<boolean> {
  if (!isMarkedUntouchedNotebook(projectId)) return false;

  try {
    const project = await getProjectById(projectId);
    if (!project || project.userId !== userId) {
      clearUntouchedNotebook(projectId);
      return false;
    }
    if (!isUntouchedNotebook(project)) {
      clearUntouchedNotebook(projectId);
      return false;
    }

    const [materials, sheets, exercises, threads] = await Promise.all([
      listMaterials(projectId),
      listStudySheets(projectId),
      listExercises(projectId),
      listChatThreads(projectId),
    ]);
    const threadIds = new Set([DEFAULT_CHAT_THREAD_ID, ...threads.map((thread) => thread.id)]);
    const messages = await Promise.all([...threadIds].map((threadId) => listChatMessages(projectId, threadId)));
    if (materials.length || sheets.length || exercises.length || messages.some((threadMessages) => threadMessages.length > 0)) {
      clearUntouchedNotebook(projectId);
      return false;
    }

    await deleteProject(projectId, userId);
    clearUntouchedNotebook(projectId);
    rememberDiscardedProject(projectId);
    return true;
  } catch {
    // Keep the marker so a later attempt can retry, and never discard when checks fail.
    return false;
  }
}
