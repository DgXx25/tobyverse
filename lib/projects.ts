import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { deleteAllChatThreads, ensureChatThread } from "@/lib/chats";
import { asProjectMemory, mergeProjectMemory } from "@/lib/memory/project";
import { asChatMode, preferredChatModeForGoal } from "@/lib/core/chat-modes";
import { DEFAULT_PROJECT_GOAL } from "@/lib/core/constants";
import { recipeForGoal } from "@/lib/core/recipes";
import { COLLECTIONS, omitUndefined } from "@/lib/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { listMaterials, removeMaterial } from "@/lib/materials";
import { deleteStudySheet, listStudySheets } from "@/lib/study-sheets";
import { deleteExercise, listExercises } from "@/lib/exercises";
import { asString, toIsoDate } from "@/lib/timestamps";
import { PROJECT_GOALS, type ActiveArtifact, type CreateProjectInput, type Project, type ProjectGoal } from "@/types";
import type { ChatMode } from "@/types/chat";
import type { LessonRecipe } from "@/types/lesson";
import { clearUntouchedNotebook } from "@/lib/workspace/draft-notebook";

function asGoal(value: unknown): ProjectGoal {
  if (typeof value === "string" && (PROJECT_GOALS as readonly string[]).includes(value)) {
    return value as ProjectGoal;
  }

  return DEFAULT_PROJECT_GOAL;
}

function projectChatMode(value: unknown, goal: ProjectGoal): ChatMode {
  return asChatMode(value, preferredChatModeForGoal(goal));
}

function asRecipe(value: unknown, goal: ProjectGoal): LessonRecipe {
  if (value && typeof value === "object") {
    const recipe = value as Partial<LessonRecipe>;
    const fallback = recipeForGoal(goal);

    return {
      id: asString(recipe.id, fallback.id),
      goal,
      theoryCount: typeof recipe.theoryCount === "number" ? recipe.theoryCount : fallback.theoryCount,
      problemCount: typeof recipe.problemCount === "number" ? recipe.problemCount : fallback.problemCount,
      essayCount: typeof recipe.essayCount === "number" ? recipe.essayCount : fallback.essayCount,
      theoryTypes: Array.isArray(recipe.theoryTypes) ? recipe.theoryTypes : fallback.theoryTypes,
      problemTypes: Array.isArray(recipe.problemTypes) ? recipe.problemTypes : fallback.problemTypes,
    };
  }

  return recipeForGoal(goal);
}

function asActiveArtifact(value: unknown): ActiveArtifact | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.kind !== "string" || !row.kind.trim() || typeof row.id !== "string" || !row.id) return null;
  const status =
    row.status === "open" || row.status === "in_progress" || row.status === "ready" ? row.status : "ready";
  const fallbackTitle = row.kind === "practice_set" ? "Quiz" : row.kind === "study_sheet" ? "Notes" : row.kind;
  return {
    kind: row.kind.trim(),
    id: row.id,
    status,
    title: asString(row.title, fallbackTitle),
    count: typeof row.count === "number" ? row.count : undefined,
    ids: Array.isArray(row.ids) ? row.ids.filter((item): item is string => typeof item === "string") : undefined,
  };
}

export function mapProject(id: string, data: Record<string, unknown>): Project {
  const goal = asGoal(data.goal);

  return {
    id,
    title: asString(data.title) || asString(data.name, "Untitled"),
    description: asString(data.description),
    userId: asString(data.userId) || asString(data.ownerId),
    goal,
    recipe: asRecipe(data.recipe, goal),
    preferredChatMode: projectChatMode(data.preferredChatMode, goal),
    activeArtifact: asActiveArtifact(data.activeArtifact),
    projectMemory: asProjectMemory(data.projectMemory),
    listed: data.listed === true,
    icon: asString(data.icon) || undefined,
    iconColor: asString(data.iconColor) || undefined,
    folder: asString(data.folder) || undefined,
    hidden: data.hidden === true,
    createdAt: toIsoDate(data.createdAt),
    updatedAt: toIsoDate(data.updatedAt),
  };
}

