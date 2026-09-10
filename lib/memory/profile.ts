import { deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from "firebase/firestore";
import { COLLECTIONS, omitUndefined } from "@/lib/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { sanitizePersonalization } from "@/lib/memory/normalize";

function learningRef(userId: string) {
  return doc(getFirebaseDb(), COLLECTIONS.users, userId, COLLECTIONS.profile, "learning");
}

export async function getLearningProfile(userId: string): Promise<string> {
  if (!userId) return "";
  const snapshot = await getDoc(learningRef(userId));
  if (!snapshot.exists()) return "";
  return sanitizePersonalization(snapshot.data()?.text);
}

export function subscribeLearningProfile(
  userId: string,
  onChange: (text: string) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    learningRef(userId),
    (snapshot) => {
      onChange(snapshot.exists() ? sanitizePersonalization(snapshot.data()?.text) : "");
    },
    (error) => onError?.(error),
  );
}

export async function setLearningProfile(userId: string, raw: string): Promise<string> {
  if (!userId) return "";
  const text = sanitizePersonalization(raw);
  if (!text) {
    await deleteDoc(learningRef(userId)).catch(() => undefined);
    return "";
  }
  await setDoc(
    learningRef(userId),
    omitUndefined({
      text,
      updatedAt: serverTimestamp(),
    }),
  );
  return text;
}

export async function deleteLearningProfile(userId: string): Promise<void> {
  if (!userId) return;
  await deleteDoc(learningRef(userId)).catch(() => undefined);
}
