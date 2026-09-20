"use client";

import { useEffect, useState } from "react";
import { ArtifactCard } from "@/components/workspace/artifact-card";
import type { SetResult } from "@/lib/exercises/session";
import type { ChatArtifact } from "@/types/chat";

export function ChatSetCard({
  artifact,
  ka = false,
  result: passed,
  onStart,
}: {
  artifact: ChatArtifact;
  projectId?: string;
  userId?: string;
  ka?: boolean;
  result?: SetResult | null;
  onStart: () => void;
  onFinished?: (result: SetResult) => void;
  onActiveChange?: (active: boolean) => void;
}) {
  const [result, setResult] = useState<SetResult | null>(null);

  useEffect(() => {
    if (passed && passed.setId === artifact.id) setResult(passed);
  }, [passed, artifact.id]);

  return (
    <ArtifactCard artifact={artifact} onOpen={onStart} onStart={onStart} result={result} ka={ka} />
  );
}