function uniqueProjects(projects: Project[]): Project[] {
  const seen = new Map<string, Project>();

  for (const project of projects) {
    seen.set(project.id, project);
  }

  return [...seen.values()]
    .filter((project) => !project.hidden)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function listProjectsForUser(userId: string): Promise<Project[]> {
  const snapshot = await getDocs(
    query(collection(getFirebaseDb(), COLLECTIONS.projects), where("userId", "==", userId)),
  );

  return uniqueProjects(snapshot.docs.map((item) => mapProject(item.id, item.data())));
}

export async function getProjectById(id: string): Promise<Project | null> {
  const snapshot = await getDoc(doc(getFirebaseDb(), COLLECTIONS.projects, id));

  if (!snapshot.exists()) {
    return null;
  }

  return mapProject(snapshot.id, snapshot.data());
}

export function reserveProjectId(): string {
  return doc(collection(getFirebaseDb(), COLLECTIONS.projects)).id;
}

export async function createProject(input: CreateProjectInput): Promise<string> {
  const goal = asGoal(input.goal);
  const projects = collection(getFirebaseDb(), COLLECTIONS.projects);
  const ref = input.id ? doc(projects, input.id) : doc(projects);
  const listed = input.listed === true;
  await setDoc(ref, {
    title: input.title.trim(),
    description: (input.description ?? "").trim(),
    userId: input.userId,
    goal,
    recipe: recipeForGoal(goal),
    preferredChatMode: asChatMode(input.preferredChatMode, preferredChatModeForGoal(goal)),
    projectMemory: [],
    listed,
    ...(input.icon ? { icon: input.icon } : {}),
    ...(input.folder?.trim() ? { folder: input.folder.trim().slice(0, 40) } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (input.createThread !== false) {
    await ensureChatThread({
      projectId: ref.id,
      userId: input.userId,
      mode: asChatMode(input.preferredChatMode, preferredChatModeForGoal(goal)),
      created: true,
    });
  }

  return ref.id;
}

export function assertProjectOwner(project: Project, userId: string): void {
  if (project.userId !== userId) {
    throw new Error("You do not have access to this project.");
  }
}

export async function getOwnedProject(projectId: string, userId: string): Promise<Project> {
  const project = await getProjectById(projectId);

  if (!project) {
    throw new Error("Project not found.");
  }

  assertProjectOwner(project, userId);
  return project;
}

export async function updateProjectChatMode(
  projectId: string,
  userId: string,
  mode: ChatMode,
): Promise<void> {
  await getOwnedProject(projectId, userId);
  await updateDoc(doc(getFirebaseDb(), COLLECTIONS.projects, projectId), {
    preferredChatMode: mode,
    updatedAt: serverTimestamp(),
  });
  clearUntouchedNotebook(projectId);
}

export async function updateProjectTitle(
  projectId: string,
  userId: string,
  title: string,
): Promise<void> {
  await getOwnedProject(projectId, userId);
  const next = title.trim();
  if (!next) return;
  await updateDoc(doc(getFirebaseDb(), COLLECTIONS.projects, projectId), {
    title: next,
    updatedAt: serverTimestamp(),
  });
  clearUntouchedNotebook(projectId);
}

/** Symbol and folder are plain fields the notebook home edits. Empty string clears them. */
export async function updateProjectMeta(
  projectId: string,
  userId: string,
  patch: { icon?: string; iconColor?: string; folder?: string },
): Promise<void> {
  await getOwnedProject(projectId, userId);
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.icon !== undefined) payload.icon = patch.icon.trim().slice(0, 80);
  if (patch.iconColor !== undefined) payload.iconColor = patch.iconColor.trim().slice(0, 7);
  if (patch.folder !== undefined) payload.folder = patch.folder.trim().slice(0, 40);
  await updateDoc(doc(getFirebaseDb(), COLLECTIONS.projects, projectId), payload);
  clearUntouchedNotebook(projectId);
}

export async function updateProjectMemory(
  projectId: string,
  userId: string,
  lines: string[],
): Promise<string[]> {
  await getOwnedProject(projectId, userId);
  const projectMemory = asProjectMemory(lines);
  await updateDoc(doc(getFirebaseDb(), COLLECTIONS.projects, projectId), {
    projectMemory,
    updatedAt: serverTimestamp(),
  });
  clearUntouchedNotebook(projectId);
  return projectMemory;
}

export async function appendProjectMemory(
  projectId: string,
  userId: string,
  additions: string[],
): Promise<string[]> {
  const project = await getOwnedProject(projectId, userId);
  const projectMemory = mergeProjectMemory(project.projectMemory, additions);
  if (projectMemory.length === project.projectMemory.length) return projectMemory;
  await updateDoc(doc(getFirebaseDb(), COLLECTIONS.projects, projectId), {
    projectMemory,
    updatedAt: serverTimestamp(),
  });
  clearUntouchedNotebook(projectId);
  return projectMemory;
}

export async function updateProjectGoal(
  projectId: string,
  userId: string,
  goal: ProjectGoal,
): Promise<void> {
  await getOwnedProject(projectId, userId);
  const next = asGoal(goal);
  await updateDoc(doc(getFirebaseDb(), COLLECTIONS.projects, projectId), {
    goal: next,
    recipe: recipeForGoal(next),
    updatedAt: serverTimestamp(),
  });
  clearUntouchedNotebook(projectId);
}

export async function updateProjectActiveArtifact(
  projectId: string,
  userId: string,
  active: ActiveArtifact | null,
): Promise<void> {
  await getOwnedProject(projectId, userId);
  await updateDoc(
    doc(getFirebaseDb(), COLLECTIONS.projects, projectId),
    omitUndefined({
      activeArtifact: active,
      updatedAt: serverTimestamp(),
    }),
  );
  clearUntouchedNotebook(projectId);
}

export function subscribeProjectsForUser(
  userId: string,
  onChange: (projects: Project[]) => void,
  onError?: (error: Error) => void,
  options: { waitForServer?: boolean } = {},
): Unsubscribe {
  return onSnapshot(
    query(collection(getFirebaseDb(), COLLECTIONS.projects), where("userId", "==", userId)),
    options.waitForServer ? { includeMetadataChanges: true } : {},
    (snapshot) => {
      if (options.waitForServer && snapshot.metadata.fromCache) return;
      onChange(uniqueProjects(snapshot.docs.map((item) => mapProject(item.id, item.data()))));
    },
    (error) => onError?.(error),
  );
}

export async function deleteProject(projectId: string, userId: string): Promise<void> {
  await getOwnedProject(projectId, userId);
  const [materials, sheets, exercises] = await Promise.all([
    listMaterials(projectId),
    listStudySheets(projectId),
    listExercises(projectId),
  ]);
  await Promise.all([
    deleteAllChatThreads(projectId),
    ...materials.map((item) => removeMaterial(item)),
    ...sheets.map((item) => deleteStudySheet(projectId, item.id)),
    ...exercises.map((item) => deleteExercise(projectId, item.id)),
  ]);
  // These project-owned records have no files and must not be orphaned by notebook deletion.
  const metadata = await Promise.all(["sourceFolders", "artifactTitles"].map(name => getDocs(collection(getFirebaseDb(), COLLECTIONS.projects, projectId, name))));
  for (const snapshot of metadata) {
    for (let offset = 0; offset < snapshot.docs.length; offset += 400) {
      const batch = writeBatch(getFirebaseDb());
      snapshot.docs.slice(offset, offset + 400).forEach(item => batch.delete(item.ref));
      await batch.commit();
    }
  }
  await deleteDoc(doc(getFirebaseDb(), COLLECTIONS.projects, projectId));
  clearUntouchedNotebook(projectId);
}

export async function markProjectHidden(projectId: string, userId: string): Promise<void> {
  await getOwnedProject(projectId, userId);
  await updateDoc(doc(getFirebaseDb(), COLLECTIONS.projects, projectId), {
    hidden: true,
    updatedAt: serverTimestamp(),
  });
}

const DISCARDED_PROJECTS_KEY = "tv.discarded-projects";
export const PROJECT_DISCARDED_EVENT = "tv:project-discarded";

export function rememberDiscardedProject(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    const current = listDiscardedProjectIds();
    current.add(projectId);
    window.sessionStorage.setItem(DISCARDED_PROJECTS_KEY, JSON.stringify([...current]));
    window.dispatchEvent(new CustomEvent(PROJECT_DISCARDED_EVENT, { detail: projectId }));
  } catch {
    /* private mode */
  }
}

export function listDiscardedProjectIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(DISCARDED_PROJECTS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === "string" && item.length > 0));
  } catch {
    return new Set();
  }
}
