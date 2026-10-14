import { addDoc, collection } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { compactFeedbackReport } from "@/lib/feedback/report";

export async function submitAssistantDislike(input: {
  projectId: string;
  messageId: string;
  reason: string;
  note?: string;
}): Promise<void> {
  const report = compactFeedbackReport(input);
  await addDoc(collection(getFirebaseDb(), "feedbackReports"), report);
}
