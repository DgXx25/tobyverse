import { papersInText } from "@/lib/blocks/paper-thread";
import type { ChatMessage } from "@/types/chat";
import type { PaperPayload } from "@/types/exercise";

const paperCache = new WeakMap<ChatMessage, PaperPayload[]>();

/** The realtime query is a recent page, not a replacement for loaded history. */
export function mergeChatMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  const messages = [...byId.values()].sort((a, b) =>
    (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id),
  );
  return messages.length === current.length && messages.every((message, index) => message === current[index])
    ? current
    : messages;
}

/** One pass per history update; unchanged messages never have their fences reparsed. */
export function indexChatHistory(messages: ChatMessage[]) {
  const priorPapers = new Map<string, PaperPayload[]>();
  const byId = new Map<string, ChatMessage>();
  const indexById = new Map<string, number>();
  const papers: PaperPayload[] = [];
  let latestPaper: PaperPayload[] = [];
  let lastUserIndex = -1;
  let lastConversationIndex = -1;
  let lastAssistantId: string | undefined;
  let lastPathId: string | undefined;
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    byId.set(message.id, message);
    indexById.set(message.id, index);
    // Reuse blocks resolve only the latest prior paper; never copy every prefix.
    priorPapers.set(message.id, latestPaper);
    if (message.role === "user") lastUserIndex = index;
    if (message.role !== "system") lastConversationIndex = index;
    if (message.role !== "assistant") continue;
    lastAssistantId = message.id;
    if (message.artifact?.kind === "path") lastPathId = message.id;
    let found = paperCache.get(message);
    if (!found) {
      found = papersInText(message.content);
      paperCache.set(message, found);
    }
    if (found.length) {
      papers.push(...found);
      latestPaper = [found[found.length - 1]];
    }
  }
  return { byId, indexById, priorPapers, papers, lastUserIndex, lastConversationIndex, lastAssistantId, lastPathId };
}

export function chatMessageGap(message: ChatMessage, next?: ChatMessage): number {
  if (!next) return 0;
  return message.role === "user" ? 52 : next.role === "assistant" ? 20 : 28;
}

/** Only a starting estimate; ResizeObserver measures the actual rich content. */
export function estimateChatMessageHeight(message: ChatMessage): number {
  if (message.role === "user") return 60 + Math.min(100, Math.ceil(message.content.length / 55) * 26);
  return Math.min(1200, 80 + Math.ceil(message.content.length / 65) * 28);
}

export function chatVirtualizerOptions(messages: ChatMessage[], bottomInset: number, followOutput = false) {
  return {
    count: messages.length,
    getItemKey: (index: number) => messages[index].id,
    estimateSize: (index: number) => estimateChatMessageHeight(messages[index]) + chatMessageGap(messages[index], messages[index + 1]),
    overscan: 2,
    paddingStart: 32,
    paddingEnd: bottomInset,
    anchorTo: "end" as const,
    followOnAppend: followOutput,
    // Follow streamed growth only for conversations that were already pinned
    // when the user sent a prompt. A reader in older history keeps their view.
    scrollEndThreshold: followOutput ? 96 : -1,
    scrollPaddingEnd: bottomInset,
  };
}
