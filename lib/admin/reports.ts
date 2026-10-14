import { getAdminDocument, listAdminDocuments, restDate, restDocumentId, restString } from "@/lib/admin/firestore-rest";
import type { AdminSession } from "@/lib/admin/assert";
import { COLLECTIONS } from "@/lib/firestore";

export type AdminReport = {
  id: string;
  chatId: string;
  messageId: string;
  reason: string;
  snippet: string;
  createdAt: string;
  publicUrl: string | null;
};

export async function readAdminReports(session: AdminSession): Promise<AdminReport[]> {
  const documents = await listAdminDocuments(COLLECTIONS.trainingSignals, session);
  const reports = documents.flatMap((item) => {
    const chatId = restString(item, "chatId");
    const messageId = restString(item, "messageId");
    const snippet = restString(item, "snippet");
    if (!chatId || !messageId || !snippet) return [];
    return [{
      id: restDocumentId(item),
      chatId,
      messageId,
      reason: restString(item, "reason").slice(0, 240),
      snippet: snippet.slice(0, 240),
      createdAt: restDate(item, "createdAt"),
      publicUrl: null as string | null,
    }];
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const chatIds = [...new Set(reports.map((report) => report.chatId))];
  const publicIds = new Map<string, string>();
  for (let index = 0; index < chatIds.length; index += 10) {
    const batch = chatIds.slice(index, index + 10);
    const docs = await Promise.all(batch.map((id) => getAdminDocument(COLLECTIONS.chats, id, session).catch(() => null)));
    for (const chat of docs) {
      if (!chat || chat.fields?.public?.booleanValue !== true) continue;
      const shareId = restString(chat, "shareId");
      if (shareId) publicIds.set(restDocumentId(chat), shareId);
    }
  }
  return reports.map((report) => ({
    ...report,
    publicUrl: publicIds.has(report.chatId) ? `/s/${publicIds.get(report.chatId)}` : null,
  }));
}
