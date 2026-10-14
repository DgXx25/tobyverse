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
  FREE_CAPS,
  storageQuotaMessage,
  storageInsufficientMessage,
  utcWeekStart,
  wouldExceedStorage,
  type UsageCounter,
} from "@/lib/account/plan";
import { isKnownAiModel, parsePreferredModel, type AiModelId } from "@/lib/ai/catalog";
import { isAccentId, isThemeId, parseThemeAccents, readStoredTheme, readStoredThemeAccents, type ThemeAccents, type ThemeId } from "@/lib/workspace/theme";
import type { UserProfile, UserUsage } from "@/types/user";
import { CHAT_MODES, type ChatMode } from "@/types/chat";

function isChatMode(value: unknown): value is ChatMode {
  return typeof value === "string" && (CHAT_MODES as readonly string[]).includes(value);
}

export class StorageQuotaError extends Error {
  constructor(message = storageQuotaMessage()) {
    super(message);
    this.name = "StorageQuotaError";
  }
}

function quotaMessage(used: number, extra: number): string {
  const remaining = Math.max(0, FREE_CAPS.storageBytes - used);
  return storageInsufficientMessage(remaining, extra);
}

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
    admin: data.admin === true || (typeof data.email === "string" && data.email.toLowerCase() === "davit.gvakharia@gmail.com"),
    usage: asUserUsage(data.usage, weekStart),
    preferredModel: parsePreferredModel(data.preferredModel),
    chatMode: isChatMode(data.chatMode) ? data.chatMode : null,
    theme: isThemeId(data.theme) ? data.theme : null,
    themeAccents: parseThemeAccents(data.themeAccents),
    highContrast: data.highContrast === true,
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
        theme: readStoredTheme(),
        themeAccents: readStoredThemeAccents(),
        highContrast: false,
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
  if (!isThemeId(data.theme)) patch.theme = readStoredTheme();
  if (!data.themeAccents || typeof data.themeAccents !== "object") patch.themeAccents = readStoredThemeAccents();
  if (typeof data.highContrast !== "boolean") patch.highContrast = false;
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

export async function updatePreferredModel(userId: string, model: AiModelId): Promise<void> {
  if (!userId || !isKnownAiModel(model)) return;
  try {
    await updateDoc(userRef(userId), {
      preferredModel: model,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Preference writes must never block the composer.
  }
}

export async function updateUserChatMode(userId: string, mode: ChatMode): Promise<void> {
  if (!userId || !isChatMode(mode)) return;
  try {
    await updateDoc(userRef(userId), { chatMode: mode, updatedAt: serverTimestamp() });
  } catch {
    // Preference writes must never block the composer.
  }
}

export async function updateUserTheme(userId: string, theme: ThemeId): Promise<void> {
  if (!userId || !isThemeId(theme)) return;
  try {
    await updateDoc(userRef(userId), {
      theme,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Theme writes must never block the picker.
  }
}

export async function incrementUsage(userId: string, field: UsageCounter): Promise<void> {
  if (!userId) return;
  try {
    await writeUsage(userId, (usage) => ({ ...usage, [field]: usage[field] + 1 }));
  } catch {
    // Usage must never block chat, practice, or notes.
  }
}

export async function reserveStorageBytes(userId: string, bytes: number): Promise<void> {
  if (!userId) return;
  const extra = Math.floor(bytes);
  if (extra <= 0) return;
  try {
    await writeUsage(userId, (usage) => {
      if (wouldExceedStorage(usage.storageBytes, extra)) {
        throw new StorageQuotaError(quotaMessage(usage.storageBytes, extra));
      }
      return { ...usage, storageBytes: usage.storageBytes + extra };
    });
  } catch (error) {
    if (error instanceof StorageQuotaError) throw error;
    throw error instanceof Error ? error : new Error("Could not reserve storage.");
  }
}

export async function updateUserAppearance(userId: string, input: { themeAccents?: ThemeAccents; highContrast?: boolean }): Promise<void> {
  if (!userId) return;
  const themeAccents = input.themeAccents;
  if (themeAccents && (!isAccentId(themeAccents.light) || !isAccentId(themeAccents.dark))) return;
  if (input.highContrast !== undefined && typeof input.highContrast !== "boolean") return;
  try {
    await updateDoc(userRef(userId), { ...input, updatedAt: serverTimestamp() });
  } catch {
    // Appearance writes must never block the app.
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
    // Releases must never block deletes.
  }
}

export async function exportAccountMetadata(userId: string): Promise<Record<string, unknown>> {
  const { listProjectsForUser } = await import("@/lib/projects");
  const { listMemories } = await import("@/lib/memory/store");
  const { getLearningProfile } = await import("@/lib/memory/profile");
  const [profile, projects, memories, learningProfile] = await Promise.all([
    getUserProfile(userId),
    listProjectsForUser(userId),
    listMemories(userId).catch(() => []),
    getLearningProfile(userId).catch(() => ""),
  ]);
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
    memories: memories.map((item) => ({
      id: item.id,
      content: item.content,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    learningProfile: learningProfile || null,
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
  const { deleteAllMemories } = await import("@/lib/memory/store");
  const { deleteLearningProfile } = await import("@/lib/memory/profile");
  const projects = await listProjectsForUser(user.uid);
  for (const project of projects) {
    await deleteProject(project.id, user.uid);
  }
  await deleteAllMemories(user.uid).catch(() => undefined);
  await deleteLearningProfile(user.uid).catch(() => undefined);
  await deleteDoc(userRef(user.uid)).catch(() => undefined);
  await deleteUser(user);
}
