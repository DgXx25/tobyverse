import { ChatRoute } from "@/components/chat-route";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;
  return <ChatRoute chatId={chatId} />;
}
