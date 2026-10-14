import { SharedChatView } from "@/components/shared-chat-view";

export default async function SharedChatPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  return <SharedChatView shareId={shareId} />;
}
