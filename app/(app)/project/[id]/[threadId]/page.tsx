import { ProjectRedirect } from "@/components/project-redirect";

export default async function ProjectThreadPage({
  params,
}: {
  params: Promise<{ id: string; threadId: string }>;
}) {
  const { id, threadId } = await params;
  return <ProjectRedirect projectId={id} threadId={threadId} />;
}
