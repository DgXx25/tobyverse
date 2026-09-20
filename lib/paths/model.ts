import type { PathBriefing, PathCourse, PathKind, PathNode, PathUnit, StudyPath } from "@/types/path";

export const PATH_MAX_COURSES = 6;
export const PATH_MAX_UNITS = 14;
export const PATH_MAX_NODES = 8;
export const PATH_REVIEW_MAX_NODES = 8;
export const PATH_TITLE_MAX = 64;
export const PATH_OUTCOME_MAX = 140;
export const PATH_TEACH_MAX = 420;
export const PATH_WHY_MAX = 80;

const PLACEHOLDER_TITLE =
  /^(topic|თემა|week|კვირა|unit|chapter|თავი|node|part|ნაწილი|section)s?\s*[\dIVX]+\s*$/i;

const META_TITLE =
  /^(course\s+)?(introduction|intro|overview|welcome|aims?|objectives?|grading|assessment|syllabus|about(\s+this)?(\s+course)?|course\s+(info|outline|description)|გაცნობა|შესავალი|მიზნები|შეფასება|რაზე იქნება|გაკვეთილი\s*0)(\b|$|:)/i;

const META_BODY = /გავიგებთ რომ|this (week|course) (we )?will (learn|cover)|რაზე იქნება კურსი/i;

export function isPlaceholderTitle(value: string): boolean {
  return PLACEHOLDER_TITLE.test(value.replace(/\s+/g, " ").trim());
}

export function isMetaPathTitle(value: string, teach?: string): boolean {
  const title = value.replace(/\s+/g, " ").trim();
  if (!title) return true;
  if (META_TITLE.test(title)) return true;
  if (teach && META_BODY.test(teach) && /intro|შესავალი|overview|გაცნობა|week\s*1|კვირა\s*1/i.test(title)) {
    return true;
  }
  return false;
}

export function nodeTeach(node: Pick<PathNode, "teach" | "outcome">): string {
  return (node.teach || node.outcome || "").trim();
}

