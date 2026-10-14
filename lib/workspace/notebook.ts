import { createProject, reserveProjectId } from "@/lib/projects";
import { loadSavedChatMode } from "@/lib/workspace/chat-mode";
import { UNTITLED_NOTEBOOK_TITLE } from "@/lib/workspace/title";
import { projectHomePath } from "@/lib/workspace/routes";

/**
 * A new notebook exists the moment you ask for it: "Untitled notebook", empty, ready for sources.
 * The first real question renames it (see autoNameChat).
 */
export async function createNotebook(input: { userId: string; folder?: string }): Promise<{ id: string; path: string }> {
  const id = reserveProjectId();
  await createProject({
    id,
    userId: input.userId,
    title: UNTITLED_NOTEBOOK_TITLE,
    preferredChatMode: loadSavedChatMode(),
    folder: input.folder,
    createThread: true,
  });
  return { id, path: projectHomePath(id) };
}
