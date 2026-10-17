import { protectInlineMath, restoreInlineMath, scrubLeakedMarkup } from "./math";
import { recoverCollapsedTableLine } from "./collapsed-markdown";

/** Make GFM tables parse even when the model skips pipes or the separator row. */

function isFence(line: string): boolean {
  return /^(```|'''|""")/.test(line.trimStart());
}

function looksLikeRow(line: string): boolean {
  const text = line.trim();
  if (!text || isFence(text)) return false;
  if (/^#{1,6}\s/.test(text) || /^[-*+]\s/.test(text) || /^\d+[.)]\s/.test(text) || /^>/.test(text)) {
    return false;
  }
  const pipes = (text.match(/\|/g) || []).length;
  if (pipes >= 2) return true;
  if (pipes === 1 && /[^|\s].*\|.*[^|\s]/.test(text)) return true;
  return false;
}

function isSeparator(line: string): boolean {
  const text = line.replace(/\|/g, "").trim();
  return text.length > 0 && /^[\s:|-]+$/.test(line) && /---/.test(line.replace(/\s/g, ""));
}

function cellCount(line: string): number {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").length;
}

function withPipes(line: string): string {
  const text = line.trim();
  if (text.startsWith("|") && text.endsWith("|")) return text;
  if (text.startsWith("|")) return `${text} |`;
  if (text.endsWith("|")) return `| ${text}`;
  return `| ${text} |`;
}

function separatorFor(columns: number): string {
  return `| ${Array.from({ length: Math.max(2, columns) }, () => "---").join(" | ")} |`;
}

export function splitMarkdownTables(source: string): Array<{ kind: "md"; text: string } | { kind: "table"; headers: string[]; rows: string[][] }> {
  const protectedMath = protectInlineMath(source);
  const lines = protectedMath.text.replace(/\r\n/g, "\n").split("\n");
  const restore = (value: string) => restoreInlineMath(value, protectedMath.slots);
  const parts: Array<{ kind: "md"; text: string } | { kind: "table"; headers: string[]; rows: string[][] }> = [];
  let md: string[] = [];
  let i = 0;

  const flushMd = () => {
    const text = restore(md.join("\n"));
    md = [];
    if (text.trim()) parts.push({ kind: "md", text });
  };

  while (i < lines.length) {
    if (!looksLikeRow(lines[i])) {
      md.push(lines[i]);
      i += 1;
      continue;
    }
    const start = i;
    const taken = readTableBlock(lines, i);
    i = taken.next;
    const parsed = asTable(taken.block);
    if (parsed) {
      flushMd();
      const repaired = repairTable(parsed.headers, parsed.rows);
      parts.push({
        kind: "table",
        headers: repaired.headers.map(restore),
        rows: repaired.rows.map((row) => row.map(restore)),
      });
    } else {
      md.push(...lines.slice(start, i));
    }
  }
  flushMd();
  return parts.length ? parts : [{ kind: "md", text: source }];
}

function asTable(block: string[]): { headers: string[]; rows: string[][] } | null {
  if (block.length < 2) return null;
  const rows = block.filter((line) => !isSeparator(line)).map(splitCells);
  if (rows.length < 2) return null;
  const headers = rows[0];
  if (headers.length < 2) return null;
  const cols = headers.length;
  const body = rows.slice(1).map((row) => {
    const next = row.slice(0, cols);
    while (next.length < cols) next.push("");
    return next;
  });
  if (body.length === 0) return null;
  return { headers, rows: body };
}

function trimCell(value: string): string {
  const end = value.replace(/\s+$/, "");
  if (/^ {2,}/.test(end) || /^\t/.test(end)) return end;
  return end.trim();
}

function splitCells(line: string): string[] {
  const protectedMath = protectInlineMath(line);
  const trimmed = protectedMath.text.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed[i] === "\\" && trimmed[i + 1] === "|") {
      cur += "|";
      i += 1;
      continue;
    }
    if (trimmed[i] === "|") {
      cells.push(restoreInlineMath(trimCell(cur), protectedMath.slots));
      cur = "";
      continue;
    }
    cur += trimmed[i];
  }
  cells.push(restoreInlineMath(trimCell(cur), protectedMath.slots));
  return cells;
}

const CODE_SLOT_START = "\uE010";
const CODE_SLOT_SEP = "\uE011";
const CODE_SLOT_END = "\uE012";

export type TableCellPart = { kind: "text"; text: string } | { kind: "code"; lang: string; text: string };

function decodePayload(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function sealTableCode(lang: string, code: string): string {
  return `${CODE_SLOT_START}${lang}${CODE_SLOT_SEP}${encodeURIComponent(code)}${CODE_SLOT_END}`;
}

function joinCell(a: string, b: string): string {
  if (!b.trim()) return a;
  if (!a.trim()) return b;
  return `${a}<br>${b}`;
}

function padRow(row: string[], cols: number): string[] {
  const next = row.slice(0, cols);
  while (next.length < cols) next.push("");
  return next;
}

function escapeCell(cell: string): string {
  const protectedMath = protectInlineMath(cell);
  return restoreInlineMath(protectedMath.text.replace(/\|/g, "\\|"), protectedMath.slots);
}

function emitRow(cells: string[]): string {
  return `| ${cells.map(escapeCell).join(" | ")} |`;
}

function cellFenceOpen(cell: string): boolean {
  const odd = (pattern: RegExp) => ((cell.match(pattern) || []).length % 2) === 1;
  return odd(/```/g) || odd(/'''/g) || odd(/"""/g);
}

function openFenceCol(row: string[]): number {
  for (let col = 0; col < row.length; col += 1) {
    if (cellFenceOpen(row[col] ?? "")) return col;
  }
  return -1;
}

function looksLikeCodeLine(line: string): boolean {
  const raw = line.replace(/<br\s*\/?>/gi, "");
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (/^(```|'''|""")/.test(trimmed) || /```|'''|"""/.test(trimmed)) return true;
  if (/^\s*\$.*\$\s*$/.test(trimmed) && !/[=(){};]/.test(trimmed)) return false;
  if (
    /^(for|if|elif|else|while|def|class|return|print|const|let|var|function|import|from|export|async|await|switch|case|try|catch|finally|with|yield|pass|break|continue)\b/.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (/[{};]|=>|::/.test(trimmed)) return true;
  if (/:\s*$/.test(trimmed) && /\S/.test(trimmed)) return true;
  if (/^[A-Za-z_]\w*\s*=/.test(trimmed)) return true;
  if (/^\s{2,}/.test(raw) && /[()[\]=]/.test(trimmed)) return true;
  if (/[\u10A0-\u10FF]/.test(trimmed)) return false;
  return false;
}

function filledCols(row: string[]): number[] {
  return row.map((cell, index) => (cell.trim() ? index : -1)).filter((index) => index >= 0);
}

function isSparseRow(row: string[], cols: number, openCol?: number): boolean {
  const padded = padRow(row, cols);
  const filled = filledCols(padded);
  if (filled.length === 0) return true;
  if (filled.length > 1) return false;
  const col = filled[0];
  if (openCol == null) return true;
  return col === openCol || col === cols - 1;
}

function canAbsorbFenceLine(line: string): boolean {
  const text = line.trim();
  if (!text) return true;
  if (text.startsWith("```") || text.startsWith("'''") || text.startsWith('"""')) return true;
  if (looksLikeRow(line)) {
    const cells = splitCells(withPipes(line));
    return isSparseRow(cells, Math.max(cells.length, 2));
  }
  if (/^#{1,6}\s/.test(text) || /^[-*+]\s/.test(text) || /^\d+[.)]\s/.test(text) || /^>/.test(text)) return false;
  if (looksLikeCodeLine(line) || /^\s+/.test(line)) return true;
  return !text.includes("|") && text.length < 80;
}

function blockHasOpenFence(block: string[]): boolean {
  if (!block.length) return false;
  return openFenceCol(splitCells(block[block.length - 1] ?? "")) >= 0;
}

function appendFenceLine(block: string[], line: string): void {
  const cells = splitCells(block[block.length - 1] ?? "");
  const col = openFenceCol(cells);
  if (col < 0) return;
  const piece = looksLikeRow(line)
    ? (splitCells(withPipes(line)).find((cell) => cell.trim()) ?? line.trim())
    : line.replace(/^\s*\|\s*|\s*\|\s*$/g, "");
  cells[col] = joinCell(cells[col] ?? "", piece);
  block[block.length - 1] = emitRow(cells);
}

function isTrailingCellGloss(line: string): boolean {
  const text = line.trim().replace(/\|\s*$/, "").trim();
  if (!text || looksLikeRow(line)) return false;
  if (/^(```|'''|""")/.test(text) || /^#{1,6}\s/.test(text) || /^[-*+]\s/.test(text)) return false;
  if (looksLikeCodeLine(text) && !/[\u10A0-\u10FF]/.test(text)) return false;
  return text.length < 80;
}

function appendToLastContentCell(block: string[], line: string): void {
  const cells = splitCells(block[block.length - 1] ?? "");
  if (!cells.length) return;
  let col = cells.length - 1;
  while (col > 0 && !(cells[col] ?? "").trim()) col -= 1;
  const piece = line.replace(/^\s*\|\s*|\s*\|\s*$/g, "").trim();
  cells[col] = joinCell(cells[col] ?? "", piece);
  block[block.length - 1] = emitRow(cells);
}

function readTableBlock(lines: string[], start: number): { next: number; block: string[] } {
  const block: string[] = [];
  let i = start;
  while (i < lines.length && looksLikeRow(lines[i] ?? "")) {
    block.push(withPipes(lines[i] ?? ""));
    i += 1;
  }
  let pulledFence = false;
  while (i < lines.length && blockHasOpenFence(block) && canAbsorbFenceLine(lines[i] ?? "")) {
    appendFenceLine(block, lines[i] ?? "");
    pulledFence = true;
    i += 1;
  }
  if (pulledFence && i < lines.length && !blockHasOpenFence(block) && isTrailingCellGloss(lines[i] ?? "")) {
    appendToLastContentCell(block, lines[i] ?? "");
    i += 1;
  }
  return { next: i, block };
}

function isGlossContinuation(row: string[], cols: number, col: number): boolean {
  const padded = padRow(row, cols);
  const filled = filledCols(padded);
  if (filled.length !== 1) return false;
  if (filled[0] !== col && filled[0] !== cols - 1) return false;
  const text = padded[filled[0]] ?? "";
  if (/```|'''|"""/.test(text)) return false;
  if (looksLikeCodeLine(text) && !/[\u10A0-\u10FF]/.test(text)) return false;
  return true;
}

function mergeCodeContinuationRows(headers: string[], rows: string[][]): string[][] {
  const cols = headers.length;
  const out: string[][] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = padRow(rows[i] ?? [], cols);
    let open = openFenceCol(row);
    if (open < 0) {
      out.push(row);
      continue;
    }
    while (i + 1 < rows.length && isSparseRow(rows[i + 1] ?? [], cols, open)) {
      i += 1;
      const next = padRow(rows[i] ?? [], cols);
      const piece = (next[open] ?? "").trim() ? next[open] ?? "" : next.find((cell) => cell.trim()) ?? "";
      row[open] = joinCell(row[open] ?? "", piece);
      open = openFenceCol(row);
      if (open < 0) break;
    }
    const filled = filledCols(row);
    const glossCol = openFenceCol(row) < 0 ? Math.max(0, filled[filled.length - 1] ?? cols - 1) : open;
    while (openFenceCol(row) < 0 && i + 1 < rows.length && isGlossContinuation(rows[i + 1] ?? [], cols, glossCol)) {
      i += 1;
      const next = padRow(rows[i] ?? [], cols);
      const piece = (next[glossCol] ?? "").trim() ? next[glossCol] ?? "" : next.find((cell) => cell.trim()) ?? "";
      row[glossCol] = joinCell(row[glossCol] ?? "", piece);
    }
    out.push(row);
  }
  return out;
}

function tidyCode(body: string): string {
  let text = body.replace(/\r\n/g, "\n").replace(/<br\s*\/?>/gi, "\n");
  if (text.startsWith("\n")) text = text.slice(1);
  if (text.endsWith("\n")) text = text.slice(0, -1);
  return text;
}

function sealCellFences(cell: string): string {
  return cell.replace(/(```|'''|""")([\w-]*)[ \t]*(?:\r?\n|<br\s*\/?>)?([\s\S]*?)\1/g, (all, fence: string, lang: string, body: string) => {
    const name = String(lang || "").trim().toLowerCase();
    if (fence === "```" && (name === "toby" || name.startsWith("toby-"))) return all;
    return sealTableCode(name, tidyCode(String(body || "")));
  });
}

function unwrapFenceLines(lines: string[]): { lang: string; code: string; rest: string[] } | null {
  const first = lines[0]?.trim().match(/^(```|'''|""")([\w-]*)$/);
  if (!first) return null;
  const mark = first[1] ?? "```";
  const close = lines.findIndex((line, index) => index > 0 && line.trim() === mark);
  if (close < 0) return null;
  return {
    lang: (first[2] ?? "").trim().toLowerCase(),
    code: lines.slice(1, close).join("\n"),
    rest: lines.slice(close + 1),
  };
}

function splitBareCode(text: string): TableCellPart[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  while (lines.length && !lines[0]?.trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1]?.trim()) lines.pop();
  if (lines.length === 0) return [];
  const wrapped = unwrapFenceLines(lines);
  if (wrapped) {
    const parts: TableCellPart[] = [{ kind: "code", lang: wrapped.lang, text: wrapped.code }];
    if (wrapped.rest.some((line) => line.trim())) parts.push(...splitBareCode(wrapped.rest.join("\n")));
    return parts;
  }
  const parts: TableCellPart[] = [];
  let i = 0;
  let buf: string[] = [];
  const flushText = () => {
    if (!buf.length) return;
    parts.push({ kind: "text", text: buf.join("<br>") });
    buf = [];
  };
  while (i < lines.length) {
    if (looksLikeCodeLine(lines[i] ?? "")) {
      let j = i;
      while (j < lines.length && looksLikeCodeLine(lines[j] ?? "")) j += 1;
      if (j - i >= 2) {
        flushText();
        parts.push({ kind: "code", lang: "", text: lines.slice(i, j).join("\n") });
        i = j;
        continue;
      }
    }
    buf.push(lines[i] ?? "");
    i += 1;
  }
  flushText();
  return parts;
}

function splitFencedAndBare(chunk: string): TableCellPart[] {
  const source = chunk.replace(/<br\s*\/?>/gi, "\n");
  if (!source.trim()) return [];
  const parts: TableCellPart[] = [];
  const fenceRe = /(```|'''|""")([\w-]*)[ \t]*\r?\n?([\s\S]*?)\1/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(source))) {
    const before = source.slice(last, match.index);
    if (before.trim()) parts.push(...splitBareCode(before));
    const name = (match[2] ?? "").trim().toLowerCase();
    const fence = match[1] ?? "```";
    if (fence === "```" && (name === "toby" || name.startsWith("toby-"))) {
      parts.push({ kind: "text", text: match[0].replace(/\n/g, "<br>") });
    } else {
      parts.push({ kind: "code", lang: name, text: tidyCode(match[3] ?? "") });
    }
    last = match.index + match[0].length;
  }
  const after = source.slice(last);
  if (after.trim()) parts.push(...splitBareCode(after));
  return parts;
}

export function splitTableCellContent(cell: string): TableCellPart[] {
  const parts: TableCellPart[] = [];
  const slotRe = new RegExp(`${CODE_SLOT_START}([^${CODE_SLOT_SEP}]*)${CODE_SLOT_SEP}([^${CODE_SLOT_END}]*)${CODE_SLOT_END}`, "g");
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = slotRe.exec(cell))) {
    const before = cell.slice(last, match.index);
    if (before.trim()) parts.push(...splitFencedAndBare(before));
    parts.push({
      kind: "code",
      lang: String(match[1] || "").trim().toLowerCase(),
      text: decodePayload(match[2] ?? ""),
    });
    last = match.index + match[0].length;
  }
  const after = cell.slice(last);
  if (after.trim()) parts.push(...splitFencedAndBare(after));
  if (parts.length) return parts;
  return cell.trim() ? [{ kind: "text", text: cell }] : [{ kind: "text", text: "" }];
}

