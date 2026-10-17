import { deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from "firebase/firestore";
import { COLLECTIONS, omitUndefined } from "@/lib/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { sanitizePersonalization } from "@/lib/memory/normalize";

function learningRef(userId: string) {
  return doc(getFirebaseDb(), COLLECTIONS.users, userId, COLLECTIONS.profile, "learning");
}

function localKey(userId: string) {
  return `tobyverse.learning.${userId}`;
}

type LocalListener = (text: string) => void;
const localListeners = new Map<string, Set<LocalListener>>();

export function cachedLearningProfile(userId: string): string {
  if (typeof window === "undefined" || !userId) return "";
  try {
    return sanitizePersonalization(window.localStorage.getItem(localKey(userId)));
  } catch {
    return "";
  }
}

const readLocal = cachedLearningProfile;

function writeLocal(userId: string, text: string) {
  if (typeof window === "undefined" || !userId) return;
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
  const bucket = localListeners.get(userId) ?? new Set<LocalListener>();
  bucket.add(onChange);
  localListeners.set(userId, bucket);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== localKey(userId)) return;
    onChange(sanitizePersonalization(event.newValue));
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    bucket.delete(onChange);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

async function writeRemote(userId: string, text: string): Promise<void> {
  if (!text) {
    await deleteDoc(learningRef(userId));
    return;
  }
  await setDoc(
    learningRef(userId),
    omitUndefined({
      text,
      updatedAt: serverTimestamp(),
    }),
  );
}

export async function getLearningProfile(userId: string): Promise<string> {
  if (!userId) return "";
  try {
    const snapshot = await getDoc(learningRef(userId));
    const remote = snapshot.exists() ? sanitizePersonalization(snapshot.data()?.text) : "";
    if (remote) {
      writeLocal(userId, remote);
      return remote;
    }
    const local = readLocal(userId);
    if (local) void writeRemote(userId, local).catch(() => undefined);
    return local;
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
      const local = readLocal(userId);
      if (local) {
        void writeRemote(userId, local).catch(() => undefined);
        onChange(local);
        return;
      }
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
  notifyLocal(userId, text);
  try {
    await writeRemote(userId, text);
  } catch {
    /* rules may not be deployed yet — local cache still teaches this browser */
  }
  return text;
}

export async function deleteLearningProfile(userId: string): Promise<void> {
  if (!userId) return;
  notifyLocal(userId, "");
  await deleteDoc(learningRef(userId)).catch(() => undefined);
}
