import { protectInlineMath, restoreInlineMath } from "./math";

/** Recover lost row breaks only when an explicit GFM delimiter row proves a table exists.
 * Call on unfenced text; ordinary pipes and inline code examples are left alone.
 */

function pipeOffsets(text: string, limit = Infinity): number[] {
  const offsets: number[] = [];
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "\\") {
      index++;
      continue;
    }
    if (text[index] === "|") {
      offsets.push(index);
      if (offsets.length === limit) break;
    }
  }
  return offsets;
}

function recoverHeadings(text: string): string {
  return text
    .replace(/([^\n])[ \t]+(#{1,6}[ \t]+)/g, "$1\n\n$2")
    .replace(/^(#{1,6}[ \t]+[^\n?？!]+[?？!])[ \t]+(.+)$/gm, "$1\n\n$2");
}

export function recoverCollapsedTableLine(line: string): string {
  if (line.includes("`")) return line;
  const protectedMath = protectInlineMath(line);
  const text = protectedMath.text;
  const delimiter = /\|[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)+\|/.exec(text);
  if (!delimiter || delimiter.index === 0) return line;
  const columns = (delimiter[0].match(/\|/g)?.length ?? 1) - 1;
  const before = text.slice(0, delimiter.index).trimEnd();
  const headerPipes = pipeOffsets(before).slice(-(columns + 1));
  if (headerPipes.length !== columns + 1 || headerPipes.at(-1) !== before.length - 1) return line;
  const start = headerPipes[0];
  const header = before.slice(start);
  const rows: string[] = [];
  let cursor = delimiter.index + delimiter[0].length;
  while (cursor < text.length) {
    const rest = text.slice(cursor);
    const leading = rest.match(/^[ \t]*/)?.[0].length ?? 0;
    if (rest[leading] !== "|") break;
    const pipes = pipeOffsets(rest.slice(leading), columns + 1);
    if (pipes.length < columns + 1) break;
    const end = leading + pipes[columns] + 1;
    rows.push(rest.slice(leading, end));
    cursor += end;
  }
  // A header/delimiter pair without a complete body could also be a quoted example.
  if (!rows.length) return line;
  const prefix = recoverHeadings(before.slice(0, start).trimEnd());
  const suffix = recoverHeadings(text.slice(cursor).trimStart());
  const recovered = [prefix, [header, delimiter[0], ...rows].join("\n"), suffix].filter(Boolean).join("\n\n");
  return restoreInlineMath(recovered, protectedMath.slots);
}