export function tableCellHasCode(cell: string): boolean {
  return splitTableCellContent(cell).some((part) => part.kind === "code");
}

function repairTable(headers: string[], rows: string[][]): { headers: string[]; rows: string[][] } {
  return {
    headers: headers.map(sealCellFences),
    rows: mergeCodeContinuationRows(headers, rows).map((row) => row.map(sealCellFences)),
  };
}

/** Keep in-cell fences out of the global ``` splitter so a table example stays a table cell. */
export function prepareChatMarkdown(source: string): string {
  let fence: { marker: string; length: number } | undefined;
  const lines = source.replace(/\r\n/g, "\n").split("\n").flatMap((line) => {
    const mark = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (mark) {
      if (!fence && !mark[2].includes(mark[1])) fence = { marker: mark[1][0], length: mark[1].length };
      else if (fence && mark[1][0] === fence.marker && mark[1].length >= fence.length && !mark[2].trim()) fence = undefined;
      return [line];
    }
    return fence ? [line] : recoverCollapsedTableLine(line).split("\n");
  });
  const out: string[] = [];
  let i = 0;
  fence = undefined;
  while (i < lines.length) {
    const mark = lines[i].match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (mark) {
      if (!fence && !mark[2].includes(mark[1])) fence = { marker: mark[1][0], length: mark[1].length };
      else if (fence && mark[1][0] === fence.marker && mark[1].length >= fence.length && !mark[2].trim()) fence = undefined;
      out.push(lines[i]);
      i += 1;
      continue;
    }
    if (fence) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    if (!looksLikeRow(lines[i] ?? "")) {
      out.push(lines[i] ?? "");
      i += 1;
      continue;
    }
    const taken = readTableBlock(lines, i);
    const parsed = asTable(taken.block);
    if (parsed) {
      const repaired = repairTable(parsed.headers, parsed.rows);
      if (out.length && out[out.length - 1]?.trim() !== "") out.push("");
      out.push(emitRow(repaired.headers));
      out.push(separatorFor(repaired.headers.length));
      for (const row of repaired.rows) out.push(emitRow(row));
      if (taken.next < lines.length && (lines[taken.next] ?? "").trim() !== "") out.push("");
    } else {
      out.push(...lines.slice(i, taken.next));
    }
    i = taken.next;
  }
  return out.join("\n");
}

