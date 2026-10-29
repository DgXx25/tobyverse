import { parsePartialObject } from "@/lib/ai/json-stream";
import { CHAT_BLOCK_KINDS } from "@/lib/blocks/kinds";
import type { ChatBlockDef, ParsedChatBlock } from "@/lib/blocks/types";
import { SCENE_IDS } from "@/lib/blocks/kinds/scene";
import { sectionItemSchema, sectionsSchema } from "@/lib/blocks/kinds/sections";
import { imageListItemSchema, imageListSchema } from "@/lib/blocks/kinds/image-list";
import { visualExplanationSchema } from "@/lib/blocks/kinds/visual-explanation";

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
  if ("form" in row || row.reuse === true) return "paper";
  if ("lines" in row || "speakers" in row) return "dialogue";
  if (typeof row.id === "string" && SCENE_IDS.some((id) => id === row.id)) return "scene";
  return "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function previewBlock(type: string, raw: Record<string, unknown>): ParsedChatBlock | null {
  if (type === "image-list") {
    const items = Array.isArray(raw.items) ? raw.items.flatMap((item) => {
      const parsed = imageListItemSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }) : [];
    const parsed = imageListSchema.safeParse({ ...raw, items });
    return parsed.success ? { type, data: parsed.data } : null;
  }
  if (type === "visual-explanation") {
    const parsed = visualExplanationSchema.safeParse({
      type,
      title: asText(raw.title)?.trim(),
      note: asText(raw.note)?.trim() || undefined,
      galleryId: asText(raw.galleryId),
      imageIndex: typeof raw.imageIndex === "number" ? raw.imageIndex : undefined,
    });
    return parsed.success ? { type, data: parsed.data } : null;
  }
  if (type === "sections") {
    const items = Array.isArray(raw.items) ? raw.items.flatMap((item) => {
      const parsed = sectionItemSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }) : [];
    const parsed = sectionsSchema.safeParse({ items, title: asText(raw.title)?.trim() || undefined });
    return parsed.success ? { type, data: parsed.data } : null;
  }
  if (type === "paper") {
    if (raw.reuse === true) {
      return {
        type,
        data: {
          reuse: true,
          form: raw.form === "certificate" ? "certificate" : "ganckhadeba",
          brief: asText(raw.brief) ?? "",
        },
      };
    }
    const sample = asRecord(raw.sample);
    const given = asRecord(raw.given);
    return {
      type,
      data: {
        form: raw.form === "certificate" ? "certificate" : "ganckhadeba",
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
  const complete = tryJson(extracted.json);
  const raw = (complete ?? parsePartialObject(extracted.json)) as Record<string, unknown> | null;
  const type = extracted.type || inferFenceType(raw);
  if (!type) return null;
  const def = chatBlockById(type);
  if (!def) return null;
  if (raw) {
    const result = def.schema.safeParse({ ...raw, type });
    if (result.success) return { type, data: result.data };
    if (type === "sections" && complete) return null;
    return previewBlock(type, raw);
  }
  return previewBlock(type, {});
}

export function formatTobyBlockCards(defs: ChatBlockDef[]): string {
  if (defs.length === 0) return "";
  const names = defs.map((item) => item.id).join(", ");
  const sample = defs[0]?.id ?? "dialogue";
  const cards = defs.map((item) => item.card()).join("\n\n");
  return `Optional native blocks available this turn (${names}). Use one only when it helps the request. For an explanation with two or more distinct ideas, usually prefer the sections block with short, meaningful headings over an ungrouped paragraph or generic bullet list; keep simple answers in prose. For a concrete real-world phenomenon, proactively consider whether one specific photo can make its appearance, mechanism, or effect easier to grasp; if so, search for and include the most relevant result in a visual-explanation card, even when the user did not ask for an image. When you use search_images to support an explanation and visual-explanation is available, place the best matching returned photo in that block instead of leaving it as a detached gallery. If results are not actually relevant, omit the photo block. Do not repeat the card note or restate the same conclusion after a sections block. These formats remain optional when they add no real value. Rendering protocol, if selected:\n\`\`\`toby ${sample}\n{...json...}\n\`\`\`\nThe fence body MUST be JSON only and the type MUST be listed here. Place each block where its explanation is being discussed: interleave prose and blocks naturally, and do not collect them at the end. Prefer concise prose around a block; retain useful reasoning and details, and expand when the request calls for it. Do not ask for permission to use an available block; decide from the request whether it helps, and omit it when it does not. A short lead-in can introduce a block; include the fence if you promise one. A table and a block may both appear when each adds distinct value.\n\n${cards}`;
}
