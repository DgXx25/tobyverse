export type RichPart =
  | { kind: "text"; value: string }
  | { kind: "latex"; value: string; display: boolean }
  | { kind: "mark"; value: string }
  | { kind: "strong"; value: string }
  | { kind: "em"; value: string }
  | { kind: "break" };

export type LatexPart = Exclude<RichPart, { kind: "mark" } | { kind: "strong" } | { kind: "em" } | { kind: "break" }>;

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
  if (/^[A-Za-z]+_[A-Za-z0-9]+$/.test(text)) return true;
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

const MATH_SLOT_START = "\uE000";
const MATH_SLOT_END = "\uE001";
const MATH_SLOT_TOKEN = /\uE000(\d+)\uE001/g;
const MARK_SLOT_START = "\uE010";
const MARK_SLOT_END = "\uE011";
const MARK_SLOT_TOKEN = /\uE010(\d+)\uE011/g;

export type ChatFenceSegment =
  | { kind: "md"; text: string }
  | { kind: "math"; value: string }
  | { kind: "fence"; lang: string; text: string };

type MdOr<T> = { kind: "md"; text: string } | T;

function splitByPattern<T>(source: string, pattern: RegExp, toPart: (match: RegExpExecArray) => T): MdOr<T>[] {
  const parts: MdOr<T>[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    if (match.index > last) {
      parts.push({ kind: "md", text: source.slice(last, match.index) });
    }
    parts.push(toPart(match));
    last = match.index + match[0].length;
  }
  if (last < source.length) parts.push({ kind: "md", text: source.slice(last) });
  return parts.length ? parts : [{ kind: "md", text: source }];
}

