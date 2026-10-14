import { ProjectRedirect } from "@/components/project-redirect";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectRedirect projectId={id} />;
}
