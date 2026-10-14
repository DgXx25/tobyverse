/**
 * The numbered text form of an indexed source. One block per chunk, a one-line header, then text:
 *
 *   @@ c00012-0003 | p12-13 | 2.1 Supply and demand
 *   ...chunk text...
 *
 * The same shape is used for the retrieved context sent to the model (ids become S1, S2, ...),
 * so what the model reads is exactly what a human would read in the stored file.
 */

export type NumberedChunk = {
  id: string;
  page: number;
  pageEnd: number;
  section: string;
  text: string;
};

export function pageLabel(page: number, pageEnd: number): string {
  if (!page) return "";
  return pageEnd && pageEnd !== page ? `p${page}-${pageEnd}` : `p${page}`;
}

export function formatChunk(chunk: NumberedChunk, label = chunk.id): string {
  const fields = [label, pageLabel(chunk.page, chunk.pageEnd), chunk.section.replace(/\s*\|\s*/g, " / ").trim()].filter(Boolean);
  return `@@ ${fields.join(" | ")}\n${chunk.text.trim()}`;
}

export function formatChunks(chunks: NumberedChunk[]): string {
  return `${chunks.map((chunk) => formatChunk(chunk)).join("\n\n")}\n`;
}

export function parseChunks(text: string): NumberedChunk[] {
  const chunks: NumberedChunk[] = [];
  const blocks = text.split(/^@@ /m).slice(1);
  for (const block of blocks) {
    const newline = block.indexOf("\n");
    const header = (newline === -1 ? block : block.slice(0, newline)).trim();
    const body = newline === -1 ? "" : block.slice(newline + 1).trim();
    const [id, locator, ...rest] = header.split(" | ");
    let page = 0;
    let pageEnd = 0;
    let section = rest.join(" | ");
    const match = locator?.match(/^p(\d+)(?:-(\d+))?$/);
    if (match) {
      page = Number(match[1]);
      pageEnd = match[2] ? Number(match[2]) : page;
    } else if (locator) {
      section = [locator, ...rest].join(" | ");
    }
    if (id && body) chunks.push({ id: id.trim(), page, pageEnd, section, text: body });
  }
  return chunks;
}