function splitTrailingOpenFence(
  source: string,
): Array<{ kind: "md"; text: string } | { kind: "fence"; lang: string; text: string }> {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let open = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trimEnd() === "```") {
      if (open >= 0) open = -1;
      continue;
    }
    if (line.startsWith("```")) open = i;
  }
  if (open < 0) return source ? [{ kind: "md", text: source }] : [];
  const fenceLine = lines[open] ?? "";
  const match = fenceLine.match(/^```([\w-]*)[ \t]*(.*)$/);
  const lang = (match?.[1] ?? "").trim().toLowerCase();
  const sameLine = match?.[2] ?? "";
  const rest = lines.slice(open + 1).join("\n");
  const body = sameLine ? (rest ? `${sameLine}\n${rest}` : sameLine) : rest;
  const before = lines.slice(0, open).join("\n");
  const parts: Array<{ kind: "md"; text: string } | { kind: "fence"; lang: string; text: string }> = [];
  if (before) parts.push({ kind: "md", text: before });
  parts.push({ kind: "fence", lang, text: body });
  return parts;
}

export function splitCodeFences(source: string): Array<{ kind: "md"; text: string } | { kind: "fence"; lang: string; text: string }> {
  return splitByPattern(source, /```([\w-]*)[ \t]*\r?\n?([\s\S]*?)```/g, (match) => ({
    kind: "fence" as const,
    lang: (match[1] ?? "").trim().toLowerCase(),
    text: (match[2] ?? "").replace(/^\r?\n/, "").replace(/\r?\n$/, ""),
  })).flatMap((part) => (part.kind === "md" ? splitTrailingOpenFence(part.text) : [part]));
}

export type DisplayMathPart = { kind: "md"; text: string } | { kind: "math"; value: string; note?: string; step?: boolean };

const MATH_PURPOSE_CUE = /\b(?:to|because|so that|in order to|goal)\b|(?:რათა|იმისთვის|მიზნით|მიზანია|რადგან)/iu;
const MATH_ACTION_CUE = /\b(?:subtract|add|divide|multiply|then|next|both sides)\b|(?:გამოვაკლ|დავუმატ|გავყ|გამოვყ|შემდეგ|ორივე მხარეს)/iu;

/** Keep only concise purpose text; operation narration is already visible in the equations. */
function optionalPurposeNote(source: string): string {
  const start = source.search(MATH_PURPOSE_CUE);
  if (start < 0) return "";
  let note = source.slice(start).trim();
  const action = note.search(/[,;:]\s*(?:then|subtract|add|divide|multiply|next|შემდეგ|გამოვაკლ|დავუმატ|გავყ|გამოვყ)\b/iu);
  if (action >= 0) note = note.slice(0, action).trim();
  return note.length > 0 && note.length <= 120 ? note : "";
}

/** Read TobyVerse's optional, human-readable note from the final standalone \text{} line. */
function parseDisplayMathBody(source: string): { value: string; note?: string; step?: boolean } {
  const lines = source.trim().split(/\r?\n/);
  const stepIndex = lines.findIndex((line) => /^\s*%\s*tobyverse-step\s*$/i.test(line));
  const step = stepIndex >= 0;
  const noteIndex = lines.findIndex((line) => /^\s*%\s*tobyverse-note:/i.test(line));
  let note: string | undefined;
  if (noteIndex >= 0) {
    const encoded = (lines[noteIndex] ?? "").replace(/^\s*%\s*tobyverse-note:/i, "").trim();
    try { note = decodeURIComponent(encoded) || undefined; } catch { note = encoded || undefined; }
  }
  const formulaLines = lines.filter((_, index) => index !== stepIndex && index !== noteIndex);
  const last = formulaLines.at(-1) ?? "";
  const noteStart = last.match(/^\s*\\text\{/);
  if (!note && noteStart) {
    const open = last.indexOf("{", noteStart[0].length - 1);
    let depth = 0;
    let close = -1;
    for (let index = open; index < last.length; index += 1) {
      if (last[index] === "\\") { index += 1; continue; }
      if (last[index] === "{") depth += 1;
      if (last[index] === "}" && --depth === 0) { close = index; break; }
    }
    if (close === last.length - 1) {
      note = last.slice(open + 1, close).replace(/\\([{}])/g, "$1").trim() || undefined;
      formulaLines.pop();
    }
  }
  return {
    value: formulaLines.join("\n").trim(),
    ...(note ? { note } : {}),
    ...(step ? { step: true } : {}),
  };
}

export function splitDisplayMath(source: string): DisplayMathPart[] {
  return splitByPattern(
    source,
    /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\begin\{(aligned|align\*?|pmatrix|bmatrix|vmatrix|cases|array)\}([\s\S]*?)\\end\{\3\}/g,
    (match) => {
      if (match[1] != null) return { kind: "math" as const, ...parseDisplayMathBody(match[1]) };
      if (match[2] != null) return { kind: "math" as const, ...parseDisplayMathBody(match[2]) };
      return { kind: "math" as const, value: `\\begin{${match[3]}}${match[4]}\\end{${match[3]}}` };
    },
  );
}

/**
 * Join numbered move labels with their adjacent equation blocks and render the
 * pair as one ordered-list item. This handles both inline equations and the
 * common "numbered move, then display-math block" layout across languages.
 */
export function promoteEquationStepsToDisplayMath(source: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  const ordered = /^\s{0,3}\d+[.)]\s+(.+)$/;
  const inlineMath = /\$((?:\\.|[^$\n])+?)\$|\\\(([\s\S]+?)\\\)/g;
  const transitionCue = /\b(?:then|next|subtract|add|divide|multiply|isolate|both sides|therefore)\b|(?:შემდეგ|ორივე მხარეს|გამოვაკლ|დავუმატ|გავყ|გამოვყ|ამიტომ)/iu;
  let inFence = false;

  for (let index = 0; index < lines.length;) {
    const line = lines[index] ?? "";
    if (/^\s{0,3}```/.test(line)) {
      inFence = !inFence;
      output.push(line);
      index += 1;
      continue;
    }
    const first = !inFence ? line.match(ordered) : null;
    if (!first) {
      if (!inFence) {
        const equations = [...line.matchAll(inlineMath)]
          .filter((match) => /[=<>≤≥]/u.test(String(match[1] ?? match[2] ?? "")));
        const prose = line.replace(inlineMath, " ");
        if (equations.length >= 2 && transitionCue.test(prose)) {
          const steps = equations.map((match, stepIndex) => {
            const previousEnd = stepIndex === 0
              ? 0
              : (equations[stepIndex - 1]?.index ?? 0) + (equations[stepIndex - 1]?.[0].length ?? 0);
            const noteText = line.slice(previousEnd, match.index).replace(/[\s:：—–.]+$/u, "").trim();
            const note = optionalPurposeNote(noteText);
            return { formula: String(match[1] ?? match[2] ?? "").trim(), note };
          });
          const prefix = line.slice(0, equations[0]?.index ?? 0).trim();
          const suffixMatch = equations.at(-1);
          const suffix = suffixMatch
            ? line.slice((suffixMatch.index ?? 0) + suffixMatch[0].length).trim()
            : "";
          const narration = /\b(?:subtract|add|divide|multiply|then|next|both sides)\b|(?:გამოვაკლ|დავუმატ|გავყ|გამოვყ|შემდეგ|ორივე მხარეს)/iu;
          if (prefix && !narration.test(prefix)) output.push(prefix);
          output.push(...steps.flatMap(({ formula, note }, row) => [
            ...(row ? [""] : []),
            `$$\n% tobyverse-step${note ? `\n% tobyverse-note:${encodeURIComponent(note)}` : ""}\n${formula}\n$$`,
          ]));
          if (suffix && !narration.test(suffix)) output.push(suffix);
          index += 1;
          continue;
        }
      }
      output.push(line);
      index += 1;
      continue;
    }

    const steps: Array<{ formula: string; note: string }> = [];
    let cursor = index;
    while (cursor < lines.length) {
      const item = (lines[cursor] ?? "").match(ordered);
      if (!item) break;
      const body = item[1] ?? "";
      const matches = [...body.matchAll(inlineMath)];
      const equations = matches
        .map((match) => String(match[1] ?? match[2] ?? "").trim())
        .filter((formula) => /[=<>≤≥]/u.test(formula));
      let formula = equations.at(-1) ?? "";
      let note = matches.length
        ? body.slice(0, matches.find((match) => /[=<>≤≥]/u.test(String(match[1] ?? match[2] ?? "")))?.index ?? 0).trim()
        : body.trim();
      let next = cursor + 1;

      // A separate display equation belongs to its numbered move when only
      // blank lines separate them. Keep the move as the card's optional note.
      if (!formula) {
        while (next < lines.length && !(lines[next] ?? "").trim()) next += 1;
        const displayLine = lines[next] ?? "";
        const inlineBlock = displayLine.match(/^\s{0,3}\$\$([\s\S]+?)\$\$\s*$/);
        if (inlineBlock) {
          // Handle `$$x = 5$$` as a complete block; treating the closing
          // delimiter as formula text would expose our internal metadata.
          formula = inlineBlock[1]?.trim() ?? "";
          next += 1;
        } else if (/^\s{0,3}\$\$\s*$/.test(displayLine)) {
          next += 1;
          const equationLines: string[] = [];
          while (next < lines.length && !/^\s{0,3}\$\$\s*$/.test(lines[next] ?? "")) {
            equationLines.push(lines[next] ?? "");
            next += 1;
          }
          if (next < lines.length) {
            formula = equationLines.join("\n").trim();
            next += 1;
          }
        }
      }

      if (!formula || !/[=<>≤≥]/u.test(formula)) break;
      note = note.replace(/[\s:：—–-]+$/, "").trim();
      steps.push({ formula, note: optionalPurposeNote(note) });
      while (next < lines.length && !(lines[next] ?? "").trim()) next += 1;
      if (!ordered.test(lines[next] ?? "")) { cursor = next; break; }
      cursor = next;
    }

    if (steps.length < 2) {
      output.push(line);
      index += 1;
      continue;
    }

    output.push(...steps.flatMap(({ formula, note }, row) => [
      ...(row ? [""] : []),
      `$$\n% tobyverse-step${note ? `\n% tobyverse-note:${encodeURIComponent(note)}` : ""}\n${formula}\n$$`,
    ]));
    index = cursor;
  }

  return output.join("\n");
}