const CELL_SLOT_TOKEN = /\uE020(\d+)\uE021/g;

export function splitTableCellLines(cell: string): string[] {
  const slots: string[] = [];
  const protectedText = scrubLeakedMarkup(cell).replace(
    /==((?:(?!==)[\s\S])*?)==|\$((?:\\.|[^$\n])+?)\$/g,
    (all) => {
      const index = slots.length;
      slots.push(all);
      return `\uE020${index}\uE021`;
    },
  );
  return protectedText
    .split(/<br\s*\/?>|\n/i)
    .map((line) => {
      CELL_SLOT_TOKEN.lastIndex = 0;
      return line.replace(CELL_SLOT_TOKEN, (_, index: string) => slots[Number(index)] ?? "").trim();
    })
    .filter(Boolean);
}

/** Split a trailing `(gloss)` onto its own line. Short form notes like `(Ving)` stay. */
export function peelCellGloss(text: string): string[] {
  if (tableCellHasCode(text)) return [text];
  const lines = splitTableCellLines(text);
  if (lines.length === 0) return [""];
  if (lines.length > 1) return lines;
  const one = lines[0];
  const wrapped = one.match(/^(.*?)\s*\(([^)]{10,})\)\s*$/);
  if (!wrapped) return [one];
  const head = wrapped[1].trim();
  const inner = wrapped[2].trim();
  if (!head || !inner) return [one];
  if (/\$/.test(inner) || /\\[a-zA-Z]/.test(inner)) return [one];
  if (/^[a-z]+(?:\/[a-z]+)?$/i.test(inner)) return [one];
  return [head, inner];
}

