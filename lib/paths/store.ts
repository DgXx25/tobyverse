import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { COLLECTIONS, omitUndefined } from "@/lib/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { asString, toIsoDate } from "@/lib/timestamps";
import { normalizePathProgress } from "@/lib/paths/model";
import type { PathCourse, PathKind, PathNodeStatus, StudyPath } from "@/types/path";

function pathsRef(projectId: string) {
  return collection(getFirebaseDb(), COLLECTIONS.projects, projectId, COLLECTIONS.paths);
}

function asNodeStatus(value: unknown): PathNodeStatus {
  return value === "current" || value === "ready" || value === "done" ? value : "todo";
}

function mapCourses(courses: PathCourse[]): PathCourse[] {
  return courses.map((course) => ({
    ...course,
    units: (course.units ?? []).map((unit) => ({
      ...unit,
      nodes: (unit.nodes ?? []).map((node) => ({
        ...node,
        teach: (node.teach || node.outcome || "").trim(),
        outcome: node.outcome || node.teach || "",
        why: typeof node.why === "string" ? node.why.trim() || undefined : undefined,
        status: asNodeStatus(node.status),
      })),
    })),
  }));
}

function mapPath(id: string, projectId: string, data: Record<string, unknown>): StudyPath | null {
  const courses = mapCourses(Array.isArray(data.courses) ? (data.courses as PathCourse[]) : []);
  if (courses.length === 0) return null;
  const currentCourseId =
    typeof data.currentCourseId === "string" && data.currentCourseId
      ? data.currentCourseId
      : courses[0]?.id ?? "";
  const currentNodeId =
    typeof data.currentNodeId === "string" && data.currentNodeId
      ? data.currentNodeId
      : courses[0]?.units[0]?.nodes[0]?.id ?? "";
  const raw: StudyPath = {
    id,
    projectId,
    userId: asString(data.userId),
    title: asString(data.title, "Path"),
    kind: data.kind === "review" ? "review" : data.kind === "course" ? "course" : undefined,
    courses,
    currentCourseId,
    currentNodeId,
    started: data.started !== false,
    threadId: typeof data.threadId === "string" ? data.threadId : null,
    sourceMaterialIds: Array.isArray(data.sourceMaterialIds)
      ? data.sourceMaterialIds.filter((item): item is string => typeof item === "string")
      : [],
    createdAt: toIsoDate(data.createdAt),
    updatedAt: toIsoDate(data.updatedAt) ?? toIsoDate(data.createdAt),
  };
  return normalizePathProgress(raw);
}

function newestFirst(items: StudyPath[]): StudyPath[] {
  return [...items].sort((a, b) => (b.updatedAt ?? b.createdAt ?? "").localeCompare(a.updatedAt ?? a.createdAt ?? ""));
}

export async function listStudyPaths(projectId: string): Promise<StudyPath[]> {
  const snapshot = await getDocs(pathsRef(projectId));
  return newestFirst(
    snapshot.docs.flatMap((item) => {
      const mapped = mapPath(item.id, projectId, item.data());
      return mapped ? [mapped] : [];
    }),
  );
}

export async function getLatestPath(projectId: string): Promise<StudyPath | null> {
  const items = await listStudyPaths(projectId);
  return items[0] ?? null;
}

export function subscribeStudyPaths(
  projectId: string,
  onChange: (items: StudyPath[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    pathsRef(projectId),
    (snapshot) => {
      const items = newestFirst(
        snapshot.docs.flatMap((item) => {
          const data = item.data() as Record<string, unknown>;
          const mapped = mapPath(item.id, projectId, data);
          if (mapped) {
            const rawId = typeof data.currentNodeId === "string" ? data.currentNodeId : "";
            const statusCurrent = Array.isArray(data.courses)
              ? (data.courses as PathCourse[])
                  .flatMap((course) => course.units.flatMap((unit) => unit.nodes))
                  .find((node) => node.status === "current")?.id
              : undefined;
            if (rawId !== mapped.currentNodeId || (statusCurrent && statusCurrent !== mapped.currentNodeId)) {
              void patchStudyPath(projectId, mapped.id, {
                courses: mapped.courses,
                currentCourseId: mapped.currentCourseId,
                currentNodeId: mapped.currentNodeId,
              });
            }
          }
          return mapped ? [mapped] : [];
        }),
      );
      onChange(items);
    },
    (error) => onError?.(error),
  );
}

export async function saveStudyPath(input: {
  projectId: string;
  userId: string;
  title: string;
  courses: PathCourse[];
  currentCourseId: string;
  currentNodeId: string;
  sourceMaterialIds: string[];
  started?: boolean;
  kind?: PathKind;
}): Promise<string> {
  const existing = await getLatestPath(input.projectId);
  const started = input.started ?? existing?.started ?? false;
  const payload = omitUndefined({
    projectId: input.projectId,
    userId: input.userId,
    title: input.title.trim() || "Path",
    kind: input.kind ?? existing?.kind,
    courses: input.courses,
    currentCourseId: input.currentCourseId,
    currentNodeId: input.currentNodeId,
    started,
    sourceMaterialIds: input.sourceMaterialIds ?? [],
    updatedAt: serverTimestamp(),
  });
  if (existing) {
    await updateDoc(doc(pathsRef(input.projectId), existing.id), payload);
    return existing.id;
  }
  const ref = await addDoc(
    pathsRef(input.projectId),
    omitUndefined({
      ...payload,
      createdAt: serverTimestamp(),
    }),
  );
  return ref.id;
}

export async function patchStudyPath(
  projectId: string,
  pathId: string,
  patch: Partial<Pick<StudyPath, "title" | "courses" | "currentCourseId" | "currentNodeId" | "started" | "kind" | "threadId">>,
): Promise<void> {
  await updateDoc(
    doc(pathsRef(projectId), pathId),
    omitUndefined({
      ...patch,
      updatedAt: serverTimestamp(),
    }),
  );
}
