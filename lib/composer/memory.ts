import type { ChatArtifact, ChatMessage, ChatTurn } from "@/types/chat";

export function compactArtifactLine(artifact: ChatArtifact): string {
  const count = artifact.count ?? artifact.ids?.length;
  const title = artifact.title.replace(/"/g, "");
  const n = count != null ? ` (${count})` : "";
  const kind =
    artifact.kind === "path"
      ? "Path"
      : artifact.kind === "sheet"
        ? "Notes"
        : artifact.kind === "practice"
          ? artifact.mode === "exam"
            ? "Exam"
            : "Practice"
          : artifact.kind === "plan"
            ? "Plan"
            : "Card";
  return `${kind}: ${title}${n}`;
}

const ARTIFACT_MARKUP = /\[artifact\b[^\]]*\]/gi;

const TOOL_TAG =
  "chip_[a-z0-9_]+|tool_calls?|tool_code|tool_request|tool_response|function_calls?|function_call|function|invoke|tool";
const TOOL_OPEN = new RegExp(`<(${TOOL_TAG})\\b[^>]*>`, "i");
const TOOL_ANY = new RegExp(`</?(?:${TOOL_TAG})\\b[^>]*>`, "gi");
const TOOL_INCOMPLETE =
  /<(?:chip_[a-z0-9_]*|(?:tool_calls?|tool_code|tool_request|tool_response|function_calls?|function_call|function|invoke|tool)(?:\s[^>]*)?)$/i;
const TOOL_JSON =
  /\{\s*"(?:name|tool)"\s*:\s*"(?:suggest_|create_|edit_|append_|advance_|restart_|start_|search_|clarify|answer)[^"]*"(?:[^{}]|\{[^{}]*\})*\}/gi;
const TOOL_JSON_TAIL =
  /\n?\{\s*"(?:name|tool)"\s*:\s*"(?:suggest_|create_|edit_|append_|advance_|restart_|start_|search_|clarify|answer)[\s\S]*$/i;
const TOOL_FENCE = /```(?:tool|xml)\b[^\n]*\n?[\s\S]*?(?:```|$)/gi;
const TOOL_FENCE_JSON = /```json\b[^\n]*\n?[\s\S]*?(?:```|$)/gi;
const TOOL_SPECIAL = /<\|[^|>]*(?:tool|function)[^|>]*\|>/gi;
const TOOL_SPECIAL_TAIL = /<\|[^|>]*(?:tool|function)?[^|>]*$/i;
const BARE_CHIP = /^\s*chip_suggest_\w+\s*$/gim;

function looksLikeToolJson(block: string): boolean {
  TOOL_JSON.lastIndex = 0;
  return TOOL_JSON.test(block);
}

function dropUnclosedFence(text: string): string {
  const parts = text.split("```");
  if (parts.length % 2 === 0) {
    const tail = parts[parts.length - 1];
    if (/^(tool|json|xml)\b/i.test(tail) || !tail.includes("\n")) {
      return parts.slice(0, -1).join("```");
    }
  }
  return text;
}

/** Visible assistant prose only. Drops chip/tool tags, incomplete tags, and function-call dumps. */
export function stripArtifactMarkup(text: string): string {
  let out = text.replace(/\r\n/g, "\n");
  out = out.replace(TOOL_FENCE, "");
  out = out.replace(TOOL_FENCE_JSON, (block) => (looksLikeToolJson(block) ? "" : block));
  out = out.replace(TOOL_SPECIAL, "");
  out = out.replace(ARTIFACT_MARKUP, "");

  for (;;) {
    const match = out.match(TOOL_OPEN);
    if (!match || match.index == null) break;
    const name = match[1];
    const start = match.index;
    const after = start + match[0].length;
    const closer = new RegExp(`</${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*>`, "i");
    const rest = out.slice(after);
    const close = rest.search(closer);
    if (close < 0) {
      out = out.slice(0, start);
      break;
    }
    const end = after + close + (rest.match(closer)?.[0].length ?? 0);
    out = `${out.slice(0, start)}${out.slice(end)}`;
  }

  out = out.replace(TOOL_ANY, "");
  out = out.replace(TOOL_JSON, "");
  out = out.replace(TOOL_INCOMPLETE, "");
  out = out.replace(BARE_CHIP, "");
  out = out.replace(/\bchip_suggest_\w+\b/gi, "");
  out = out.replace(TOOL_SPECIAL_TAIL, "");
  out = out.replace(TOOL_JSON_TAIL, "");
  out = dropUnclosedFence(out);
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function historyTurnsFromMessages(messages: ChatMessage[]): ChatTurn[] {
  return messages
    .filter((item) => item.role === "user" || item.role === "assistant")
    .slice(-20)
    .map((item) => ({
      role: item.role as "user" | "assistant",
      content: item.artifact
        ? compactArtifactLine(item.artifact)
        : stripArtifactMarkup(item.content),
    }));
}

/** History is prior turns only. The in-flight prompt is sent separately. */
export function historyWithoutCurrentPrompt(history: ChatTurn[], prompt: string): ChatTurn[] {
  const last = history[history.length - 1];
  const current = prompt.trim();
  if (last?.role === "user" && last.content.trim() === current) {
    return history.slice(0, -1);
  }
  return history;
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