function looksLikeCaption(text: string): boolean {
  if (!text) return false;
  if (/[\u10A0-\u10FF]/.test(text)) return true;
  if (/[=+\-*/\\]/.test(text)) return false;
  return text.length < 80;
}

function unwrapParenLine(text: string): string {
  const t = text.trim();
  const match = t.match(/^\((.*)\)$/);
  if (!match) return t;
  const inner = match[1].trim();
  if (!inner || /\$/.test(inner)) return t;
  return inner;
}

function isProseCell(text: string): boolean {
  if (tableCellHasCode(text)) return true;
  const plain = text.replace(/\$[^$]+\$/g, " ").replace(/\s+/g, " ").trim();
  if (plain.length >= 28) return true;
  return (plain.match(/\s/g) || []).length >= 3;
}

/** Turn `$y$ name` or `$y$<br>name` into stacked lines. Latex with `|` stays one line. */
export function stackTableCell(cell: string): string[] {
  const text = scrubLeakedMarkup(cell);
  if (tableCellHasCode(text)) return [text];
  const lines = splitTableCellLines(text);
  if (lines.length > 1 && lines.filter((line) => isProseCell(line)).length >= 2) {
    return [text];
  }
  const source = lines.length > 1 ? lines : (() => {
    const line = lines[0] ?? text.trim();
    const match = line.match(/^(\$[^$\n]+\$|\\\([^)\n]+\\\))\s+(.+)$/);
    if (match?.[1] && match[2] && looksLikeCaption(match[2])) return [match[1], match[2]];
    return line ? [line] : [""];
  })();
  return source.map(unwrapParenLine);
}

