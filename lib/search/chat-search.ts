export type SearchMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string | null;
  images?: Array<{
    url: string;
    thumb?: string;
    thumbnail?: string;
    title?: string;
    alt?: string;
    kind?: "web" | "upload";
    storagePath?: string;
  }>;
};

export type SearchChat = {
  id: string;
  projectId: string;
  threadId: string;
  title: string;
  projectTitle?: string;
  updatedAt: string | null;
  href: string;
  messages: SearchMessage[];
};

export type ChatSearchResult = {
  chat: SearchChat;
  score: number;
  excerpt: string;
  matchedMessageId: string | null;
};

export type SearchMediaItem = {
  id: string;
  chatId: string;
  chatTitle: string;
  title: string;
  alt: string;
  context: string;
  src: string;
  thumb: string;
  createdAt: string | null;
  kind?: "web" | "upload";
  storagePath?: string;
};

const MARKS = /\p{M}+/gu;
const NON_WORDS = /[^\p{L}\p{N}]+/gu;

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(MARKS, "")
    .toLocaleLowerCase()
    .replace(NON_WORDS, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokensFor(query: string): string[] {
  return [...new Set(normalizeSearchText(query).split(" ").filter(Boolean))];
}

function recentFirst<T extends { updatedAt?: string | null; createdAt?: string | null }>(left: T, right: T): number {
  const a = left.updatedAt ?? left.createdAt ?? "";
  const b = right.updatedAt ?? right.createdAt ?? "";
  return b.localeCompare(a);
}

function includesAll(text: string, tokens: string[]): boolean {
  return tokens.every((token) => text.includes(token));
}

function fieldScore(text: string, phrase: string, tokens: string[], phraseWeight: number, tokenWeight: number): number {
  if (!text) return 0;
  let score = phrase && text.includes(phrase) ? phraseWeight : 0;
  for (const token of tokens) {
    if (text.includes(token)) score += tokenWeight;
  }
  return score;
}

function excerptFor(content: string, tokens: string[]): string {
  const clean = content.replace(/\s+/g, " ").trim();
  if (clean.length <= 190) return clean;
  const lower = clean.toLocaleLowerCase();
  const hit = tokens.map((token) => lower.indexOf(token)).find((index) => index >= 0) ?? 0;
  const start = Math.max(0, hit - 62);
  const end = Math.min(clean.length, start + 190);
  return `${start > 0 ? "…" : ""}${clean.slice(start, end).trim()}${end < clean.length ? "…" : ""}`;
}

export function searchChats(chats: SearchChat[], query: string): ChatSearchResult[] {
  const phrase = normalizeSearchText(query);
  const tokens = tokensFor(query);
  if (tokens.length === 0) {
    return [...chats]
      .sort(recentFirst)
      .map((chat) => ({ chat, score: 0, excerpt: "", matchedMessageId: null }));
  }

  return chats
    .flatMap((chat) => {
      const title = normalizeSearchText(chat.title);
      const projectTitle = normalizeSearchText(chat.projectTitle ?? "");
      const normalizedMessages = chat.messages.map((message) => ({
        message,
        text: normalizeSearchText(message.content),
      }));
      const allText = [title, projectTitle, ...normalizedMessages.map((item) => item.text)].join(" ");
      if (!includesAll(allText, tokens)) return [];

      let score = fieldScore(title, phrase, tokens, 600, 140);
      score += fieldScore(projectTitle, phrase, tokens, 260, 60);

      let bestMessage: (typeof normalizedMessages)[number] | null = null;
      let bestMessageScore = 0;
      let matchingMessages = 0;
      for (const item of normalizedMessages) {
        const next = fieldScore(item.text, phrase, tokens, 180, 40);
        if (next > 0) matchingMessages += 1;
        if (next > bestMessageScore) {
          bestMessage = item;
          bestMessageScore = next;
        }
      }
      score += bestMessageScore + Math.min(Math.max(0, matchingMessages - 1), 5) * 8;

      return [{
        chat,
        score,
        excerpt: bestMessage ? excerptFor(bestMessage.message.content, tokens) : "",
        matchedMessageId: bestMessage?.message.id ?? null,
      }];
    })
    .sort((left, right) => right.score - left.score || recentFirst(left.chat, right.chat));
}

export function searchMedia(items: SearchMediaItem[], query: string): SearchMediaItem[] {
  const phrase = normalizeSearchText(query);
  const tokens = tokensFor(query);
  if (tokens.length === 0) return [...items].sort(recentFirst);

  return items
    .flatMap((item) => {
      const title = normalizeSearchText(item.title);
      const alt = normalizeSearchText(item.alt);
      const chatTitle = normalizeSearchText(item.chatTitle);
      const context = normalizeSearchText(item.context);
      const allText = [title, alt, chatTitle, context].join(" ");
      if (!includesAll(allText, tokens)) return [];
      const score =
        fieldScore(title, phrase, tokens, 400, 100) +
        fieldScore(alt, phrase, tokens, 320, 80) +
        fieldScore(chatTitle, phrase, tokens, 180, 45) +
        fieldScore(context, phrase, tokens, 140, 35);
      return [{ item, score }];
    })
    .sort((left, right) => right.score - left.score || recentFirst(left.item, right.item))
    .map(({ item }) => item);
}

export function collectChatMedia(chats: SearchChat[]): SearchMediaItem[] {
  const items: SearchMediaItem[] = [];

  for (const chat of chats) {
    for (const message of chat.messages) {
      for (const [index, image] of (message.images ?? []).entries()) {
        const src = image.url?.trim();
        if (!src) continue;
        const title = image.title?.trim() || image.alt?.trim() || "Image";
        items.push({
          id: `${chat.id}:${message.id}:${index}`,
          chatId: chat.id,
          chatTitle: chat.title,
          title,
          alt: image.alt?.trim() || title,
          context: message.content,
          src,
          thumb: image.thumb?.trim() || image.thumbnail?.trim() || src,
          createdAt: message.createdAt,
          kind: image.kind,
          storagePath: image.storagePath?.trim() || undefined,
        });
      }
    }
  }

  return items.sort(recentFirst);
}

export type ChatSearchGroup = {
  label: "Today" | "Yesterday" | "Last 7 Days" | "Older";
  results: ChatSearchResult[];
};

export function searchDeletionScope(input: {
  isDefaultThread: boolean;
  projectListed: boolean;
}): "container" | "thread" {
  return input.isDefaultThread && !input.projectListed ? "container" : "thread";
}

export function shouldLeaveDeletedSearchRoute(input: {
  deletesContainer: boolean;
  activeProjectId: string | null;
  deletedProjectId: string;
  activeHref: string;
  deletedHref: string;
}): boolean {
  return input.deletesContainer
    ? input.activeProjectId === input.deletedProjectId
    : input.activeHref === input.deletedHref;
}

function dayDistance(value: string | null, now: Date): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const thatDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.floor((today - thatDay) / 86_400_000);
}

export function groupChatResultsByDate(results: ChatSearchResult[], now = new Date()): ChatSearchGroup[] {
  const groups: ChatSearchGroup[] = [
    { label: "Today", results: [] },
    { label: "Yesterday", results: [] },
    { label: "Last 7 Days", results: [] },
    { label: "Older", results: [] },
  ];
  for (const result of results) {
    const days = dayDistance(result.chat.updatedAt, now);
    const index = days <= 0 ? 0 : days === 1 ? 1 : days < 7 ? 2 : 3;
    groups[index].results.push(result);
  }
  return groups.filter((group) => group.results.length > 0);
}

export function formatSearchAge(value: string | null, now = new Date()): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const days = dayDistance(value, now);
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return `${days} days ago`;
  if (days >= 7) {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
  }
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}
