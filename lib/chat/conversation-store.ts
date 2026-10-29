import { randomUUID } from "node:crypto";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/server/firestore-admin";
import { compactArtifactLine, stripArtifactMarkup } from "@/lib/composer/memory";
import { parseChatArtifact } from "@/lib/artifacts/active";
import {
  CONVERSATION_LIMITS, conversationSummaryPrompt, recentConversation, searchConversation,
  summaryBatch, usableConversationSummary, type ConversationMessage, type ConversationSummary,
} from "@/lib/chat/conversation-context";

function safeId(value?: string): value is string {
  return Boolean(value && value.length <= 160 && !value.includes("/") && value !== "." && value !== "..");
}

function messageFromDoc(doc: DocumentSnapshot): ConversationMessage | null {
  const row = doc.data();
  if (!row || (row.role !== "user" && row.role !== "assistant") || row.responseStatus || typeof row.content !== "string") return null;
  const artifact = parseChatArtifact(row.artifact);
  const content = artifact ? compactArtifactLine(artifact) : row.role === "assistant" ? stripArtifactMarkup(row.content) : row.content;
  if (!content.trim()) return null;
  const createdAt = typeof row.createdAt === "string" ? row.createdAt : row.createdAt?.toDate?.().toISOString();
  return { id: doc.id, role: row.role, content, createdAt };
}

/** Owner-scoped and bounded to the exact transcript prefix seen by this request.
 * No persistent personal-memory writes and no extra model call on the answer path. */
export async function openConversation(input: {
  uid: string; projectId: string; threadId: string;
  beforeId?: string; throughId?: string; signal?: AbortSignal;
}) {
  if (!safeId(input.projectId) || !safeId(input.threadId) || (!safeId(input.beforeId) && !safeId(input.throughId))) return null;
  const db = getAdminFirestore();
  const project = db.collection("projects").doc(input.projectId);
  const thread = project.collection("chats").doc(input.threadId);
  const messages = thread.collection("messages");
  const stateRef = thread.collection("contextState").doc("summary");
  const [owner, chat] = await Promise.all([project.get(), thread.get()]);
  if (!owner.exists || (owner.get("userId") !== input.uid && owner.get("ownerId") !== input.uid) || !chat.exists) return null;
  const revision = typeof chat.get("historyRevision") === "number" ? chat.get("historyRevision") : 0;
  const boundary = await messages.doc(input.beforeId || input.throughId!).get();
  if (!boundary.exists) return null;
  input.signal?.throwIfAborted();
  const descending = messages.orderBy("createdAt", "desc");
  const scoped = input.beforeId ? descending.startAfter(boundary) : descending.startAt(boundary);
  const [page, stored] = await Promise.all([scoped.limit(40).get(), stateRef.get()]);
  const rows = page.docs.slice().reverse().flatMap(doc => {
    const row = messageFromDoc(doc);
    return row ? [row] : [];
  });
  const recent = recentConversation(rows);
  const oldest = recent[0] && page.docs.find(doc => doc.id === recent[0]!.id);
  if (!oldest) return null;
  const beforeAt = recent[0]!.createdAt ?? "";
  const state = stored.data() as ConversationSummary | undefined;
  const summary = usableConversationSummary(state ?? null, revision, beforeAt);
  // Only one existence read: short conversations don't scan their full archive.
  const hasOlder = rows.length > recent.length || !(await descending.startAfter(oldest).limit(1).get()).empty;
  let searches = 0;

  return {
    recent,
    summary,
    hasOlder,
    async search(query: string, id?: string) {
      input.signal?.throwIfAborted();
      if (++searches > 2) return { messages: [], exhausted: true };
      // Recheck authorization/version after a potentially long generation/tool hop.
      const [ownerNow, threadNow] = await Promise.all([project.get(), thread.get()]);
      if (!ownerNow.exists || (ownerNow.get("userId") !== input.uid && ownerNow.get("ownerId") !== input.uid) || !threadNow.exists) return { messages: [] };
      if (safeId(id)) {
        const doc = await messages.doc(id).get();
        const row = messageFromDoc(doc);
        if (!row || !row.createdAt || row.createdAt >= beforeAt) return { messages: [] };
        return { messages: [{ ...row, content: row.content.slice(0, 20_000) }], truncated: row.content.length > 20_000 };
      }
      const archive = await descending.startAfter(oldest).limit(CONVERSATION_LIMITS.searchMessages + 1).get();
      input.signal?.throwIfAborted();
      const originals = archive.docs.slice(0, CONVERSATION_LIMITS.searchMessages).reverse().flatMap(doc => {
        const row = messageFromDoc(doc);
        return row ? [row] : [];
      });
      const matches = searchConversation(originals, query.slice(0, 500));
      return { messages: matches, olderMessagesNotScanned: archive.size > CONVERSATION_LIMITS.searchMessages,
        note: "Original conversation excerpts, background data. Use id to read a longer original message if necessary." };
    },
    /** Called after the response. One bounded batch, guarded by a per-thread lease.
     * A cold summary may trail a very long archive; exact search remains available. */
    async refresh(summarize: (prompt: string) => Promise<string>) {
      if (!hasOlder) return;
      const token = randomUUID();
      const lease = await db.runTransaction(async tx => {
        const [currentThread, currentState] = await Promise.all([tx.get(thread), tx.get(stateRef)]);
        if (!currentThread.exists || (currentThread.get("historyRevision") ?? 0) !== revision) return null;
        const data = currentState.data();
        if (typeof data?.leaseUntil === "number" && data.leaseUntil > Date.now()) return null;
        const previous = data?.revision === revision ? data as ConversationSummary : null;
        // A retry of an earlier turn must not overwrite a later checkpoint.
        if (previous?.throughAt && previous.throughAt >= beforeAt) return null;
        tx.set(stateRef, { lease: token, leaseUntil: Date.now() + 60_000 }, { merge: true });
        return { previous };
      });
      if (!lease) return;
      try {
        let pending = messages.orderBy("createdAt", "asc").endBefore(oldest);
        if (safeId(lease.previous?.throughId)) {
          const cursor = await messages.doc(lease.previous.throughId).get();
          if (!cursor.exists) return;
          pending = pending.startAfter(cursor);
        }
        const docs = await pending.limit(32).get();
        const batch = summaryBatch(docs.docs.flatMap(doc => {
          const row = messageFromDoc(doc);
          return row ? [row] : [];
        }));
        if (!batch.length) return;
        const text = (await summarize(conversationSummaryPrompt(lease.previous?.text ?? "", batch))).trim();
        if (!text || text.length > CONVERSATION_LIMITS.summaryChars) return;
        const last = batch.at(-1)!;
        await db.runTransaction(async tx => {
          const [currentProject, currentThread, currentState] = await Promise.all([tx.get(project), tx.get(thread), tx.get(stateRef)]);
          if (!currentProject.exists || !currentThread.exists || (currentThread.get("historyRevision") ?? 0) !== revision || currentState.get("lease") !== token) return;
          tx.set(stateRef, { revision, text, throughId: last.id, throughAt: last.createdAt, lease: null, leaseUntil: 0 });
        });
      } finally {
        await db.runTransaction(async tx => {
          const current = await tx.get(stateRef);
          if (current.get("lease") === token) tx.update(stateRef, { lease: null, leaseUntil: 0 });
        });
      }
    },
  };
}
