import { addDoc, collection, getDocs, limit, query } from "firebase/firestore";
import { COLLECTIONS } from "@/lib/firestore";
import { getFirebaseDb, isFirebaseConfigured } from "@/lib/firebase";
import { ANALYTICS_EVENT_TYPES } from "@/types/analytics";
import type { AnalyticsEvent, TrackAnalyticsInput } from "@/types/analytics";

export function trackEvent(input: TrackAnalyticsInput): void {
  void persistEvent(input);
}

async function persistEvent(input: TrackAnalyticsInput): Promise<void> {
  if (!isFirebaseConfigured()) return;
  if (!(ANALYTICS_EVENT_TYPES as readonly string[]).includes(input.type)) return;

  try {
    await addDoc(collection(getFirebaseDb(), COLLECTIONS.analyticsEvents), {
      userId: input.userId,
      projectId: input.projectId ?? null,
      type: input.type,
      value: input.value ?? 1,
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Analytics must never break product flows.
  }
}

export async function listAnalyticsEvents(max = 2500): Promise<AnalyticsEvent[]> {
  const snapshot = await getDocs(
    query(collection(getFirebaseDb(), COLLECTIONS.analyticsEvents), limit(max)),
  );

  return snapshot.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      userId: String(data.userId ?? ""),
      projectId: typeof data.projectId === "string" ? data.projectId : null,
      type: data.type,
      value: data.value as number | string,
      createdAt: String(data.createdAt ?? ""),
    } as AnalyticsEvent;
  });
}
