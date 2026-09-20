import { parsePartialObject } from "@/lib/ai/json-stream";
import { CHAT_BLOCK_KINDS } from "@/lib/blocks/kinds";
import type { ChatBlockDef, ParsedChatBlock } from "@/lib/blocks/types";

const BY_ID = new Map(CHAT_BLOCK_KINDS.map((item) => [item.id, item]));

export function chatBlockDefs(): ChatBlockDef[] {
  return CHAT_BLOCK_KINDS;
}

export function chatBlockById(id: string): ChatBlockDef | undefined {
  return BY_ID.get(id);
}

function parseObjectJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    try {
      return JSON.parse(text.replace(/,(\s*[}\]])/g, "$1"));
    } catch {
      return null;
    }
  }
}

function tryJson(raw: string): unknown {
  const text = raw.trim();
  const direct = parseObjectJson(text);
  if (direct && typeof direct === "object") return direct;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return parseObjectJson(text.slice(start, end + 1));
}

function fenceType(lang: string, body: string): { type: string; json: string } {
  const suffix = lang.replace(/^toby-?/i, "").trim().toLowerCase();
  const trimmed = body.trim();
  const first = trimmed.split(/\n/, 1)[0]?.trim() ?? "";
  if (suffix) {
    if (first.toLowerCase() === suffix) return { type: suffix, json: trimmed.slice(first.length).trim() };
    return { type: suffix, json: trimmed };
  }
  if (/^[a-z][a-z0-9_-]*$/i.test(first) && !first.startsWith("{")) {
    return { type: first.toLowerCase(), json: trimmed.slice(first.length).trim() };
  }
  const parsed = tryJson(trimmed);
  if (parsed && typeof parsed === "object" && "type" in parsed && typeof parsed.type === "string") {
    return { type: parsed.type.trim().toLowerCase(), json: trimmed };
  }
  return { type: "", json: trimmed };
}

function inferFenceType(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const row = raw as Record<string, unknown>;
  if (typeof row.type === "string" && row.type.trim()) return row.type.trim().toLowerCase();
  if ("cells" in row) return "grid";
  if ("form" in row) return "paper";
  if ("lines" in row || "speakers" in row) return "dialogue";
  return "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function previewBlock(type: string, raw: Record<string, unknown>): ParsedChatBlock | null {
  if (type === "paper") {
    const sample = asRecord(raw.sample);
    const given = asRecord(raw.given);
    return {
      type,
      data: {
        form: "ganckhadeba",
        brief: asText(raw.brief) ?? "",
        given: given ? { to: asText(given.to) } : undefined,
        sample: sample
          ? {
              to: asText(sample.to),
              body: asText(sample.body),
              sign: asText(sample.sign),
              date: asText(sample.date),
            }
          : undefined,
      },
    };
  }
  if (type === "grid") {
    const cells =
      typeof raw.cells === "string"
        ? raw.cells
        : typeof raw.cells === "number"
          ? String(raw.cells)
          : Array.isArray(raw.cells)
            ? raw.cells.join("")
            : "";
    return {
      type,
      data: {
        cells,
        cols: typeof raw.cols === "number" ? raw.cols : undefined,
        result: asText(raw.result),
        note: asText(raw.note),
      },
    };
  }
  if (type === "dialogue") {
    const speakers = Array.isArray(raw.speakers)
      ? raw.speakers.filter((item) => {
          if (!item || typeof item !== "object") return false;
          return typeof (item as { id?: unknown }).id === "string";
        })
      : [];
    const lines = Array.isArray(raw.lines)
      ? raw.lines.filter((item) => {
          if (!item || typeof item !== "object") return false;
          const row = item as { text?: unknown; speaker?: unknown };
          return typeof row.text === "string" && typeof row.speaker === "string";
        })
      : [];
    return {
      type,
      data: {
        speakers,
        lines,
        title: asText(raw.title),
        note: asText(raw.note),
        mark: asText(raw.mark),
      },
    };
  }
  return null;
}

/** Parse a ```toby fence. Incomplete JSON while streaming still yields a preview — never show the source. */
export function parseTobyFence(lang: string, body: string): ParsedChatBlock | null {
  if (!/^toby/i.test(lang.trim())) return null;
  const extracted = fenceType(lang.trim(), body);
  const raw = (tryJson(extracted.json) ?? parsePartialObject(extracted.json)) as Record<string, unknown> | null;
  const type = extracted.type || inferFenceType(raw);
  if (!type) return null;
  const def = chatBlockById(type);
  if (!def) return null;
  if (raw) {
    const result = def.schema.safeParse({ ...raw, type });
    if (result.success) return { type, data: result.data };
    return previewBlock(type, raw);
  }
  return previewBlock(type, {});
}

export function formatTobyBlockCards(defs: ChatBlockDef[]): string {
  if (defs.length === 0) return "";
  const names = defs.map((item) => item.id).join(", ");
  const sample = defs[0]?.id ?? "dialogue";
  const cards = defs.map((item) => item.card()).join("\n\n");
  return `Native blocks this turn only (${names}). If one would help, emit a markdown fence:\n\`\`\`toby ${sample}\n{...json...}\n\`\`\`\nFence body is JSON only — no labels before the object. A listed block is never the whole answer: write a short lead-in above the fence, then the fence. If you write that lead-in, the fence must follow. A markdown table and a listed block may both appear if each carries meaning. Skip a block only when no visual example is needed. Do not follow a block with a quiz. Do not invent types.\n\n${cards}`;
}
