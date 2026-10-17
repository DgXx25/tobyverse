"use client";

import { useChatBlockState } from "@/components/workspace/chat-block-state";
import { authHeaders } from "@/lib/api/client";
import { PaperPlay, paperIsExample, paperReady, type PaperAnswer } from "@/components/exercises/paper-play";
import type { PaperPayload } from "@/types/exercise";

type Feedback = { feedback: string; verdict: "correct" | "partial" | "incorrect" | "hint" };

export function PaperView({
  block,
  streaming = false,
  skipped = false,
}: {
  block: PaperPayload;
  streaming?: boolean;
  skipped?: boolean;
}) {
  const example = paperIsExample(block);
  const [answer, setAnswer] = useChatBlockState<PaperAnswer | null>("answer", null);
  const [busy, setBusy] = useChatBlockState("busy", false);
  const [locked, setLocked] = useChatBlockState("locked", example);
  const [feedback, setFeedback] = useChatBlockState<Feedback | null>("feedback", null);
  const [error, setError] = useChatBlockState<string | null>("error", null);
  const ready = paperReady(answer);
  const frozen = example || skipped || locked || streaming;

  async function check() {
    if (!ready || busy || frozen || !answer) return;
    setBusy(true);
    setError(null);
    try {
      const rubric = block.rubric?.map((item) => item.criterion).join("; ");
      const response = await fetch("/api/exercises/feedback", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          type: "paper",
          prompt: rubric ? `${block.brief}\nRubric: ${rubric}` : block.brief,
          answer,
          mode: "normal",
        }),
      });
      const data = (await response.json()) as Feedback & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not grade this.");
      setFeedback(data);
      if (data.verdict === "correct") setLocked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not grade this.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ex-paper-block">
      <PaperPlay data={block} locked={frozen} skipped={skipped} onSelect={setAnswer} streaming={streaming} />
      {feedback ? <p className="ex-paper-feedback">{feedback.feedback}</p> : null}
      {error ? <p className="ex-paper-error">{error}</p> : null}
      {!example && !skipped && !locked && !streaming ? (
        <button type="button" className="ex-paper-check" disabled={!ready || busy} onClick={() => void check()}>
          {busy ? "Checking…" : "Check"}
        </button>
      ) : null}
    </div>
  );
}
