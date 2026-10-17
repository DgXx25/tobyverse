"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { ProjectLoading } from "@/components/project-loading";
import { ProjectView } from "@/components/project-view";
import { resolveChatRoute } from "@/lib/chats";
import { getProjectById, mapProject } from "@/lib/projects";
import { authHeaders } from "@/lib/api/client";
import { waitForChatStep } from "@/lib/ai/chat-deadline";
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
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!user) return;
    if (peekOpeningProject(chatId)) {
      setResolved({ projectId: chatId, threadId: nestedThreadId(chatId, chatId) });
      setError(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setResolved(null);
    setError(null);

    const direct = getProjectById(chatId).then((project) => {
      const fast = fastMainChatRoute(chatId, user.uid, project);
      if (!project || !fast) throw new Error("Chat not found.");
      return { ...fast, initialProject: project };
    });
    const indexed = resolveChatRoute(chatId, user.uid).then(async (next) => {
      if (!next) throw new Error("Chat not found.");
      const project = await getProjectById(next.projectId);
      if (!project || project.userId !== user.uid) throw new Error("Chat not found.");
      return { ...next, initialProject: project };
    });
    // Same-origin fallback works when the browser's Firestore connection stalls.
    let fallbackTimer: ReturnType<typeof setTimeout>;
    const server = new Promise<void>((resolve) => { fallbackTimer = setTimeout(resolve, 1_500); })
      .then(async (): Promise<ResolvedChat> => {
        controller.signal.throwIfAborted();
        const headers = await authHeaders();
        controller.signal.throwIfAborted();
        const response = await fetch(`/api/projects/bootstrap?chatId=${encodeURIComponent(chatId)}`, { headers, signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not open chat.");
        return { projectId: data.projectId, threadId: data.threadId,
          initialProject: mapProject(data.projectId, data.project), initialMessages: data.messages, olderCursor: data.olderCursor };
      });
    void waitForChatStep("Opening chat", () => Promise.any([direct, indexed, server]), { signal: controller.signal })
      .then((next) => { if (!cancelled) setResolved(next); })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof AggregateError ? "Could not open chat. Check your connection and retry." : err instanceof Error ? err.message : "Could not open chat.");
      }).finally(() => { clearTimeout(fallbackTimer); controller.abort(); });
    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
      controller.abort();
    };
  }, [chatId, user, attempt]);

  useEffect(() => {
    if (!error) return;
    const retry = () => setAttempt((value) => value + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [error]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <p className="text-sm text-muted">{error}</p>
        <button type="button" className="mt-4 mr-5 text-sm hover:underline" onClick={() => setAttempt((value) => value + 1)}>Retry</button>
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
