import { z } from "zod";
import {
  PATH_MAX_COURSES,
  PATH_MAX_NODES,
  PATH_MAX_UNITS,
  PATH_TEACH_MAX,
  PATH_TITLE_MAX,
  PATH_WHY_MAX,
  clipPathText,
} from "@/lib/paths/model";

const TITLE_IN = 500;
const TEACH_IN = 1600;

function clippedText(maxIn: number, maxOut: number) {
  return z.preprocess((value) => {
    const text = typeof value === "string" ? value : value == null ? "" : String(value);
    return text.slice(0, maxIn);
  }, z.string().transform((value) => clipPathText(value, maxOut)));
}

function cappedArray<T extends z.ZodType>(item: T, max: number) {
  return z.preprocess((value) => (Array.isArray(value) ? value.slice(0, max) : []), z.array(item));
}

const title = clippedText(TITLE_IN, PATH_TITLE_MAX);
const teach = clippedText(TEACH_IN, PATH_TEACH_MAX);

const node = z.object({
  title,
  teach: teach.optional(),
  outcome: teach.optional(),
  why: clippedText(200, PATH_WHY_MAX).optional(),
});

const unit = z.object({
  title,
  teach: teach.optional(),
  nodes: cappedArray(node, PATH_MAX_NODES + 3).optional(),
});

const course = z.object({
  title,
  units: cappedArray(unit, PATH_MAX_UNITS + 4),
});

export const pathDraftSchema = z.object({
  title,
  courses: z.preprocess(
    (value) => (Array.isArray(value) ? value.slice(0, PATH_MAX_COURSES + 2) : value),
    z.array(course).min(1),
  ),
});

export type PathDraft = z.infer<typeof pathDraftSchema>;
