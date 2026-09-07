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
  type Unsubscribe,
} from "firebase/firestore";
import { deleteChatMessages, ensureChatThread } from "@/lib/chats";
import { trackEvent } from "@/lib/analytics/track";
import { preferredChatModeForGoal } from "@/lib/core/chat-modes";
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

function asGoal(value: unknown): ProjectGoal {
  if (typeof value === "string" && (PROJECT_GOALS as readonly string[]).includes(value)) {
    return value as ProjectGoal;
  }

  return DEFAULT_PROJECT_GOAL;
}

function asChatMode(value: unknown, goal: ProjectGoal): ChatMode {
  if (value === "normal" || value === "socratic") {
    return value;
  }

  return preferredChatModeForGoal(goal);
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
  const fallbackTitle = row.kind === "practice_set" ? "Practice set" : row.kind === "study_sheet" ? "Notes" : row.kind;
  return {
    kind: row.kind.trim(),
    id: row.id,
    status,
    title: asString(row.title, fallbackTitle),
    count: typeof row.count === "number" ? row.count : undefined,
    ids: Array.isArray(row.ids) ? row.ids.filter((item): item is string => typeof item === "string") : undefined,
  };
}

function mapProject(id: string, data: Record<string, unknown>): Project {
  const goal = asGoal(data.goal);

  return {
    id,
    title: asString(data.title) || asString(data.name, "Untitled"),
    description: asString(data.description),
    userId: asString(data.userId) || asString(data.ownerId),
    goal,
    recipe: asRecipe(data.recipe, goal),
    preferredChatMode: asChatMode(data.preferredChatMode, goal),
    activeArtifact: asActiveArtifact(data.activeArtifact),
    createdAt: toIsoDate(data.createdAt),
    updatedAt: toIsoDate(data.updatedAt),
  };
}

function uniqueProjects(projects: Project[]): Project[] {
  const seen = new Map<string, Project>();

  for (const project of projects) {
    seen.set(project.id, project);
  }

  return [...seen.values()].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function listProjectsForUser(userId: string): Promise<Project[]> {
  const db = getFirebaseDb();
  const projects = collection(db, COLLECTIONS.projects);

  const [byUserId, byOwnerId] = await Promise.all([
    getDocs(query(projects, where("userId", "==", userId))),
    getDocs(query(projects, where("ownerId", "==", userId))),
  ]);

  return uniqueProjects([
    ...byUserId.docs.map((item) => mapProject(item.id, item.data())),
    ...byOwnerId.docs.map((item) => mapProject(item.id, item.data())),
  ]);
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
  await setDoc(ref, {
    title: input.title.trim(),
    description: (input.description ?? "").trim(),
    userId: input.userId,
    goal,
    recipe: recipeForGoal(goal),
    preferredChatMode: preferredChatModeForGoal(goal),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await ensureChatThread({
    projectId: ref.id,
    userId: input.userId,
    mode: preferredChatModeForGoal(goal),
  });

  trackEvent({
    userId: input.userId,
    projectId: ref.id,
    type: "project_created",
  });

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
}

export function subscribeProjectsForUser(
  userId: string,
  onChange: (projects: Project[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getFirebaseDb();
  const projects = collection(db, COLLECTIONS.projects);
  let byUserId: Project[] = [];
  let byOwnerId: Project[] = [];

  const emit = () => onChange(uniqueProjects([...byUserId, ...byOwnerId]));

  const unsubUser = onSnapshot(
    query(projects, where("userId", "==", userId)),
    (snapshot) => {
      byUserId = snapshot.docs.map((item) => mapProject(item.id, item.data()));
      emit();
    },
    (error) => onError?.(error),
  );

  const unsubOwner = onSnapshot(
    query(projects, where("ownerId", "==", userId)),
    (snapshot) => {
      byOwnerId = snapshot.docs.map((item) => mapProject(item.id, item.data()));
      emit();
    },
    (error) => onError?.(error),
  );

  return () => {
    unsubUser();
    unsubOwner();
  };
}

export async function deleteProject(projectId: string, userId: string): Promise<void> {
  await getOwnedProject(projectId, userId);
  const [materials, sheets, exercises] = await Promise.all([
    listMaterials(projectId),
    listStudySheets(projectId),
    listExercises(projectId),
  ]);
  await Promise.all([
    deleteChatMessages(projectId),
    ...materials.map((item) => removeMaterial(item)),
    ...sheets.map((item) => deleteStudySheet(projectId, item.id)),
    ...exercises.map((item) => deleteExercise(projectId, item.id)),
  ]);
  await deleteDoc(doc(getFirebaseDb(), COLLECTIONS.projects, projectId));
}
