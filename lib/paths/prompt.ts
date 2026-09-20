import type { PathKind } from "@/types/path";

const SHARED = `Return JSON only: {"title": string, "courses":[...]}.
This is a learning PATH map, not notes and not a lesson.

Shape:
- courses: one per distinct subject (5 syllabi → 5 courses).
- units: ordered chapters (თავები). Max 14 per course — a cap, not a target.
- nodes: optional subsections (ქვეთავები). Max 8 per chapter — a cap, not a target.

Structure is free:
- A chapter with NO distinct sub-ideas → title + teach, and nodes: [] (or omit nodes).
- A chapter WITH named sub-ideas in the source → keep the chapter title and put those ideas in nodes.
- If the source is a syllabus / TOC / lecture list, those headings ARE the path. Prefer the topic list over overview prose.
- Skip meta nodes: course intro, "რაზე იქნება", aims, grading, "კვირა 1-ში გავიგებთ რომ…", lesson 0. First node is the first real teachable unit (a definition, method, model, or problem type), in dependency order.
- If there is NO syllabus and the topic is a skill (grammar, language, "teach me X"): split into small bites. One node = one pattern = one table. If a step would need two ## headings or two tables, it is TWO nodes.

Titles:
- Short labels the student will see. Same language as the sources / user.
- Real names only: "OLS assumptions", "If I had…, I would be… now". Never "Topic 1", "Topic 2", "Week 3", "თემა 1", or any numbered placeholder.

teach (required on every chapter and every node you emit):
- 2–4 short sentences for the TUTOR, not the student.
- Only THIS node's one table: the form to produce, the mix-up to skip, what "enough" looks like.
- Not "also cover X and Y". Not "explain what X is". Not a lecture.

why (optional, short): one student-facing clause if the order is not obvious.

Also:
- Ignore admin text, grading, office hours, unread papers.
- Forbidden: markdown, notes, quizzes, Topic N padding.`;

const COURSE = `If there is no syllabus file, prefer 8–14 small steps (use chapters to group; max 8 nodes per chapter). Titles name the move. Never a survey node that bundles several grammar names. Do not invent a 20-topic textbook table of contents from "teach me X".
- Do not invent a textbook curriculum when the source is thin.`;

const REVIEW = `This is EXAM PREP / review, not a course to teach from week 1.
- 4–8 nodes only. High-yield topics that actually appear in the materials (definitions to recall, problem types they already saw, weak spots if quizzes exist).
- Do not reteach the syllabus intro or "რაზე იქნება".
- Each node is a recall check → move on. No week-long pacing.
- Default action later is retrieval, not explanation. Do not generate long notes.`;

export function pathSystemPrompt(kind: PathKind = "course"): string {
  return `${SHARED}\n\n${kind === "review" ? REVIEW : COURSE}`;
}