export function splitChatFences(source: string): ChatFenceSegment[] {
  return splitCodeFences(source).flatMap((part): ChatFenceSegment[] => {
    if (part.kind === "fence") {
      if (part.lang === "math" || part.lang === "latex") {
        return [{ kind: "math", value: part.text.trim() }];
      }
      return [part];
    }
    return splitDisplayMath(part.text);
  });
}

export function protectInlineMath(source: string): { text: string; slots: string[] } {
  const slots: string[] = [];
  const text = source.replace(/\$((?:\\.|[^$\n])+?)\$|\\\(([\s\S]+?)\\\)/g, (all, dollar, paren) => {
    const inner = String(dollar ?? paren ?? "").trim();
    if (!inner || !isInlineMath(inner)) return all;
    const index = slots.length;
    slots.push(inner);
    return `${MATH_SLOT_START}${index}${MATH_SLOT_END}`;
  });
  return { text, slots };
}

const MARK_PAIR = /==((?:(?!==)[\s\S])+?)==/g;
const MATH_KEEP_START = "\uE012";
const MATH_KEEP_END = "\uE013";
const MATH_KEEP_TOKEN = /\uE012(\d+)\uE013/g;

function unwrapFakeMath(source: string): string {
  return source.replace(/\$((?:\\.|[^$\n])+?)\$/g, (all, inner: string) => {
    if (isInlineMath(inner)) return all;
    return inner;
  });
}