export function clipPathText(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

export function flattenNodes(courses: PathCourse[]): PathNode[] {
  return courses.flatMap((course) => course.units.flatMap((unit) => unit.nodes));
}

export function flattenCourseNodes(course: PathCourse | null | undefined): PathNode[] {
  return course?.units.flatMap((unit) => unit.nodes) ?? [];
}

export function findCourse(path: Pick<StudyPath, "courses">, courseId: string): PathCourse | null {
  return path.courses.find((item) => item.id === courseId) ?? path.courses[0] ?? null;
}

export function findNode(
  path: Pick<StudyPath, "courses">,
  nodeId: string,
): { course: PathCourse; unit: PathUnit; node: PathNode } | null {
  for (const course of path.courses) {
    for (const unit of course.units) {
      const node = unit.nodes.find((item) => item.id === nodeId);
      if (node) return { course, unit, node };
    }
  }
  return null;
}

export function findNodeByPracticeSet(
  path: Pick<StudyPath, "courses">,
  setId: string,
): PathNode | null {
  if (!setId) return null;
  return flattenNodes(path.courses).find((item) => item.practiceSetId === setId) ?? null;
}

export function findNodeBySheet(
  path: Pick<StudyPath, "courses">,
  sheetId: string,
): PathNode | null {
  if (!sheetId) return null;
  return flattenNodes(path.courses).find((item) => item.sheetId === sheetId) ?? null;
}

export function progressCounts(courses: PathCourse[]): { done: number; total: number } {
  const nodes = flattenNodes(courses);
  return {
    done: nodes.filter((item) => item.status === "done").length,
    total: nodes.length,
  };
}

export function pathBriefing(path: StudyPath): PathBriefing | null {
  const loc = findNode(path, path.currentNodeId);
  if (!loc) return null;
  const { done, total } = progressCounts(path.courses);
  const next = nextTodoAfter(path, path.currentNodeId);
  return {
    title: path.title,
    courseTitle: loc.course.title,
    nodeTitle: loc.node.title,
    teach: nodeTeach(loc.node),
    outcome: loc.node.outcome,
    done,
    total,
    courseCount: path.courses.length,
    started: pathIsStarted(path),
    kind: path.kind,
    nodeStatus: loc.node.status,
    nextTitle: next?.node.title,
    why: loc.node.why,
  };
}

export function pathIsStarted(path: Pick<StudyPath, "started">): boolean {
  return path.started !== false;
}

export function formatPathBriefing(briefing: PathBriefing): string {
  const brief = (briefing.teach || briefing.outcome || "").trim();
  const tutor = brief ? ` Tutor brief (do not dump this as an outline to the student): ${brief}` : "";
  const why = briefing.why?.trim() ? ` Why: ${briefing.why.trim()}` : "";
  if (briefing.started === false) {
    return `Draft study path "${briefing.title}" (${briefing.total} topics, ${briefing.courseCount} course(s)${briefing.kind === "review" ? ", exam-review" : ""}). It is NOT started. Do not teach yet. Do not call advance_path. They may ask to change the map — then call create_path again. If they say they are ready to start (დავიწყოთ / let's start / continue), call start_path — that opens a child thread; this chat stays free. Never write [artifact ...] in chat. Never dump the week list.`;
  }
  if (!briefing.inPathThread) {
    return `A study path "${briefing.title}" exists as an artifact in this project. This is the main chat — answer the user's request. Do not teach the path here. Do not dump the topic list. Do not call advance_path. If they want to start or reopen the plan, call start_path. Materials stay on the project.`;
  }
  const review =
    briefing.kind === "review"
      ? " This is exam review, not a course: retrieval first — one hint or a 3-line recap, then drill. Do not reteach the syllabus intro. Do not generate long notes unless they asked. create_practice only for memory-heavy theory (terms, lists, flags, formulas). If the materials are already problem-heavy, reuse those shapes with new numbers in chat — do not invent a 10-item MCQ because practice exists."
      : "";
  const nextHint = briefing.nextTitle
    ? ` You MAY hint "შემდეგი: ${briefing.nextTitle} — მზად ხარ?" when they look ready. Never dump the rest of the path.`
    : "";
  return `Active path thread. Current topic only: "${briefing.nodeTitle}" (${briefing.courseTitle}, ${briefing.done}/${briefing.total}, ${briefing.nodeStatus || "current"}).${tutor}${why}${review}${nextHint} If they asked something else, answer that request only — do not turn it into this lesson, and do not skip ahead. Otherwise explain THIS node like a capable assistant: short useful talk, a table and/or a listed block with a lead-in above the fence. This node only. Then wait. They may ask a question; if they do, answer it and stay. Do NOT pass \`question\` while explaining. Do not write a quiz, "Question:", or fill-in in the body. Continue / შემდეგი after the bite is a move-on offer (practice or one \`question\`) — not an auto-exam, not the next lecture. Call advance_path only when they look ready: practice/exam score, or they said გაიარე / next topic. NEVER advance on a greeting, thanks, or ok. NEVER "which tense/form would you use to describe…". NEVER "what is this called?". Never yes/no "did you get it?". Never create_path or restart_path. Never write [artifact ...] or card ids in chat. If they are lost, change the approach — do not repeat the same lecture. Do not list other nodes. create_sheet only if they asked. You MAY call suggest_sheet after the explanation. Never create_practice unless they asked or this unit is memory-heavy theory. Stay on this node until they move on.`;
}

function firstTodoInCourse(course: PathCourse): PathNode | null {
  return flattenCourseNodes(course).find((item) => item.status !== "done") ?? null;
}

function firstOpen(path: Pick<StudyPath, "courses">): { course: PathCourse; node: PathNode } | null {
  const nodes = path.courses.flatMap((course) =>
    flattenCourseNodes(course).map((node) => ({ course, node })),
  );
  if (nodes.length === 0) return null;
  return nodes.find((item) => item.node.status !== "done") ?? nodes[0];
}

/** Duolingo cursor: current is the first node that is not done. Fixes jumps into the middle. */
export function normalizePathProgress(path: StudyPath): StudyPath {
  const open = firstOpen(path);
  if (!open) return path;
  const loc = findNode(path, path.currentNodeId);
  if (
    path.currentNodeId === open.node.id &&
    path.currentCourseId === open.course.id &&
    (loc?.node.status === "current" || loc?.node.status === "ready")
  ) {
    return path;
  }
  return {
    ...path,
    currentCourseId: open.course.id,
    currentNodeId: open.node.id,
    courses: withStatuses(path.courses, open.node.id),
  };
}

export function restartPath(path: StudyPath): StudyPath {
  const first = path.courses[0]?.units[0]?.nodes[0];
  if (!first) return path;
  const cleared = path.courses.map((course) => ({
    ...course,
    units: course.units.map((unit) => ({
      ...unit,
      nodes: unit.nodes.map((node) => ({ ...node, status: "todo" as const })),
    })),
  }));
  return {
    ...path,
    currentCourseId: path.courses[0].id,
    currentNodeId: first.id,
    courses: withStatuses(cleared, first.id),
  };
}

function nextTodoAfter(path: Pick<StudyPath, "courses">, nodeId: string): { course: PathCourse; node: PathNode } | null {
  const nodes = path.courses.flatMap((course) =>
    flattenCourseNodes(course).map((node) => ({ course, node })),
  );
  const index = nodes.findIndex((item) => item.node.id === nodeId);
  const from = index >= 0 ? nodes.slice(index + 1) : nodes;
  return from.find((item) => item.node.status !== "done") ?? null;
}

function withStatuses(
  courses: PathCourse[],
  currentNodeId: string,
  extra?: (node: PathNode) => PathNode,
): PathCourse[] {
  return courses.map((course) => ({
    ...course,
    units: course.units.map((unit) => ({
      ...unit,
      nodes: unit.nodes.map((node) => {
        const next = extra ? extra(node) : node;
        if (next.id === currentNodeId && next.status !== "done") {
          if (next.status === "ready") return next;
          return { ...next, status: "current" as const };
        }
        if (next.status === "current" && next.id !== currentNodeId) {
          return { ...next, status: "todo" as const };
        }
        return next;
      }),
    })),
  }));
}

function realTitle(value?: string): string {
  const title = clipPathText(value || "", PATH_TITLE_MAX);
  return title && !isPlaceholderTitle(title) ? title : "";
}

function realTeach(...values: Array<string | undefined>): string {
  for (const value of values) {
    const text = clipPathText(value || "", PATH_TEACH_MAX);
    if (text) return text;
  }
  return "";
}

function asNode(
  raw: { title?: string; teach?: string; outcome?: string; why?: string; practiceSetId?: string | null },
  id: string,
): PathNode | null {
  const title = realTitle(raw.title);
  if (!title) return null;
  const teach = realTeach(raw.teach, raw.outcome);
  if (isMetaPathTitle(title, teach)) return null;
  const why = clipPathText(raw.why || "", PATH_WHY_MAX) || undefined;
  return {
    id,
    title,
    teach,
    outcome: clipPathText(raw.outcome || teach, PATH_OUTCOME_MAX),
    status: "todo",
    why,
    practiceSetId: raw.practiceSetId ?? null,
    sheetId: null,
  };
}

export function hydrateCourses(
  raw: Array<{
    title?: string;
    units?: Array<{
      title?: string;
      teach?: string;
      nodes?: Array<{ title?: string; teach?: string; outcome?: string; why?: string; practiceSetId?: string | null }>;
    }>;
  }>,
  options?: { maxNodes?: number },
): { courses: PathCourse[]; currentCourseId: string; currentNodeId: string } {
  const courses = raw
    .slice(0, PATH_MAX_COURSES)
    .map((course, ci) => {
      const units = (course.units ?? [])
        .slice(0, PATH_MAX_UNITS)
        .flatMap((unit, ui) => {
          const unitTitle = realTitle(unit.title);
          const nodes = (unit.nodes ?? [])
            .slice(0, PATH_MAX_NODES)
            .flatMap((node, ni) => {
              const next = asNode(node, `c${ci}u${ui}n${ni}`);
              return next ? [next] : [];
            });
          if (nodes.length > 0) {
            return [
              {
                id: `c${ci}u${ui}`,
                title: unitTitle && !isMetaPathTitle(unitTitle) ? unitTitle : nodes[0].title,
                nodes,
              },
            ];
          }
          if (!unitTitle || isMetaPathTitle(unitTitle, unit.teach)) return [];
          const leaf = asNode({ title: unitTitle, teach: unit.teach }, `c${ci}u${ui}n0`);
          return leaf ? [{ id: `c${ci}u${ui}`, title: unitTitle, nodes: [leaf] }] : [];
        });
      const courseTitle = realTitle(course.title) || units[0]?.title || "";
      return {
        id: `c${ci}`,
        title: courseTitle || `Course ${ci + 1}`,
        units,
      };
    })
    .filter((item) => item.units.length > 0);

  const limited = options?.maxNodes ? capCoursesToNodes(courses, options.maxNodes) : courses;
  const first = limited[0]?.units[0]?.nodes[0];
  const currentNodeId = first?.id ?? "";
  const currentCourseId = limited[0]?.id ?? "";
  return {
    courses: currentNodeId ? withStatuses(limited, currentNodeId) : limited,
    currentCourseId,
    currentNodeId,
  };
}

export function capCoursesToNodes(courses: PathCourse[], max: number): PathCourse[] {
  let left = Math.max(1, max);
  const next: PathCourse[] = [];
  for (const course of courses) {
    if (left <= 0) break;
    const units: PathUnit[] = [];
    for (const unit of course.units) {
      if (left <= 0) break;
      const nodes = unit.nodes.slice(0, left);
      left -= nodes.length;
      if (nodes.length) units.push({ ...unit, nodes });
    }
    if (units.length) next.push({ ...course, units });
  }
  return next;
}

export function setCurrentNode(path: StudyPath, nodeId: string): StudyPath {
  const loc = findNode(path, nodeId);
  if (!loc) return path;
  return {
    ...path,
    currentCourseId: loc.course.id,
    currentNodeId: loc.node.id,
    courses: withStatuses(path.courses, loc.node.id),
  };
}

export function setCurrentCourse(path: StudyPath, courseId: string): StudyPath {
  const course = findCourse(path, courseId);
  if (!course) return path;
  const node = firstTodoInCourse(course) ?? flattenCourseNodes(course).at(-1);
  if (!node) return path;
  return setCurrentNode(path, node.id);
}

export function markNodeDone(path: StudyPath, nodeId: string): StudyPath {
  const loc = findNode(path, nodeId);
  if (!loc) return path;
  if (nodeId !== path.currentNodeId) {
    return {
      ...path,
      courses: path.courses.map((course) => ({
        ...course,
        units: course.units.map((unit) => ({
          ...unit,
          nodes: unit.nodes.map((node) =>
            node.id === nodeId ? { ...node, status: "done" as const } : node,
          ),
        })),
      })),
    };
  }
  const marked = withStatuses(path.courses, nodeId, (node) =>
    node.id === nodeId ? { ...node, status: "done" } : node,
  );
  const next = nextTodoAfter({ courses: marked }, nodeId);
  const currentNodeId = next?.node.id ?? nodeId;
  const currentCourseId = next?.course.id ?? loc.course.id;
  return {
    ...path,
    currentCourseId,
    currentNodeId,
    courses: withStatuses(marked, currentNodeId, (node) =>
      node.id === nodeId ? { ...node, status: "done" } : node,
    ),
  };
}

export function markNodeReady(path: StudyPath, nodeId: string): StudyPath {
  const loc = findNode(path, nodeId);
  if (!loc) return path;
  if (loc.node.status === "done" || loc.node.status === "ready") return path;
  return {
    ...path,
    courses: path.courses.map((course) => ({
      ...course,
      units: course.units.map((unit) => ({
        ...unit,
        nodes: unit.nodes.map((node) =>
          node.id === nodeId && node.status !== "done" ? { ...node, status: "ready" as const } : node,
        ),
      })),
    })),
  };
}

export function bindPracticeSet(path: StudyPath, nodeId: string, setId: string): StudyPath {
  return bindNodeField(path, nodeId, "practiceSetId", setId);
}

export function bindSheet(path: StudyPath, nodeId: string, sheetId: string): StudyPath {
  return bindNodeField(path, nodeId, "sheetId", sheetId);
}

function bindNodeField(
  path: StudyPath,
  nodeId: string,
  field: "practiceSetId" | "sheetId",
  value: string,
): StudyPath {
  return {
    ...path,
    courses: path.courses.map((course) => ({
      ...course,
      units: course.units.map((unit) => ({
        ...unit,
        nodes: unit.nodes.map((node) => (node.id === nodeId ? { ...node, [field]: value } : node)),
      })),
    })),
  };
}

export function pathArtifactCount(path: Pick<StudyPath, "courses">): number {
  return progressCounts(path.courses).total;
}

export function pathSubtitle(path: StudyPath): string {
  const { done, total } = progressCounts(path.courses);
  const loc = findNode(path, path.currentNodeId);
  const topic = loc?.node.title;
  return topic ? `${done}/${total} · ${topic}` : `${done}/${total}`;
}

export function liveStudyPath(input: {
  title: string;
  courses: PathCourse[];
  id?: string;
  kind?: PathKind;
}): StudyPath {
  const first = input.courses[0];
  const firstNode = first?.units[0]?.nodes[0];
  return {
    id: input.id || "live",
    projectId: "",
    userId: "",
    title: input.title.trim() || "Path",
    kind: input.kind,
    courses: firstNode ? withStatuses(input.courses, firstNode.id) : input.courses,
    currentCourseId: first?.id ?? "",
    currentNodeId: firstNode?.id ?? "",
    started: false,
    sourceMaterialIds: [],
    createdAt: null,
    updatedAt: null,
  };
}
