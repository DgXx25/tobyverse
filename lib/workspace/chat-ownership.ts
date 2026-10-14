export type ChatDeletionScope = "thread" | "container";

/** Listed projects own materials; standalone chat containers own theirs. */
export function chatDeletionScope(project: { listed?: boolean }): ChatDeletionScope {
  return project.listed === true ? "thread" : "container";
}
