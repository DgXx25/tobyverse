"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { ProjectLoading } from "@/components/project-loading";
import { ProjectView } from "@/components/project-view";
import { resolveChatRoute } from "@/lib/chats";
import { getProjectById } from "@/lib/projects";
import { fastMainChatRoute } from "@/lib/workspace/chat-opening";
import { peekOpeningProject } from "@/lib/workspace/start-project";
import { nestedThreadId } from "@/lib/workspace/routes";
import type { Project } from "@/types/project";
import type { ChatMessage } from "@/types/chat";

type ResolvedChat = {
  projectId: string;
  threadId: string;
  initialProject?: Project;
  initialMessages?: ChatMessage[];
  olderCursor?: string | null;
};

export function ChatRoute({ chatId }: { chatId: string }) {
  const { user } = useAuth();
  const opening = peekOpeningProject(chatId);
  const [resolved, setResolved] = useState<ResolvedChat | null>(() =>
    opening ? { projectId: chatId, threadId: nestedThreadId(chatId, chatId) } : null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (peekOpeningProject(chatId)) {
      setResolved({ projectId: chatId, threadId: nestedThreadId(chatId, chatId) });
      setError(null);
      return;
    }
    let cancelled = false;
    let fastResolved = false;
    setResolved(null);
    setError(null);

    // The project document is enough to
    // open the main chat. Start it in parallel with the legacy/index resolver
    // so nested chat links still keep their existing lookup behavior.
    void getProjectById(chatId)
      .then((project) => {
        const fast = fastMainChatRoute(chatId, user.uid, project);
        if (cancelled || !project || !fast) return;
        fastResolved = true;
        setError(null);
        setResolved({ ...fast, initialProject: project });
      })
      .catch(() => undefined);

    void resolveChatRoute(chatId, user.uid)
      .then((next) => {
        if (cancelled) return;
        if (!next) {
          if (fastResolved) return;
          setError("Chat not found.");
          return;
        }
        setResolved((current) => ({
          ...next,
          initialProject: current?.projectId === next.projectId ? current.initialProject : undefined,
        }));
      })
      .catch((err: unknown) => {
        if (cancelled || fastResolved) return;
        const message = err instanceof Error ? err.message : "Could not open chat.";
        setError(/insufficient permissions/i.test(message) ? "Chat not found." : message);
      });
    return () => {
      cancelled = true;
    };
  }, [chatId, user]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <p className="text-sm text-muted">{error}</p>
        <Link href="/new" className="mt-4 inline-block text-sm text-muted hover:text-foreground">
          Back
        </Link>
      </div>
    );
  }

  if (!resolved) {
    return <ProjectLoading />;
  }

  return (
    <ProjectView
      key={`${resolved.projectId}:${resolved.threadId}`}
      projectId={resolved.projectId}
      threadId={resolved.threadId}
      initialProject={resolved.initialProject}
      initialMessages={resolved.initialMessages}
      initialOlderCursor={resolved.olderCursor}
    />
  );
}
