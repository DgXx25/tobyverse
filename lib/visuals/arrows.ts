import type { FromToEmbed, WalkSlide } from "@/types/visual";

const ARROW_CMDS = ["\\xrightarrow", "\\xleftarrow", "\\longrightarrow"] as const;
const SHORT_RIGHT = "\\rightarrow";

export type FormulaPair = {
  left: string;
  right: string;
  via?: string;
};

function skipGroup(src: string, start: number): number {
  if (src[start] !== "{") return start + 1;
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return src.length;
}

function skipBracket(src: string, start: number): number {
  if (src[start] !== "[") return start;
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return src.length;
}

function parseArrow(src: string, i: number): { via: string; end: number } | null {
  const cmd = ARROW_CMDS.find((name) => src.startsWith(name, i));
  if (!cmd) {
    if (src.startsWith(SHORT_RIGHT, i) && !src.startsWith("\\rightarrowleft", i)) {
      return { via: "", end: i + SHORT_RIGHT.length };
    }
    return null;
  }
  let p = i + cmd.length;
  if (src[p] === "[") p = skipBracket(src, p);
  if (src[p] === "{") {
    const end = skipGroup(src, p);
    return { via: src.slice(p + 1, end - 1).trim(), end };
  }
  return { via: "", end: p };
}

function tidyChunk(value: string): string {
  return value
    .replace(/^(?:\\quad|\\qquad|\\,|\\;|\\:|,|;|\s)+/, "")
    .replace(/(?:\\quad|\\qquad|\\,|\\;|\\:|,|;|\s)+$/, "")
    .trim();
}

export function splitFormulaArrows(formula: string): FormulaPair[] {
  const src = formula.trim();
  if (!src) return [];

  const chunks: string[] = [];
  const vias: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;

  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") {
      if (depth === 0) {
        const arrow = parseArrow(src, i);
        if (arrow) {
          chunks.push(tidyChunk(src.slice(start, i)));
          vias.push(arrow.via);
          start = arrow.end;
          i = arrow.end;
          continue;
        }
      }
      i += 1;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}" && depth > 0) depth -= 1;
    i += 1;
  }
  chunks.push(tidyChunk(src.slice(start)));

  const pairs: FormulaPair[] = [];
  for (let n = 0; n < vias.length; n += 1) {
    const left = chunks[n];
    const right = chunks[n + 1];
    if (!left || !right) continue;
    pairs.push({
      left,
      right,
      via: vias[n] || undefined,
    });
  }
  return pairs;
}

export function expandWalkSlides(slides: WalkSlide[]): WalkSlide[] {
  return slides.flatMap((slide) => {
    if (slide.from_to) return [slide];
    const formula = slide.formula?.trim();
    if (!formula) return [slide];
    const pairs = splitFormulaArrows(formula);
    if (pairs.length === 0) return [slide];
    return pairs.map((pair, index) => ({
      title: index === 0 ? slide.title : undefined,
      text: index === 0 ? slide.text : "",
      from_to: {
        via: pair.via,
        left: { formula: pair.left },
        right: { formula: pair.right },
      } satisfies FromToEmbed,
    }));
  });
}
