export type RichPart =
  | { kind: "text"; value: string }
  | { kind: "latex"; value: string; display: boolean }
  | { kind: "mark"; value: string };

export type LatexPart = Exclude<RichPart, { kind: "mark" }>;

const MATH_TOKEN = /[\\^_{}=<>≤≥≠±+\-*/|]|(?:\\\\)|\\frac|\\sum|\\int|\\cdot|\\times|\\rightarrow|\\Rightarrow|\\triangle|\\text|\\mathrm|\\begin|\\end|\\sqrt|pmatrix|aligned/;

export function unwrapLatex(source: string): string {
  const text = source.trim();
  const display = text.match(/^\$\$([\s\S]+)\$\$$/) || text.match(/^\\\[([\s\S]+)\\\]$/);
  if (display?.[1]) return display[1].trim();
  const inline = text.match(/^\$([^$]+)\$/) || text.match(/^\\\(([\s\S]+)\\\)$/);
  if (inline?.[1]) return inline[1].trim();
  return text;
}

export function isInlineMath(inner: string): boolean {
  const text = inner.trim();
  if (!text || text.length > 280) return false;
  const ka = (text.match(/[\u10A0-\u10FF]/g) || []).length;
  if (ka > 6) return false;
  if (/^[A-Za-z][A-Za-z0-9]*$/.test(text)) return true;
  if (/^\([^)]+\)$/.test(text)) return true;
  if (/[|=]/.test(text) && ka === 0) return true;
  return MATH_TOKEN.test(text);
}

export function isLatexSource(value: string): boolean {
  const text = unwrapLatex(value);
  if (!text || text.length > 900) return false;
  const ka = (text.match(/[\u10A0-\u10FF]/g) || []).length;
  if (ka >= 12) return false;
  return /\\(frac|sum|int|cdot|times|rightarrow|Rightarrow|triangle|text|mathrm|begin|end|sqrt)|[=≈≤≥≠±]|\$\$|\\\\/.test(text);
}

export function formulaIsProse(value: string): boolean {
  const text = value.trim();
  if (!text) return true;
  const ka = (text.match(/[\u10A0-\u10FF]/g) || []).length;
  if (ka >= 12) return true;
  if (MATH_TOKEN.test(text)) return false;
  return ka > 0 || /\s/.test(text);
}

export function splitRichParts(source: string): RichPart[] {
  const parts: RichPart[] = [];
  const token =
    /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\begin\{(aligned|align\*?|pmatrix|bmatrix|vmatrix|cases|array)\}([\s\S]*?)\\end\{\3\}|\$((?:\\.|[^$\n])+)\$|\\\(([\s\S]+?)\\\)|==([^=\n]+)==/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = token.exec(source))) {
    if (match.index > last) {
      parts.push({ kind: "text", value: source.slice(last, match.index) });
    }
    const display = match[1] ?? match[2];
    const env = match[3];
    const envBody = match[4];
    const inline = match[5] ?? match[6];
    const mark = match[7];
    if (display != null) {
      parts.push({ kind: "latex", value: display.trim(), display: true });
    } else if (env != null) {
      parts.push({ kind: "latex", value: `\\begin{${env}}${envBody}\\end{${env}}`, display: true });
    } else if (inline != null && isInlineMath(inline)) {
      parts.push({ kind: "latex", value: inline.trim(), display: false });
    } else if (mark != null) {
      parts.push({ kind: "mark", value: mark.trim() });
    } else {
      parts.push({ kind: "text", value: match[0] });
    }
    last = match.index + match[0].length;
  }
  if (last < source.length) parts.push({ kind: "text", value: source.slice(last) });
  return parts.length ? parts : [{ kind: "text", value: source }];
}

export function splitLatexParts(source: string): LatexPart[] {
  return splitRichParts(source).flatMap((part) => (part.kind === "mark" ? [{ kind: "text" as const, value: `==${part.value}==` }] : [part]));
}
