import { randomBytes } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { assertAccountRequest, authErrorResponse, AuthError } from "@/lib/api/assert";
import { getAdminFirestore } from "@/lib/server/firestore-admin";
import { isValidShareId } from "@/lib/sharing/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await assertAccountRequest(request);
    const body = (await request.json().catch(() => ({}))) as { chatId?: unknown; action?: unknown };
    const chatId = typeof body.chatId === "string" ? body.chatId.trim() : "";
    const action = body.action === "unshare" ? "unshare" : "share";
    if (!chatId || chatId.includes("/") || chatId.includes("..")) {
      return Response.json({ error: "Invalid chat." }, { status: 400 });
    }
    const ref = getAdminFirestore().collection("chats").doc(chatId);
    const doc = await ref.get();
    if (!doc.exists || doc.data()?.userId !== session.uid) {
      return Response.json({ error: "Chat not found." }, { status: 404 });
    }
    if (action === "unshare") {
      await ref.update({ public: false, shareId: FieldValue.delete() });
      return Response.json({ public: false });
    }
    const current = doc.data() as Record<string, unknown>;
    const projectId = typeof current.projectId === "string" ? current.projectId.trim() : "";
    const threadId = typeof current.nestedId === "string"
      ? current.nestedId.trim()
      : projectId === doc.id ? "main" : doc.id;
    if (!projectId || !threadId) {
      return Response.json({ error: "Chat not found." }, { status: 404 });
    }
    const projectRef = getAdminFirestore().collection("projects").doc(projectId);
    const [project, thread] = await Promise.all([
      projectRef.get(),
      projectRef.collection("chats").doc(threadId).get(),
    ]);
    const projectData = project.data() as Record<string, unknown> | undefined;
    const projectOwner = typeof projectData?.userId === "string"
      ? projectData.userId
      : typeof projectData?.ownerId === "string" ? projectData.ownerId : "";
    const threadOwner = thread.data()?.userId;
    if (!project.exists || !thread.exists || projectOwner !== session.uid || (threadOwner && threadOwner !== session.uid)) {
      return Response.json({ error: "Chat not found." }, { status: 404 });
    }
    const shareId = current?.public === true && typeof current.shareId === "string" && isValidShareId(current.shareId)
      ? current.shareId
      : randomBytes(32).toString("base64url");
    await ref.update({ public: true, shareId });
    return Response.json({ public: true, shareId, url: `/s/${shareId}` });
  } catch (error) {
    const detail = error instanceof Error ? error : new Error(String(error));
    const code = "code" in detail ? (detail as Error & { code?: unknown }).code : undefined;
    console.error("[api/share] request failed", {
      name: detail.name,
      code: typeof code === "string" || typeof code === "number" ? code : null,
      message: detail.message,
    });
    if (process.env.NODE_ENV === "development") {
      return Response.json({ error: detail.message }, {
        status: error instanceof AuthError ? error.status : 500,
      });
    }
    return authErrorResponse(error);
  }
}
