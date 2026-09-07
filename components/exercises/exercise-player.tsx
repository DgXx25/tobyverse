"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { authHeaders } from "@/lib/api/client";
import { trackEvent } from "@/lib/analytics/track";
import { gradeObjective, isObjectiveType, isProblemTypeForHints } from "@/lib/exercises/grade";
import { getExerciseTemplate } from "@/lib/exercises/templates";
import type { ProjectExercise } from "@/lib/exercises/store";
import type {
  AnalysisPayload,
  CaseTreePayload,
  ConnectPayload,
  EssayPayload,
  FillBlankPayload,
  McqPayload,
  OpenShortPayload,
  ProblemStepsPayload,
  TrueFalsePayload,
} from "@/types/exercise";
import type { ExerciseVisual } from "@/types/visual";
import { CatalogVisual } from "@/components/visuals/visual-block";

type Feedback = { feedback: string; verdict: "correct" | "partial" | "incorrect" | "hint" };

export type ExercisePlayerHandle = {
  check: () => Promise<void>;
};

export const ExercisePlayer = forwardRef<
  ExercisePlayerHandle,
  {
    item: ProjectExercise;
    userId: string;
    checked: boolean;
    onReadyChange: (ready: boolean) => void;
  }
>(function ExercisePlayer({ item, userId, checked, onReadyChange }, ref) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const answerRef = useRef<unknown>(null);
  const unsupported = item.type === "unsupported";
  const socratic = item.type !== "unsupported" && isProblemTypeForHints(item.type);

  useEffect(() => {
    answerRef.current = null;
    setFeedback(null);
    setError(null);
    setReveal(false);
    onReadyChange(unsupported);
  }, [item.id, onReadyChange, unsupported]);

  useEffect(() => {
    trackEvent({
      userId,
      projectId: item.projectId,
      type: "exercise_started",
      value: item.category,
    });
  }, [item.id, item.category, item.projectId, userId]);

  function setAnswer(value: unknown, ready: boolean) {
    answerRef.current = value;
    onReadyChange(ready);
  }

  async function requestFeedback(answer: unknown, forceReveal = false) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/exercises/feedback", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          type: item.type,
          prompt: stem(item),
          answer,
          mode: socratic && !forceReveal ? "socratic" : "normal",
          reveal: forceReveal || reveal,
        }),
      });
      const data = (await response.json()) as Feedback & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not grade this.");
      setFeedback(data);
      finish(data.verdict === "correct");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not grade this.");
    } finally {
      setBusy(false);
    }
  }

  function finish(correct: boolean | null) {
    trackEvent({
      userId,
      projectId: item.projectId,
      type: "exercise_completed",
      value: item.type,
    });
    if (correct === true) {
      trackEvent({ userId, projectId: item.projectId, type: "exercise_correct", value: item.type });
    } else if (correct === false) {
      trackEvent({ userId, projectId: item.projectId, type: "exercise_incorrect", value: item.type });
    }
  }

  useImperativeHandle(ref, () => ({
    async check() {
      if (item.type === "unsupported") return;
      const answer = answerRef.current;
      if (isObjectiveType(item.type)) {
        const correct = gradeObjective(item.type, item.data, answer);
        setFeedback({
          feedback: correct ? "Correct." : socratic ? "Not quite. Try another angle." : "Incorrect.",
          verdict: correct ? "correct" : "incorrect",
        });
        finish(correct);
        return;
      }
      if (item.type === "case_tree") {
        const correct = answer === true;
        setFeedback({
          feedback: correct ? "You reached a sound path." : "That path is weak. Try another branch.",
          verdict: correct ? "correct" : "incorrect",
        });
        finish(correct);
        return;
      }
      await requestFeedback(answer, reveal);
    },
  }));

  if (item.type === "unsupported") {
    return (
      <div className="mx-auto w-full max-w-xl">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Unsupported item</p>
        <p className="mt-5 text-[15px] leading-6 text-muted">
          This item uses a type this version cannot play. The rest of the set is still here.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted">{getExerciseTemplate(item.type).label}</p>
      <div className="mt-5">
        {item.type === "mcq" && (
          <McqPlay data={item.data as McqPayload} checked={checked} onSelect={(id) => setAnswer(id, Boolean(id))} />
        )}
        {item.type === "true_false" && (
          <TrueFalsePlay
            data={item.data as TrueFalsePayload}
            checked={checked}
            onSelect={(value) => setAnswer(value, true)}
          />
        )}
        {item.type === "connect" && (
          <ConnectPlay
            data={item.data as ConnectPayload}
            checked={checked}
            onSelect={(pairs) => setAnswer(pairs, pairs.length === (item.data as ConnectPayload).left.length)}
          />
        )}
        {item.type === "fill_blank" && (
          <FillBlankPlay
            data={item.data as FillBlankPayload}
            onSelect={(map) => {
              const blanks = (item.data as FillBlankPayload).blanks;
              setAnswer(map, blanks.every((blank) => String(map[blank.id] ?? "").trim()));
            }}
          />
        )}
        {item.type === "open_short" && (
          <TextPlay prompt={(item.data as OpenShortPayload).prompt} onSelect={(value) => setAnswer(value, Boolean(value.trim()))} />
        )}
        {item.type === "essay" && (
          <TextPlay
            prompt={(item.data as EssayPayload).prompt}
            rows={8}
            onSelect={(value) => setAnswer(value, Boolean(value.trim()))}
          />
        )}
        {item.type === "analysis" && (
          <AnalysisPlay data={item.data as AnalysisPayload} onSelect={(value) => setAnswer(value, Boolean(value.trim()))} />
        )}
        {item.type === "problem_steps" && (
          <StepsPlay
            data={item.data as ProblemStepsPayload}
            reveal={checked && reveal}
            socratic={socratic}
            onSelect={(value) => setAnswer(value, Boolean(value.trim()))}
          />
        )}
        {item.type === "case_tree" && (
          <CaseTreePlay
            data={item.data as CaseTreePayload}
            checked={checked}
            onSelect={(correct) => setAnswer(correct, true)}
          />
        )}
      </div>

      {busy && <p className="mt-4 text-sm text-muted">Checking…</p>}
      {checked && feedback && <p className="mt-4 text-sm leading-6 text-foreground">{feedback.feedback}</p>}
      {error && <p className="mt-3 text-xs text-muted">{error}</p>}

      {checked && socratic && item.type === "problem_steps" && (
        <button type="button" onClick={() => setReveal(true)} className="mt-4 text-xs text-muted hover:text-foreground">
          Reveal answer
        </button>
      )}
    </div>
  );
});

