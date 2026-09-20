/** Turn leaked HTML (tables, br, i/b, lists) into markdown the renderer already understands. */

const TAG = /<\/?[a-zA-Z][a-zA-Z0-9]*\b[^>]*\/?>/g;

export function looksLikeHtml(source: string): boolean {
  return /<\/?[a-zA-Z][a-zA-Z0-9]*\b[^>]*>/.test(source);
}

export function decodeHtmlEntities(source: string): string {
  return source
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'");
}

function unwrap(tag: string, wrap: (inner: string) => string, source: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  return source.replace(re, (_, inner: string) => wrap(inner));
}

function repeat(source: string, fn: (value: string) => string, times = 6): string {
  let text = source;
  for (let i = 0; i < times; i += 1) {
    const next = fn(text);
    if (next === text) return next;
    text = next;
  }
  return text;
}

export function inlineHtmlToMarkdown(source: string): string {
  let text = source;
  text = text.replace(/<br\s*\/?>/gi, "<br>");
  text = repeat(text, (value) => unwrap("strong", (inner) => `**${inner}**`, value));
  text = repeat(text, (value) => unwrap("b", (inner) => `**${inner}**`, value));
  text = repeat(text, (value) => unwrap("em", (inner) => `*${inner}*`, value));
  text = repeat(text, (value) => unwrap("i", (inner) => `*${inner}*`, value));
  text = repeat(text, (value) => unwrap("mark", (inner) => `==${inner}==`, value));
  text = unwrap("u", (inner) => inner, text);
  text = unwrap("span", (inner) => inner, text);
  text = unwrap("sup", (inner) => inner, text);
  text = unwrap("sub", (inner) => inner, text);
  text = unwrap("a", (inner) => inner, text);
  text = text.replace(/<(?!br\b)\/?[a-zA-Z][a-zA-Z0-9]*\b[^>]*\/?>/gi, "");
  return decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
}

function cellMarkdown(html: string): string {
  return inlineHtmlToMarkdown(html)
    .replace(/\|/g, "\\|")
    .replace(/\s*<br>\s*/gi, "<br>")
    .trim();
}

function tableToMarkdown(html: string): string {
  const rows: string[][] = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr: RegExpExecArray | null;
  while ((tr = trRe.exec(html))) {
    const cells: string[] = [];
    const cellRe = /<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let cell: RegExpExecArray | null;
    while ((cell = cellRe.exec(tr[1]))) {
      cells.push(cellMarkdown(cell[2]));
    }
    if (cells.length) rows.push(cells);
  }
  if (!rows.length) return "";
  const cols = Math.max(...rows.map((row) => row.length), 1);
  const pad = (row: string[]) => Array.from({ length: cols }, (_, i) => row[i] ?? "");
  const line = (row: string[]) => `| ${pad(row).join(" | ")} |`;
  const sep = `| ${Array.from({ length: cols }, () => "---").join(" | ")} |`;
  return `\n\n${line(rows[0])}\n${sep}\n${rows.slice(1).map(line).join("\n")}\n\n`;
}

function listToMarkdown(html: string, ordered: boolean): string {
  const items: string[] = [];
  const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let item: RegExpExecArray | null;
  while ((item = liRe.exec(html))) {
    const line = htmlToMarkdown(item[1]).replace(/\n+/g, " ").trim();
    if (line) items.push(line);
  }
  if (!items.length) return "\n";
  return `\n\n${items.map((line, index) => (ordered ? `${index + 1}. ${line}` : `- ${line}`)).join("\n")}\n\n`;
}

function leftoverInline(source: string): string {
  let text = source.replace(/<br\s*\/?>/gi, "<br>");
  text = repeat(text, (value) => unwrap("strong", (inner) => `**${inner}**`, value));
  text = repeat(text, (value) => unwrap("b", (inner) => `**${inner}**`, value));
  text = repeat(text, (value) => unwrap("em", (inner) => `*${inner}*`, value));
  text = repeat(text, (value) => unwrap("i", (inner) => `*${inner}*`, value));
  text = repeat(text, (value) => unwrap("mark", (inner) => `==${inner}==`, value));
  text = unwrap("u", (inner) => inner, text);
  text = unwrap("span", (inner) => inner, text);
  text = unwrap("sup", (inner) => inner, text);
  text = unwrap("sub", (inner) => inner, text);
  text = unwrap("a", (inner) => inner, text);
  text = text.replace(/<(?!br\b)\/?[a-zA-Z][a-zA-Z0-9]*\b[^>]*\/?>/gi, "");
  return decodeHtmlEntities(text);
}

function blockHtmlToMarkdown(source: string): string {
  let text = source;
  text = text.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (table) => tableToMarkdown(table));
  text = text.replace(/<ul\b[^>]*>[\s\S]*?<\/ul>/gi, (list) => listToMarkdown(list, false));
  text = text.replace(/<ol\b[^>]*>[\s\S]*?<\/ol>/gi, (list) => listToMarkdown(list, true));
  text = text.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level: string, inner: string) => {
    return `\n\n${"#".repeat(Number(level))} ${inlineHtmlToMarkdown(inner)}\n\n`;
  });
  text = text.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner: string) => {
    const body = htmlToMarkdown(inner)
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    return `\n\n${body}\n\n`;
  });
  text = text.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_, inner: string) => `\n\n${htmlToMarkdown(inner).trim()}\n\n`);
  text = text.replace(/<div\b[^>]*>([\s\S]*?)<\/div>/gi, (_, inner: string) => `\n\n${htmlToMarkdown(inner).trim()}\n\n`);
  text = text.replace(/<hr\s*\/?>/gi, "\n\n---\n\n");
  return leftoverInline(text)
    .split("\n")
    .map((line) => (line.trim().startsWith("|") ? line : line.replace(/<br>/gi, "  \n")))
    .join("\n");
}

export function htmlToMarkdown(source: string): string {
  if (!source || !looksLikeHtml(source)) return source;
  const text = blockHtmlToMarkdown(source)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

/** Convert leftover inline tags so MixedText never prints raw HTML. */
export function scrubInlineHtml(source: string): string {
  if (!source || !looksLikeHtml(source)) return source;
  return inlineHtmlToMarkdown(source).replace(/<br>/g, "<br>");
}

export function stripHtmlTags(source: string): string {
  return decodeHtmlEntities(source.replace(TAG, "")).replace(/\s+/g, " ").trim();
}