export type ChatTableCellView = {
  text: string;
  rowSpan: number;
  colSpan?: number;
  className: string;
  header?: boolean;
  pair?: boolean;
};

export type ChatTableView = {
  compact: boolean[];
  headers: ChatTableCellView[];
  body: Array<Array<ChatTableCellView | null>>;
};

function headerRole(text: string): "form" | "use" | "example" | "" {
  const t = unwrapParenLine(stackTableCell(text).join(" ")).replace(/\s+/g, " ").trim().toLowerCase();
  if (!t) return "";
  if (/ფორმატ|^form$|^format$|pattern|structure|წყობა|^ფორმა$/.test(t)) return "form";
  if (/გამოყენ|^use$|^usage$|^when$|meaning|მნიშვნელ/.test(t)) return "use";
  if (/მაგალით|^examples?$|^sample$/.test(t)) return "example";
  return "";
}

/** Form / use / example (1 row): form spans the top, the other two sit side by side. */
function isFormCardTable(headers: string[], rows: string[][]): boolean {
  if (headers.length !== 3 || rows.length !== 1) return false;
  const roles = headers.map(headerRole);
  if (roles.filter((role) => role === "form").length !== 1) return false;
  return roles.includes("use") || roles.includes("example");
}

function layoutFormCard(headers: string[], rows: string[][]): ChatTableView {
  const roles = headers.map(headerRole);
  const formCol = Math.max(0, roles.indexOf("form"));
  const rest = [0, 1, 2].filter((col) => col !== formCol);
  const useCol = roles.indexOf("use");
  const exampleCol = roles.indexOf("example");
  const leftCol = useCol >= 0 ? useCol : rest[0] ?? 1;
  const rightCol = exampleCol >= 0 && exampleCol !== leftCol ? exampleCol : rest.find((col) => col !== leftCol) ?? 2;
  const row = rows[0] ?? ["", "", ""];
  const formValue = (row[formCol] ?? "").trim();
  const leftValue = (row[leftCol] ?? "").trim();
  const rightValue = (row[rightCol] ?? "").trim();
  const leftLines = peelCellGloss(leftValue);
  const rightLines = peelCellGloss(rightValue);
  const leftText = leftLines.join("<br>");
  const rightText = rightLines.join("<br>");

  return {
    compact: [false, false],
    headers: [
      {
        text: unwrapParenLine(stackTableCell(headers[formCol] ?? "").join(" ")),
        rowSpan: 1,
        colSpan: 2,
        className: cellClass({ prose: false, compact: false, corners: ["tl", "tr"] }),
        header: true,
      },
    ],
    body: [
      [
        {
          text: formValue,
          rowSpan: 1,
          colSpan: 2,
          className: `${cellViewClass(formValue, { prose: isProseCell(formValue), compact: false, corners: [] })} chat-table-form`,
        },
      ],
      [
        {
          text: unwrapParenLine(stackTableCell(headers[leftCol] ?? "").join(" ")),
          rowSpan: 1,
          className: cellClass({ prose: false, compact: false, corners: [] }),
          header: true,
        },
        {
          text: unwrapParenLine(stackTableCell(headers[rightCol] ?? "").join(" ")),
          rowSpan: 1,
          className: cellClass({ prose: false, compact: false, corners: [] }),
          header: true,
        },
      ],
      [
        {
          text: leftText,
          rowSpan: 1,
          pair: true,
          className: cellViewClass(leftText, {
            prose: leftLines.some(isProseCell),
            compact: false,
            corners: ["bl"],
          }),
        },
        {
          text: rightText,
          rowSpan: 1,
          pair: true,
          className: cellViewClass(rightText, {
            prose: rightLines.some(isProseCell),
            compact: false,
            corners: ["br"],
          }),
        },
      ],
    ],
  };
}

