import { clipText } from "@/lib/materials/limits";

const WEEK_WINDOW =
  /(?:^|\n)\s*(?:week|კვირა|lecture|ლექცია|unit|თემა|topic|თავი)\s*[\dIVX]+[\s\S]{0,420}/gi;
const TOC_HEAD =
  /(?:^|\n)\s*(?:contents|table of contents|topics?|outline|შინაარსი|თემები|ლექციები|სილაბუსი)\s*[:\n]/i;

/** Prefer a topic list / TOC over overview prose so intro-about-the-course is not lesson 1. */
export function excerptForPath(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  const tocAt = text.search(TOC_HEAD);
  if (tocAt >= 0) {
    return clipText(text.slice(tocAt).replace(/\s+/g, " ").trim(), max);
  }
  const matches = [...text.matchAll(WEEK_WINDOW)].map((item) => item[0].replace(/\s+/g, " ").trim());
  if (matches.length >= 3) {
    return clipText(matches.slice(0, 16).join("\n"), max);
  }
  return clipText(trimmed, max);
}
