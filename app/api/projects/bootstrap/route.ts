import { getAdminFirestore, verifyAdminIdToken } from "@/lib/server/firestore-admin";
import { DEFAULT_CHAT_THREAD_ID } from "@/lib/core/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function iso(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return (value.toDate() as Date).toISOString();
  }
  return typeof value === "string" ? value : null;
}

export async function GET(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return Response.json({ error: "Sign in required." }, { status: 401 });
    let decoded;
    try {
      decoded = await verifyAdminIdToken(token);
    } catch {
      return Response.json({ error: "Invalid session." }, { status: 401 });
    }
    const url = new URL(request.url);
    const chatId = url.searchParams.get("chatId") || "";
    let projectId = url.searchParams.get("projectId") || chatId;
    let threadId = url.searchParams.get("threadId") || DEFAULT_CHAT_THREAD_ID;
    const validId = (id: string) => Boolean(id && id.length <= 150 && !id.includes("/") && id !== "." && id !== "..");
    if (!validId(projectId) || !validId(threadId)) return Response.json({ error: "Invalid chat." }, { status: 400 });
    const db = getAdminFirestore();
    if (chatId && !url.searchParams.has("projectId")) {
      const index = await db.collection("chats").doc(chatId).get();
      const row = index.data();
      if (row) {
        if (row.userId !== decoded.uid) return Response.json({ error: "Chat not found." }, { status: 404 });
        projectId = row.projectId;
        threadId = row.nestedId || (chatId === projectId ? DEFAULT_CHAT_THREAD_ID : chatId);
        if (!validId(projectId) || !validId(threadId)) return Response.json({ error: "Invalid chat." }, { status: 400 });
      }
    }
    const ref = db.collection("projects").doc(projectId);
    const snap = await ref.get();
    if (!snap.exists) return Response.json({ error: "Project not found." }, { status: 404 });
    const data = snap.data()!;
    if (data.userId !== decoded.uid) return Response.json({ error: "You do not have access to this project." }, { status: 403 });
    const chatRef = ref.collection("chats").doc(threadId);
    const chat = await chatRef.get();
    if (threadId !== DEFAULT_CHAT_THREAD_ID && (!chat.exists || chat.data()?.userId !== decoded.uid)) {
      return Response.json({ error: "Chat not found." }, { status: 404 });
    }
    let messageQuery = chatRef.collection("messages").orderBy("createdAt", "desc");
    const beforeId = url.searchParams.get("beforeId");
    if (beforeId) {
      const cursor = await chatRef.collection("messages").doc(beforeId).get();
      if (cursor.exists) messageQuery = messageQuery.startAfter(cursor);
    }
    const messagesSnap = await messageQuery.limit(40).get();
    const messages = messagesSnap.docs.reverse().map((item) => {
      const row = item.data();
      return { ...row, id: item.id, projectId, threadId, createdAt: iso(row.createdAt) };
    });
    const project = {
      ...data, id: snap.id, createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt),
    };
    const olderCursor = messagesSnap.docs.length === 40
      ? messagesSnap.docs[0].id
      : null;
    return Response.json({ projectId, threadId, project, messages, olderCursor });
  } catch (error) {
    console.error("Project bootstrap failed", error);
    return Response.json({ error: "Could not load project." }, { status: 500 });
  }
}
