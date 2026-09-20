import type { ChatMessage } from "@/types/chat";

function normalizeCheck(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isCheckParagraph(text: string): boolean {
  const t = text.replace(/^#{1,6}\s+/, "").trim();
  if (!t || t.length > 280) return false;
  return /[?？]\s*$/.test(t);
}

/** Drop a trailing content-check from teaching so the exam can stand as its own message. */
export function stripTrailingCheck(text: string, question?: string, loose = false): string {
  let body = text.trim();
  const ask = question?.trim();
  if (!body) return "";
  if (!ask && !loose) return body;
  const askNorm = ask ? normalizeCheck(ask) : "";
  if (askNorm && normalizeCheck(body) === askNorm) return "";
  if (ask && body.endsWith(ask)) body = body.slice(0, -ask.length).trim();

  const blocks = body.split(/\n{2,}/);
  while (blocks.length > 1) {
    const last = blocks[blocks.length - 1]?.trim() ?? "";
    const lastNorm = normalizeCheck(last);
    const matchesAsk = Boolean(
      askNorm &&
        (lastNorm === askNorm ||
          last.endsWith(ask ?? "") ||
          (lastNorm.includes(askNorm) && askNorm.length >= 12) ||
          (askNorm.includes(lastNorm) && lastNorm.length >= 12)),
    );
    if (matchesAsk || isCheckParagraph(last)) {
      blocks.pop();
      continue;
    }
    break;
  }
  return blocks.join("\n\n").trim();
}

export function splitTeachingExam(
  text: string,
  question?: string,
): { taught: string; exam?: string } {
  const body = text.trim();
  if (!body) return { taught: "" };
  const ask = question?.trim();
  if (!ask) return { taught: body };
  const taught = stripTrailingCheck(body, ask, false);
  return { taught: taught || body, exam: ask };
}

export function latestOpenAsk(
  messages: Pick<ChatMessage, "id" | "role" | "content" | "promptAsk" | "artifact">[],
  stream?: { id: string; promptAsk?: ChatMessage["promptAsk"]; content?: string },
): { question: string; options?: string[]; messageId: string } | undefined {
  if (stream?.promptAsk?.question) {
    return { question: stream.promptAsk.question, options: stream.promptAsk.options, messageId: stream.id };
  }
  if (stream?.content) {
    const exam = splitTeachingExam(stream.content).exam;
    if (exam) return { question: exam, messageId: stream.id };
  }
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i];
    if (item.role === "user") return undefined;
    if (item.role !== "assistant") continue;
    if (item.artifact) continue;
    if (item.promptAsk?.question) {
      return { question: item.promptAsk.question, options: item.promptAsk.options, messageId: item.id };
    }
    const exam = splitTeachingExam(item.content).exam;
    if (exam) return { question: exam, options: item.promptAsk?.options, messageId: item.id };
  }
  return undefined;
}
