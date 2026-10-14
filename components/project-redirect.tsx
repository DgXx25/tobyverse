"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { latestChatPath } from "@/lib/chats";
import { peekOpeningProject } from "@/lib/workspace/start-project";
import { chatPath, projectHomePath } from "@/lib/workspace/routes";

export function ProjectRedirect({
  projectId,
  threadId,
}: {
  projectId: string;
  threadId?: string;
}) {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    if (peekOpeningProject(projectId)) {
      router.replace(chatPath(projectId));
      return;
    }
    if (threadId && threadId !== "main") {
      router.replace(chatPath(threadId));
      return;
    }
    let cancelled = false;
    latestChatPath(projectId)
      .then((path) => {
        if (cancelled) return;
        router.replace(path ?? projectHomePath(projectId));
      })
      .catch(() => {
        if (!cancelled) router.replace(projectHomePath(projectId));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, threadId, user, router]);

  return <div className="project-workspace relative flex h-full min-h-0 flex-1 overflow-hidden bg-transparent" />;
}
