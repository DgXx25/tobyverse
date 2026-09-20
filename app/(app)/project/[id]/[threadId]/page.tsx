import { ProjectView } from "@/components/project-view";

export default async function ProjectThreadPage({
  params,
}: {
  params: Promise<{ id: string; threadId: string }>;
}) {
  const { id, threadId } = await params;
  return <ProjectView projectId={id} threadId={threadId} />;
}
