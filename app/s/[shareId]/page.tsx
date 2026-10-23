import { SharedChatView } from "@/components/shared-chat-view";
import { loadSharedChat } from "@/lib/sharing/server";
import type { SharedChatSnapshot } from "@/lib/sharing/types";

export default async function SharedChatPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  let snapshot: SharedChatSnapshot | null = null;
  let initialStatus: "ready" | "missing" | "loading" = "loading";
  try {
    snapshot = await loadSharedChat(shareId);
    initialStatus = snapshot ? "ready" : "missing";
  } catch {
    // Keep the client retry path available if the server data source is temporarily unavailable.
  }
  return (
    <SharedChatView
      key={shareId}
      shareId={shareId}
      initialSnapshot={snapshot}
      initialStatus={initialStatus}
    />
  );
}
