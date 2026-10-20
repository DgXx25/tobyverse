import { extractUrlText } from "@/lib/materials/url";
import { waitForChatStep } from "@/lib/ai/chat-deadline";

export type ChatLinkedPage = { url: string; title: string; text: string };

/** URLs supplied in this turn, never links rediscovered in old conversation history. */
export function currentChatUrls(prompt: string, attached: unknown = []): string[] {
  const candidates = [...(prompt.match(/https?:\/\/[^\s<>"`]+/gi) ?? []), ...(Array.isArray(attached) ? attached.slice(0, 8) : [])];
  const urls = new Set<string>();
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.length > 2048) continue;
    try {
      const url = new URL(candidate.replace(/[),.;!?]+$/g, ""));
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue;
      urls.add(url.href);
      if (urls.size === 2) break;
    } catch { /* Leave invalid links as ordinary prompt text. */ }
  }
  return [...urls];
}

/** Read-only extraction. No material document, Storage object, embedding or long-term cache. */
export async function readChatLinkedPages(prompt: string, attached: unknown, signal?: AbortSignal): Promise<ChatLinkedPage[]> {
  return Promise.all(currentChatUrls(prompt, attached).map(async (url) => {
    try {
      const page = await waitForChatStep("Reading linked page", () => extractUrlText(url), { signal, timeoutMs: 12_000 });
      return { url, title: page.title.slice(0, 180) || url, text: page.text.slice(0, 10_000) };
    } catch {
      signal?.throwIfAborted();
      return { url, title: url, text: "This linked page could not be read. Its contents are unavailable." };
    }
  }));
}
