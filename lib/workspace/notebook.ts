import { loadSavedChatMode } from "@/lib/workspace/chat-mode";
import { projectHomePath } from "@/lib/workspace/routes";
import { markUntouchedNotebook } from "@/lib/workspace/draft-notebook";
import { createNotebookProject } from "@/lib/workspace/start-project";

/**
 * A new notebook exists the moment you ask for it: "Untitled notebook", empty, ready for sources.
 * The first real question renames it (see autoNameChat).
 */
export async function createNotebook(input: { folder?: string }): Promise<{ id: string; path: string }> {
  const id = await createNotebookProject({
    folder: input.folder,
    preferredChatMode: loadSavedChatMode(),
  });
  markUntouchedNotebook(id);
  return { id, path: projectHomePath(id) };
}