function stripUnpairedDollars(source: string): string {
  const kept: string[] = [];
  let text = source.replace(/\$((?:\\.|[^$\n])+?)\$/g, (all, inner: string) => {
    if (!isInlineMath(inner)) return inner;
    const index = kept.length;
    kept.push(all);
    return `${MATH_KEEP_START}${index}${MATH_KEEP_END}`;
  });
  text = text.replace(/\$/g, "");
  return text.replace(MATH_KEEP_TOKEN, (_, index: string) => kept[Number(index)] ?? "");
}

/** Drop leftover `==` / `$` and unwrap `$prose$` so markup never shows as raw text. */
export function scrubLeakedMarkup(source: string): string {
  let text = unwrapFakeMath(source);
  const kept: string[] = [];
  MARK_PAIR.lastIndex = 0;
  text = text.replace(MARK_PAIR, (all, inner: string) => {
    if (/\n\s*\n/.test(inner) || inner.length > 800) return all;
    const index = kept.length;
    kept.push(inner);
    return `${MARK_SLOT_START}${index}${MARK_SLOT_END}`;
  });
  text = text.replace(/==/g, "");
  text = stripUnpairedDollars(text);
  text = text.replace(MARK_SLOT_TOKEN, (_, index: string) => `==${kept[Number(index)] ?? ""}==`);
  return text;
}

export function restoreInlineMath(source: string, slots: string[]): string {
  if (!slots.length) return source;
  return source.replace(MATH_SLOT_TOKEN, (all, index) => {
    const inner = slots[Number(index)];
    return inner != null ? `$${inner}$` : all;
  });
}

export function splitRichParts(source: string): RichPart[] {
  const parts: RichPart[] = [];
  const token =
    /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\begin\{(aligned|align\*?|pmatrix|bmatrix|vmatrix|cases|array)\}([\s\S]*?)\\end\{\3\}|==((?:(?!==)[\s\S])+?)==|\$((?:\\.|[^$\n])+)\$|\\\(([\s\S]+?)\\\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|<br\s*\/?>|<\/?[a-zA-Z][a-zA-Z0-9]*\b[^>]*\/?>/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = token.exec(source))) {
    if (match.index > last) {
      parts.push({ kind: "text", value: source.slice(last, match.index) });
    }
    const display = match[1] ?? match[2];
    const env = match[3];
    const envBody = match[4];
    const mark = match[5];
    const inline = match[6] ?? match[7];
    const strong = match[8];
    const em = match[9];
    if (display != null) {
      parts.push({ kind: "latex", value: display.trim(), display: true });
    } else if (env != null) {
      parts.push({ kind: "latex", value: `\\begin{${env}}${envBody}\\end{${env}}`, display: true });
    } else if (mark != null && !/\n\s*\n/.test(mark) && mark.length <= 800) {
      parts.push({ kind: "mark", value: mark.trim() });
    } else if (mark != null) {
      parts.push({ kind: "text", value: mark });
    } else if (inline != null && isInlineMath(inline)) {
      parts.push({ kind: "latex", value: inline.trim(), display: false });
    } else if (inline != null) {
      parts.push({ kind: "text", value: inline });
    } else if (strong != null) {
      parts.push({ kind: "strong", value: strong.trim() });
    } else if (em != null) {
      parts.push({ kind: "em", value: em.trim() });
    } else if (/^<br/i.test(match[0])) {
      parts.push({ kind: "break" });
    } else if (!match[0].startsWith("<")) {
      parts.push({ kind: "text", value: match[0] });
    }
    last = match.index + match[0].length;
  }
  if (last < source.length) parts.push({ kind: "text", value: source.slice(last) });
  return parts.length ? parts : [{ kind: "text", value: source }];
}

export function splitLatexParts(source: string): LatexPart[] {
  return splitRichParts(source).flatMap((part) => {
    if (part.kind === "mark") return [{ kind: "text" as const, value: `==${part.value}==` }];
    if (part.kind === "strong" || part.kind === "em") return [{ kind: "text" as const, value: part.value }];
    if (part.kind === "break") return [{ kind: "text" as const, value: "\n" }];
    return [part];
  });
}
