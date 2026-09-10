/** Pull complete JSON values out of a growing string. */

function skipWs(text: string, i: number): number {
  while (i < text.length && /\s/.test(text[i])) i += 1;
  return i;
}

function scanValue(text: string, start: number): { end: number; raw: string } | null {
  const i = skipWs(text, start);
  if (i >= text.length) return null;
  const ch = text[i];

  if (ch === '"') {
    let escape = false;
    for (let j = i + 1; j < text.length; j += 1) {
      const c = text[j];
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') return { end: j + 1, raw: text.slice(i, j + 1) };
    }
    return null;
  }

  if (ch === "{" || ch === "[") {
    const close = ch === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let j = i; j < text.length; j += 1) {
      const c = text[j];
      if (inString) {
        if (escape) {
          escape = false;
          continue;
        }
        if (c === "\\") {
          escape = true;
          continue;
        }
        if (c === '"') inString = false;
        continue;
      }
      if (c === '"') {
        inString = true;
        continue;
      }
      if (c === ch) depth += 1;
      else if (c === close) {
        depth -= 1;
        if (depth === 0) return { end: j + 1, raw: text.slice(i, j + 1) };
      }
    }
    return null;
  }

  const literal = text.slice(i).match(/^(true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
  if (!literal) return null;
  return { end: i + literal[0].length, raw: literal[0] };
}

function findKey(text: string, key: string): number {
  const needle = `"${key}"`;
  let from = 0;
  while (from < text.length) {
    const at = text.indexOf(needle, from);
    if (at < 0) return -1;
    const after = skipWs(text, at + needle.length);
    if (text[after] === ":") return after + 1;
    from = at + 1;
  }
  return -1;
}

export function peekJsonString(text: string, key: string): string | null {
  const colon = findKey(text, key);
  if (colon < 0) return null;
  const value = scanValue(text, colon);
  if (!value || value.raw[0] !== '"') return null;
  try {
    return JSON.parse(value.raw) as string;
  } catch {
    return null;
  }
}

export function extractJsonArrayItems(text: string, key: string): unknown[] {
  const colon = findKey(text, key);
  if (colon < 0) return [];
  const i = skipWs(text, colon);
  if (text[i] !== "[") return [];

  const items: unknown[] = [];
  let cursor = i + 1;
  while (cursor < text.length) {
    cursor = skipWs(text, cursor);
    if (cursor >= text.length) break;
    if (text[cursor] === "]") break;
    if (text[cursor] === ",") {
      cursor += 1;
      continue;
    }
    const value = scanValue(text, cursor);
    if (!value) break;
    try {
      items.push(JSON.parse(value.raw));
    } catch {
      break;
    }
    cursor = value.end;
  }
  return items;
}
