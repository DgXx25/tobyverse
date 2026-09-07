import {
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { deleteUser, type User } from "firebase/auth";
import { COLLECTIONS, omitUndefined } from "@/lib/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { toIsoDate } from "@/lib/timestamps";
import {
  asUserPlan,
  asUserUsage,
  emptyUsage,
  utcWeekStart,
  type UsageCounter,
} from "@/lib/account/plan";
import type { UserProfile, UserUsage } from "@/types/user";

function userRef(userId: string) {
  return doc(getFirebaseDb(), COLLECTIONS.users, userId);
}

function mapProfile(id: string, data: Record<string, unknown>): UserProfile {
  const weekStart = utcWeekStart();
  return {
    id,
    displayName: typeof data.displayName === "string" ? data.displayName : null,
    email: typeof data.email === "string" ? data.email : null,
    photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
    plan: asUserPlan(data.plan),
    usage: asUserUsage(data.usage, weekStart),
    createdAt: toIsoDate(data.createdAt),
    updatedAt: toIsoDate(data.updatedAt),
  };
}

export async function ensureUserProfile(user: User): Promise<void> {
  const ref = userRef(user.uid);
  const snapshot = await getDoc(ref);
  const displayName = (user.displayName ?? null)?.slice(0, 120) ?? null;
  const email = (user.email ?? null)?.slice(0, 320) ?? null;
  const photoURL = (user.photoURL ?? null)?.slice(0, 2048) ?? null;

  if (!snapshot.exists()) {
    await setDoc(
      ref,
      omitUndefined({
        displayName,
        email,
        photoURL,
        plan: "free",
        usage: emptyUsage(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    return;
  }

  const data = snapshot.data();
  const patch: Record<string, unknown> = {
    displayName,
    email,
    photoURL,
    updatedAt: serverTimestamp(),
  };
  if (!("plan" in data) || data.plan == null) patch.plan = "free";
  if (!data.usage || typeof data.usage !== "object") patch.usage = emptyUsage();
  await updateDoc(ref, omitUndefined(patch));
}

export function subscribeUserProfile(
  userId: string,
  onChange: (profile: UserProfile | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    userRef(userId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onChange(null);
        return;
      }
      onChange(mapProfile(snapshot.id, snapshot.data()));
    },
    (error) => onError?.(error),
  );
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const snapshot = await getDoc(userRef(userId));
  if (!snapshot.exists()) return null;
  return mapProfile(snapshot.id, snapshot.data());
}

async function writeUsage(userId: string, mutate: (usage: UserUsage) => UserUsage): Promise<void> {
  const ref = userRef(userId);
  await runTransaction(getFirebaseDb(), async (tx) => {
    const snapshot = await tx.get(ref);
    const weekStart = utcWeekStart();
    const data = snapshot.data() ?? {};
    const usage = mutate(asUserUsage(data.usage, weekStart));
    if (!snapshot.exists()) {
      tx.set(
        ref,
        omitUndefined({
          plan: "free",
          usage,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
      return;
    }
    tx.update(ref, { usage, updatedAt: serverTimestamp() });
  });
}

export async function incrementUsage(userId: string, field: UsageCounter): Promise<void> {
  if (!userId) return;
  try {
    await writeUsage(userId, (usage) => ({ ...usage, [field]: usage[field] + 1 }));
  } catch {
    // Usage must never block chat, practice, or notes.
  }
}

export async function adjustStorageBytes(userId: string, delta: number): Promise<void> {
  if (!userId || !delta) return;
  try {
    await writeUsage(userId, (usage) => ({
      ...usage,
      storageBytes: Math.max(0, usage.storageBytes + Math.floor(delta)),
    }));
  } catch {
    // Storage totals are display-only.
  }
}

export async function exportAccountMetadata(userId: string): Promise<Record<string, unknown>> {
  const { listProjectsForUser } = await import("@/lib/projects");
  const [profile, projects] = await Promise.all([getUserProfile(userId), listProjectsForUser(userId)]);
  return {
    exportedAt: new Date().toISOString(),
    user: profile
      ? {
          id: profile.id,
          displayName: profile.displayName,
          email: profile.email,
          plan: profile.plan,
          usage: profile.usage,
          createdAt: profile.createdAt,
        }
      : { id: userId },
    projects: projects.map((project) => ({
      id: project.id,
      title: project.title,
      goal: project.goal,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    })),
  };
}

export async function deleteAccountData(user: User): Promise<void> {
  const { deleteProject, listProjectsForUser } = await import("@/lib/projects");
  const projects = await listProjectsForUser(user.uid);
  for (const project of projects) {
    await deleteProject(project.id, user.uid);
  }
  await deleteDoc(userRef(user.uid)).catch(() => undefined);
  await deleteUser(user);
}
