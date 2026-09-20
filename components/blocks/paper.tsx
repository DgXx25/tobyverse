"use client";

import { useState } from "react";
import { authHeaders } from "@/lib/api/client";
import { PaperPlay, paperIsExample, paperReady, type PaperAnswer } from "@/components/exercises/paper-play";
import type { PaperPayload } from "@/types/exercise";

type Feedback = { feedback: string; verdict: "correct" | "partial" | "incorrect" | "hint" };

export function PaperView({ block, streaming = false }: { block: PaperPayload; streaming?: boolean }) {
  const example = paperIsExample(block);
  const [answer, setAnswer] = useState<PaperAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(example);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ready = paperReady(answer);

  async function check() {
    if (!ready || busy || locked || !answer) return;
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
      <PaperPlay data={block} locked={locked || streaming} onSelect={setAnswer} streaming={streaming} />
      {feedback ? <p className="ex-paper-feedback">{feedback.feedback}</p> : null}
      {error ? <p className="ex-paper-error">{error}</p> : null}
      {!example && !locked && !streaming ? (
        <button type="button" className="ex-paper-check" disabled={!ready || busy} onClick={() => void check()}>
          {busy ? "ამოწმებს…" : "შემოწმება"}
        </button>
      ) : null}
    </div>
  );
}
