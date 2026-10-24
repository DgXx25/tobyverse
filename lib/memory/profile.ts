import { deleteDoc, doc, getDoc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { COLLECTIONS } from "@/lib/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { sanitizePersonalization } from "@/lib/memory/normalize";
import { authHeaders } from "@/lib/api/client";

function learningRef(userId: string) {
  return doc(getFirebaseDb(), COLLECTIONS.users, userId, COLLECTIONS.profile, "learning");
}

function localKey(userId: string) {
  return `tobyverse.learning.${userId}`;
}

type LocalListener = (text: string) => void;
const localListeners = new Map<string, Set<LocalListener>>();
const localProfiles = new Map<string, string>();
let watchingStorage = false;

function watchProfileStorage() {
  if (watchingStorage || typeof window === "undefined") return;
  watchingStorage = true;
  window.addEventListener("storage", event => {
    if (event.key === null) {
      localProfiles.forEach((_text, userId) => localProfiles.set(userId, ""));
      localListeners.forEach((listeners, userId) => {
        localProfiles.set(userId, "");
        listeners.forEach(listener => listener(""));
      });
      return;
    }
    const prefix = "tobyverse.learning.";
    if (!event.key.startsWith(prefix)) return;
    const userId = event.key.slice(prefix.length);
    const text = sanitizePersonalization(event.newValue);
    localProfiles.set(userId, text);
    localListeners.get(userId)?.forEach(listener => listener(text));
  });
}

export function cachedLearningProfile(userId: string, fallback = ""): string {
  if (typeof window === "undefined" || !userId) return "";
  watchProfileStorage();
  if (localProfiles.has(userId)) return localProfiles.get(userId)!;
  try {
    const stored = window.localStorage.getItem(localKey(userId));
    return sanitizePersonalization(stored ?? fallback);
  } catch {
    return sanitizePersonalization(fallback);
  }
}

const readLocal = cachedLearningProfile;

function writeLocal(userId: string, text: string) {
  if (typeof window === "undefined" || !userId) return;
  watchProfileStorage();
  localProfiles.set(userId, text);
  try {
    if (!text) window.localStorage.removeItem(localKey(userId));
    else window.localStorage.setItem(localKey(userId), text);
  } catch {
    /* quota / private mode */
  }
}

function notifyLocal(userId: string, text: string) {
  writeLocal(userId, text);
  localListeners.get(userId)?.forEach((fn) => fn(text));
}

function watchLocal(userId: string, onChange: LocalListener): () => void {
  watchProfileStorage();
  const bucket = localListeners.get(userId) ?? new Set<LocalListener>();
  bucket.add(onChange);
  localListeners.set(userId, bucket);
  return () => {
    bucket.delete(onChange);
  };
}

async function writeRemote(userId: string, text: string): Promise<void> {
  if (!userId) return;
  const response = await fetch("/api/memory", { method: "PATCH", headers: await authHeaders(), body: JSON.stringify({ personalization: text }) });
  if (!response.ok) throw new Error("Could not save memory preferences.");
}

export function clearCachedLearningProfile(userId: string): void { notifyLocal(userId, ""); }

export async function getLearningProfile(userId: string): Promise<string> {
  if (!userId) return "";
  try {
    const snapshot = await getDoc(learningRef(userId));
    const remote = snapshot.exists() ? sanitizePersonalization(snapshot.data()?.text) : "";
    if (remote) {
      writeLocal(userId, remote);
      return remote;
    }
    notifyLocal(userId, "");
    return "";
  } catch {
    return readLocal(userId);
  }
}

export function subscribeLearningProfile(
  userId: string,
  onChange: (text: string) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const stopLocal = watchLocal(userId, onChange);
  onChange(readLocal(userId));
  const stopRemote = onSnapshot(
    learningRef(userId),
    (snapshot) => {
      const remote = snapshot.exists() ? sanitizePersonalization(snapshot.data()?.text) : "";
      if (remote) {
        writeLocal(userId, remote);
        onChange(remote);
        return;
      }
      writeLocal(userId, "");
      onChange("");
    },
    (error) => {
      onChange(readLocal(userId));
      if (!readLocal(userId)) onError?.(error);
    },
  );
  return () => {
    stopLocal();
    stopRemote();
  };
}

export async function setLearningProfile(userId: string, raw: string): Promise<string> {
  if (!userId) return "";
  const text = sanitizePersonalization(raw);
  await writeRemote(userId, text);
  // Preferences now live as individual facts in the personal summary.
  notifyLocal(userId, "");
  return text;
}

export async function deleteLearningProfile(userId: string): Promise<void> {
  if (!userId) return;
  notifyLocal(userId, "");
  await deleteDoc(learningRef(userId)).catch(() => undefined);
}
