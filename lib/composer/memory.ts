import type { ChatArtifact, ChatMessage, ChatTurn } from "@/types/chat";

export function compactArtifactLine(artifact: ChatArtifact): string {
  const count = artifact.count ?? artifact.ids?.length;
  const title = artifact.title.replace(/"/g, "");
  return `[artifact kind=${artifact.kind} id=${artifact.id}${count != null ? ` count=${count}` : ""} title="${title}"]`;
}

export function historyTurnsFromMessages(messages: ChatMessage[]): ChatTurn[] {
  return messages
    .filter((item) => item.role === "user" || item.role === "assistant")
    .slice(-20)
    .map((item) => ({
      role: item.role as "user" | "assistant",
      content: item.artifact ? compactArtifactLine(item.artifact) : item.content,
    }));
}

export function artifactFacts(messages: ChatMessage[]): ChatArtifact[] {
  const seen = new Set<string>();
  const facts: ChatArtifact[] = [];
  for (const message of messages) {
    if (!message.artifact) continue;
    const key = `${message.artifact.kind}:${message.artifact.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push(message.artifact);
  }
  return facts.slice(-8);
}

export function latestArtifact(messages: ChatMessage[]): ChatArtifact | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].artifact) return messages[i].artifact;
  }
  return null;
}
