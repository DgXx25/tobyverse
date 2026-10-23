import { ChatRoute } from "@/components/chat-route";

/** A notebook: its main conversation, sources and Studio. */
export default async function NotebookPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ChatRoute chatId={projectId} projectRoute />;
}
