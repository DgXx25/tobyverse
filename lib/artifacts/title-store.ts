import { collection, doc, getDocs, limit, query, runTransaction, serverTimestamp } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore";
import { uniqueArtifactTitle } from "@/lib/artifacts/title";

/** Project-owned reservations keep concurrent and repeated generations distinct. */
export async function reserveArtifactTitle(projectId: string, title: string, context = "", label = "", signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const base = uniqueArtifactTitle(title, [], context, label);
  const snapshots = await Promise.all([COLLECTIONS.studySheets, COLLECTIONS.paths].map(name => getDocs(query(collection(getFirebaseDb(), COLLECTIONS.projects, projectId, name), limit(200)))));
  const legacyTitles = snapshots.flatMap(snapshot => snapshot.docs.flatMap(item => {
    const value = item.data().title;
    return typeof value === "string" ? [value] : [];
  }));
  signal?.throwIfAborted();
  return runTransaction(getFirebaseDb(), async transaction => {
    const used: string[] = [...legacyTitles];
    for (let attempt = 0; attempt < 100; attempt++) {
      signal?.throwIfAborted();
      const candidate = uniqueArtifactTitle(base, used);
      // UTF-8 hex is collision-free, bounded, and contains no Firestore path separators.
      const key = Array.from(new TextEncoder().encode(candidate.toLocaleLowerCase()), value => value.toString(16).padStart(2, "0")).join("");
      const ref = doc(getFirebaseDb(), COLLECTIONS.projects, projectId, "artifactTitles", key);
      const existing = await transaction.get(ref);
      if (!existing.exists()) {
        signal?.throwIfAborted();
        transaction.set(ref, { title: candidate, createdAt: serverTimestamp() });
        return candidate;
      }
      used.push(candidate);
    }
    throw new Error("Could not choose an artifact title.");
  });
}
