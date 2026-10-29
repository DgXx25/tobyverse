export type WebSearchSource = {
  title: string;
  url: string;
  hostname: string;
};

export type WebSearchSourceSplit = {
  content: string;
  sources: WebSearchSource[];
};

export function extractWebSearchSources(text: string): WebSearchSourceSplit {
  const lines = text.split(/\r?\n/);
  let end = lines.length - 1;
  while (end >= 0 && !lines[end]?.trim()) end -= 1;
  const reverseSources: WebSearchSource[] = [];
  let index = end;

  while (index >= 0) {
    const line = lines[index]?.trim() ?? "";
    const match = line.match(/^[-*]\s+\[([^\]]+)\]\((https?:\/\/.*)\)$/i);
    if (!match) break;
    try {
      const url = new URL(match[2]);
      if (url.protocol !== "https:" && url.protocol !== "http:") break;
      reverseSources.push({ title: match[1].trim(), url: url.toString(), hostname: url.hostname.replace(/^www\./i, "") });
      index -= 1;
    } catch { break; }
  }

  if (!reverseSources.length || lines[index]?.trim().toLocaleLowerCase() !== "sources:") {
    return { content: text, sources: [] };
  }
  const content = lines.slice(0, index).join("\n").trimEnd();
  return { content, sources: reverseSources.reverse() };
}

export function webSourceInsertionIndex(segments: readonly { kind: string; blockType?: string }[]): number {
  const weatherIndex = segments.findIndex((segment) => segment.kind === "toby" && segment.blockType === "weather");
  const limit = weatherIndex >= 0 ? weatherIndex : segments.length;
  for (let index = limit - 1; index >= 0; index -= 1) {
    if (segments[index]?.kind === "md") return index;
  }
  return weatherIndex >= 0 ? weatherIndex - 1 : segments.length - 1;
}