function cellClass(opts: { prose: boolean; compact: boolean; corners: string[] }): string {
  return [opts.prose ? "chat-table-prose" : undefined, opts.compact ? "chat-table-compact-cell" : undefined, ...opts.corners]
    .filter(Boolean)
    .join(" ");
}

function cellViewClass(text: string, opts: { prose: boolean; compact: boolean; corners: string[] }): string {
  const base = cellClass(opts);
  return tableCellHasCode(text) ? `${base} chat-table-has-code`.trim() : base;
}

export function layoutChatTable(headers: string[], rows: string[][]): ChatTableView {
  if (isFormCardTable(headers, rows)) return layoutFormCard(headers, rows);
  const cols = Math.max(headers.length, ...rows.map((row) => row.length), 0);
  const compact = Array.from({ length: cols }, () => false);

  const headerCells: ChatTableCellView[] = Array.from({ length: cols }, (_, col) => {
    const text = unwrapParenLine(stackTableCell(headers[col] ?? "").join(" "));
    const corners = [col === 0 ? "tl" : "", col === cols - 1 ? "tr" : ""].filter(Boolean);
    if (rows.length === 0) {
      if (col === 0) corners.push("bl");
      if (col === cols - 1) corners.push("br");
    }
    return {
      text,
      rowSpan: 1,
      className: cellClass({ prose: false, compact: compact[col], corners }),
    };
  });

  const body: Array<Array<ChatTableCellView | null>> = [];
  rows.forEach((row) => {
    const stacked = Array.from({ length: cols }, (_, col) => stackTableCell(row[col] ?? ""));
    const height = Math.max(1, ...stacked.map((lines) => lines.length));
    const block: Array<Array<ChatTableCellView | null>> = Array.from({ length: height }, () => Array.from({ length: cols }, () => null));
    stacked.forEach((lines, col) => {
      const prose = lines.some(isProseCell);
      if (lines.length <= 1) {
        block[0][col] = {
          text: lines[0] ?? "",
          rowSpan: height,
          className: cellViewClass(lines[0] ?? "", { prose, compact: compact[col] ?? false, corners: [] }),
        };
        return;
      }
      for (let r = 0; r < height; r += 1) {
        block[r][col] = {
          text: lines[r] ?? "",
          rowSpan: 1,
          className: cellViewClass(lines[r] ?? "", {
            prose: isProseCell(lines[r] ?? ""),
            compact: compact[col] ?? false,
            corners: [],
          }),
        };
      }
    });
    body.push(...block);
  });

  if (body.length > 0) {
    const last = body.length - 1;
    const mark = (row: number, col: number, corner: string) => {
      for (let r = row; r >= 0; r -= 1) {
        const cell = body[r][col];
        if (!cell) continue;
        if (r + cell.rowSpan - 1 < row) return;
        cell.className = `${cell.className} ${corner}`.trim();
        return;
      }
    };
    mark(last, 0, "bl");
    mark(last, cols - 1, "br");
  }

  return { compact, headers: headerCells, body };
}

export function normalizeMarkdownTables(source: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!looksLikeRow(lines[i])) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    const block: string[] = [];
    while (i < lines.length && looksLikeRow(lines[i])) {
      block.push(withPipes(lines[i]));
      i += 1;
    }
    if (block.length >= 2) {
      if (out.length && out[out.length - 1].trim() !== "") out.push("");
      if (!isSeparator(block[1])) {
        block.splice(1, 0, separatorFor(cellCount(block[0])));
      }
      out.push(...block);
      if (i < lines.length && lines[i].trim() !== "") out.push("");
    } else {
      out.push(block[0] ?? "");
    }
  }
  return out.join("\n");
}