ExercisePlayer.displayName = "ExercisePlayer";

function stem(item: ProjectExercise): string {
  const data = item.data as Record<string, unknown>;
  const value = [data.question, data.statement, data.prompt, data.problem, data.scenario].find(
    (entry) => typeof entry === "string",
  );
  return String(value ?? item.type);
}

function StemVisual({ visual }: { visual?: ExerciseVisual }) {
  if (!visual || visual.kind === "none" || visual.placement === "in_option") return null;
  return <CatalogVisual kind={visual.kind} id={visual.id} className="my-4 flex justify-center" />;
}

function optionClass(selected: boolean, checked: boolean) {
  if (selected && checked) return "border-accent bg-surface-2";
  if (selected) return "border-accent bg-surface-2";
  return "border-border bg-surface hover:bg-surface-2";
}

function McqPlay({
  data,
  onSelect,
  checked,
}: {
  data: McqPayload;
  onSelect: (id: string) => void;
  checked: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div>
      <p className="text-lg font-medium leading-7 text-foreground">{data.question}</p>
      <StemVisual visual={data.visual} />
      <div className="mt-6 space-y-3">
        {data.options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={checked}
            onClick={() => {
              setPicked(option.id);
              onSelect(option.id);
            }}
            className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left text-[15px] leading-6 disabled:opacity-90 ${optionClass(picked === option.id, checked)}`}
          >
            <CatalogVisual kind={option.visual?.kind} id={option.visual?.id} className="shrink-0" />
            <span>{option.text}</span>
          </button>
        ))}
      </div>
      {checked && data.explanation ? <p className="mt-4 text-sm text-muted">{data.explanation}</p> : null}
    </div>
  );
}

function TrueFalsePlay({
  data,
  onSelect,
  checked,
}: {
  data: TrueFalsePayload;
  onSelect: (value: boolean) => void;
  checked: boolean;
}) {
  const [picked, setPicked] = useState<boolean | null>(null);
  return (
    <div>
      <p className="text-lg font-medium leading-7 text-foreground">{data.statement}</p>
      <StemVisual visual={data.visual} />
      <div className="mt-6 space-y-3">
        {[
          { value: true, label: "True" },
          { value: false, label: "False" },
        ].map((option) => (
          <button
            key={String(option.value)}
            type="button"
            disabled={checked}
            onClick={() => {
              setPicked(option.value);
              onSelect(option.value);
            }}
            className={`block w-full rounded-2xl border px-4 py-4 text-left text-[15px] leading-6 disabled:opacity-90 ${optionClass(picked === option.value, checked)}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {checked && data.explanation ? <p className="mt-4 text-sm text-muted">{data.explanation}</p> : null}
    </div>
  );
}

function ConnectPlay({
  data,
  onSelect,
  checked,
}: {
  data: ConnectPayload;
  onSelect: (pairs: { leftId: string; rightId: string }[]) => void;
  checked: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pairs, setPairs] = useState<{ leftId: string; rightId: string }[]>([]);
  const usedLeft = new Set(pairs.map((pair) => pair.leftId));
  const usedRight = new Set(pairs.map((pair) => pair.rightId));

  function pickRight(rightId: string) {
    if (checked || !selected) return;
    const next = [...pairs.filter((pair) => pair.leftId !== selected && pair.rightId !== rightId), { leftId: selected, rightId }];
    setPairs(next);
    setSelected(null);
    onSelect(next);
  }

  return (
    <div>
      <p className="text-lg font-medium leading-7 text-foreground">{data.prompt}</p>
      <StemVisual visual={data.visual} />
      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="space-y-2">
          {data.left.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={checked || usedLeft.has(item.id)}
              onClick={() => setSelected(item.id)}
              className={`block w-full rounded-2xl border px-4 py-3 text-left text-sm disabled:opacity-40 ${optionClass(selected === item.id, checked)}`}
            >
              {item.text}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {data.right.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={checked || usedRight.has(item.id)}
              onClick={() => pickRight(item.id)}
              className="block w-full rounded-2xl border border-border bg-surface px-4 py-3 text-left text-sm disabled:opacity-40 hover:bg-surface-2"
            >
              {item.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FillBlankPlay({
  data,
  onSelect,
}: {
  data: FillBlankPayload;
  onSelect: (map: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const parts = data.text.split(/(\{\{[^}]+\}\})/g);

  return (
    <div>
      <p className="text-lg font-medium leading-8 text-foreground">
        {parts.map((part, index) => {
          const match = part.match(/^\{\{([^}]+)\}\}$/);
          if (!match) return <span key={index}>{part}</span>;
          const id = match[1];
          return (
            <input
              key={id}
              value={values[id] ?? ""}
              onChange={(event) => {
                const next = { ...values, [id]: event.target.value };
                setValues(next);
                onSelect(next);
              }}
              className="mx-1 w-32 border-b border-border bg-transparent text-base outline-none"
            />
          );
        })}
      </p>
      <StemVisual visual={data.visual} />
    </div>
  );
}

function TextPlay({
  prompt,
  onSelect,
  rows = 5,
}: {
  prompt: string;
  onSelect: (value: string) => void;
  rows?: number;
}) {
  const [value, setValue] = useState("");
  return (
    <div>
      <p className="text-lg font-medium leading-7 text-foreground">{prompt}</p>
      <textarea
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          onSelect(event.target.value);
        }}
        rows={rows}
        className="mt-4 w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-[15px] outline-none"
      />
    </div>
  );
}

function AnalysisPlay({
  data,
  onSelect,
}: {
  data: AnalysisPayload;
  onSelect: (value: string) => void;
}) {
  return (
    <div>
      <p className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm leading-6 text-muted">{data.source}</p>
      <p className="mt-3 text-[11px] text-muted">{data.focusPoints.join(" · ")}</p>
      <div className="mt-4">
        <TextPlay prompt={data.prompt} onSelect={onSelect} rows={6} />
      </div>
    </div>
  );
}

function StepsPlay({
  data,
  reveal,
  socratic,
  onSelect,
}: {
  data: ProblemStepsPayload;
  reveal: boolean;
  socratic: boolean;
  onSelect: (value: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const step = data.steps[index];
  return (
    <div>
      <p className="text-lg font-medium leading-7 text-foreground">{data.problem}</p>
      <StemVisual visual={data.visual} />
      {step && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wide text-muted">
            Step {index + 1} of {data.steps.length}
          </p>
          <p className="mt-1 text-sm text-foreground">{step.prompt}</p>
          {socratic && step.hint && !reveal ? <p className="mt-2 text-xs text-muted">{step.hint}</p> : null}
          <TextPlay prompt="Your work" onSelect={onSelect} rows={3} />
          {index < data.steps.length - 1 && (
            <button type="button" onClick={() => setIndex((value) => value + 1)} className="mt-2 text-xs text-muted">
              Next step
            </button>
          )}
        </div>
      )}
      {reveal && (
        <ol className="mt-5 space-y-2">
          {data.steps.map((item, index) => (
            <li key={item.id} className="text-sm leading-6 text-foreground">
              <span className="text-muted">{index + 1}. </span>
              {item.expected || item.prompt}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function CaseTreePlay({
  data,
  checked,
  onSelect,
}: {
  data: CaseTreePayload;
  checked: boolean;
  onSelect: (correct: boolean) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const node = data.nodes.find((item) => item.id === data.rootNodeId);

  return (
    <div>
      <p className="text-lg font-medium leading-7 text-foreground">{data.scenario}</p>
      {node && (
        <div className="mt-4">
          <p className="text-sm text-foreground">{node.prompt}</p>
          <div className="mt-3 space-y-3">
            {node.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                disabled={checked}
                onClick={() => {
                  setPicked(choice.id);
                  onSelect(choice.isCorrect !== false);
                }}
                className={`block w-full rounded-2xl border px-4 py-4 text-left text-[15px] leading-6 ${optionClass(picked === choice.id, checked)}`}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
