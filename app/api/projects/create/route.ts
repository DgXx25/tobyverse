import { getAdminFirestore, verifyAdminIdToken } from "@/lib/server/firestore-admin";
import { DEFAULT_CHAT_THREAD_ID } from "@/lib/core/constants";
import { DEFAULT_PROJECT_GOAL } from "@/lib/core/constants";
import { recipeForGoal } from "@/lib/core/recipes";
import { preferredChatModeForGoal, asChatMode } from "@/lib/core/chat-modes";
import { Timestamp } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return Response.json({ error: "Sign in required." }, { status: 401 });
    let decoded;
    try {
      decoded = await verifyAdminIdToken(token);
    } catch {
      return Response.json({ error: "Invalid session." }, { status: 401 });
    }
    const body = (await request.json()) as { id?: unknown; title?: unknown; listed?: unknown; icon?: unknown; folder?: unknown; createThread?: unknown; goal?: unknown; preferredChatMode?: unknown };
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "New project";
    const goal = typeof body.goal === "string" ? body.goal : DEFAULT_PROJECT_GOAL;
    const mode = asChatMode(body.preferredChatMode, preferredChatModeForGoal(goal as never));
    const db = getAdminFirestore();
    const requestedId = typeof body.id === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(body.id) ? body.id : undefined;
    const projectRef = requestedId ? db.collection("projects").doc(requestedId) : db.collection("projects").doc();
    if (requestedId && (await projectRef.get()).exists) return Response.json({ error: "Project already exists." }, { status: 409 });
    const now = Timestamp.now();
    await projectRef.set({
      title: title || "New project", description: "", userId: decoded.uid, goal,
      recipe: recipeForGoal(goal as never), preferredChatMode: mode, projectMemory: [],
      listed: body.listed === true, createdAt: now, updatedAt: now,
      ...(typeof body.icon === "string" && body.icon.trim() ? { icon: body.icon.trim().slice(0, 8) } : {}),
      ...(typeof body.folder === "string" && body.folder.trim() ? { folder: body.folder.trim().slice(0, 40) } : {}),
    });
    if (body.createThread !== false) {
      await projectRef.collection("chats").doc(DEFAULT_CHAT_THREAD_ID).set({
        projectId: projectRef.id, userId: decoded.uid, lessonId: null, exerciseId: null,
        mode, kind: "main", pathId: null, createdAt: now, updatedAt: now,
      });
      await db.collection("chats").doc(projectRef.id).set({
        projectId: projectRef.id, nestedId: DEFAULT_CHAT_THREAD_ID, userId: decoded.uid,
        kind: "main", createdAt: now, updatedAt: now,
      });
    }
    return Response.json({ projectId: projectRef.id });
  } catch (error) {
    console.error("Project creation failed", error);
    return Response.json({ error: "Could not create project." }, { status: 500 });
  }
}
