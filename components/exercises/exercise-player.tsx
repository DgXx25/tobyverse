"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { authHeaders } from "@/lib/api/client";
import { gradeObjective, isObjectiveType, isProblemTypeForHints } from "@/lib/exercises/grade";
import type { ProjectExercise } from "@/lib/exercises/store";
import type {
  AnalysisPayload,
  CaseTreePayload,
  ConnectPayload,
  EssayPayload,
  FillBlankPayload,
  McqPayload,
  OpenShortPayload,
  PaperPayload,
  ProblemStepsPayload,
  TrueFalsePayload,
} from "@/types/exercise";
import type { ExerciseVisual } from "@/types/visual";
import { CatalogVisual } from "@/components/visuals/visual-block";
import { PaperPlay, paperReady } from "@/components/exercises/paper-play";

type Feedback = { feedback: string; verdict: "correct" | "partial" | "incorrect" | "hint" };

export type ExercisePlayerHandle = {
  check: () => Promise<boolean | null>;
};

export const ExercisePlayer = forwardRef<
  ExercisePlayerHandle,
  {
    item: ProjectExercise;
    userId: string;
    checked: boolean;
    onReadyChange: (ready: boolean) => void;
    onAutoSolve?: () => void;
    onMiss?: () => void;
  }
>(function ExercisePlayer({ item, userId, checked, onReadyChange, onAutoSolve, onMiss }, ref) {
  const [, setBusy] = useState(false);
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

  function setAnswer(value: unknown, ready: boolean) {
    answerRef.current = value;
    onReadyChange(ready);
  }

  async function requestFeedback(answer: unknown, forceReveal = false): Promise<boolean | null> {
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
      const ok = data.verdict === "correct";
      finish(ok);
      return ok;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not grade this.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function finish(_correct: boolean | null) {
    // Answers are not tracked; progress lives in the practice session itself.
  }

  useImperativeHandle(ref, () => ({
    async check() {
      if (item.type === "unsupported") return null;
      const answer = answerRef.current;
      if (isObjectiveType(item.type)) {
        const correct = gradeObjective(item.type, item.data, answer) === true;
        setFeedback({
          feedback: "",
          verdict: correct ? "correct" : "incorrect",
        });
        finish(correct);
        return correct;
      }
      if (item.type === "case_tree") {
        const correct = answer === true;
        setFeedback({
          feedback: correct ? "You reached a sound path." : "That path is weak. Try another branch.",
          verdict: correct ? "correct" : "incorrect",
        });
        finish(correct);
        return correct;
      }
      return requestFeedback(answer, reveal);
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
    <div className={`mx-auto w-full ${item.type === "paper" ? "" : "max-w-xl"} ${checked ? "pointer-events-none" : ""}`}>
      <div>
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
            onMiss={onMiss}
            onSolved={onAutoSolve}
          />
        )}
        {item.type === "fill_blank" && (
          <FillBlankPlay
            data={item.data as FillBlankPayload}
            checked={checked}
            onSelect={(map) => {
              const blanks = (item.data as FillBlankPayload).blanks;
              setAnswer(map, blanks.every((blank) => String(map[blank.id] ?? "").trim()));
            }}
          />
        )}
        {item.type === "open_short" && (
          <TextPlay
            prompt={(item.data as OpenShortPayload).prompt}
            locked={checked}
            onSelect={(value) => setAnswer(value, Boolean(value.trim()))}
          />
        )}
        {item.type === "essay" && (
          <TextPlay
            prompt={(item.data as EssayPayload).prompt}
            rows={8}
            locked={checked}
            onSelect={(value) => setAnswer(value, Boolean(value.trim()))}
          />
        )}
        {item.type === "paper" && (
          <PaperPlay
            data={item.data as PaperPayload}
            locked={checked}
            onSelect={(value) => setAnswer(value, paperReady(value))}
          />
        )}
        {item.type === "analysis" && (
          <AnalysisPlay
            data={item.data as AnalysisPayload}
            locked={checked}
            onSelect={(value) => setAnswer(value, Boolean(value.trim()))}
          />
        )}
        {item.type === "problem_steps" && (
          <StepsPlay
            data={item.data as ProblemStepsPayload}
            reveal={checked && reveal}
            socratic={socratic}
            locked={checked}
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

      {item.type === "paper" && feedback ? (
        <p className="mt-4 text-sm leading-6 text-foreground">{feedback.feedback}</p>
      ) : checked && feedback && (feedback.verdict === "hint" || (socratic && feedback.verdict !== "correct")) ? (
        <p className="mt-4 text-sm leading-6 text-foreground">{feedback.feedback}</p>
      ) : null}
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
  if (item.type === "paper") {
    const brief = typeof data.brief === "string" ? data.brief : "paper";
    const rubric = Array.isArray(data.rubric)
      ? data.rubric.flatMap((row) => {
          if (!row || typeof row !== "object" || typeof (row as { criterion?: unknown }).criterion !== "string") return [];
          return [(row as { criterion: string }).criterion];
        })
      : [];
    return rubric.length ? `${brief}\nRubric: ${rubric.join("; ")}` : brief;
  }
  const value = [data.question, data.statement, data.prompt, data.problem, data.scenario].find(
    (entry) => typeof entry === "string",
  );
  return String(value ?? item.type);
}

function StemVisual({ visual }: { visual?: ExerciseVisual }) {
  if (!visual || visual.kind === "none" || visual.placement === "in_option") return null;
  return <CatalogVisual kind={visual.kind} id={visual.id} className="my-4 flex justify-center" />;
}

function optionClass(state: "idle" | "pick" | "ok" | "bad") {
  if (state === "ok") {
    return "border-[#22c55e] bg-[color-mix(in_srgb,#22c55e_16%,var(--surface))]";
  }
  if (state === "bad") {
    return "border-[#ef4444] bg-[color-mix(in_srgb,#ef4444_16%,var(--surface))]";
  }
  if (state === "pick") {
    return "border-[color:var(--pick)] bg-[color-mix(in_srgb,var(--pick)_16%,var(--surface))]";
  }
  return "border-border bg-surface hover:bg-surface-2";
}

function choiceState(picked: boolean, checked: boolean, correct: boolean): "idle" | "pick" | "ok" | "bad" {
  if (checked) {
    if (correct) return "ok";
    if (picked) return "bad";
    return "idle";
  }
  return picked ? "pick" : "idle";
}

function connectClass(state: "idle" | "pick" | "ok" | "bad" | "done") {
  if (state === "ok") {
    return "border-[#22c55e] bg-[color-mix(in_srgb,#22c55e_16%,var(--surface))] text-foreground";
  }
  if (state === "bad") {
    return "border-[#ef4444] bg-[color-mix(in_srgb,#ef4444_16%,var(--surface))] text-foreground";
  }
  if (state === "pick") {
    return "border-[color:var(--pick)] bg-[color-mix(in_srgb,var(--pick)_16%,var(--surface))] text-foreground";
  }
  if (state === "done") return "border-border bg-surface text-muted !opacity-[0.42]";
  return "border-border bg-surface text-foreground hover:bg-surface-2";
}

const CONNECT_TONE =
  "disabled:opacity-100 transition-[border-color,background-color,opacity,color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

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
            className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left text-[15px] leading-6 disabled:opacity-90 ${optionClass(choiceState(picked === option.id, checked, option.id === data.correctOptionId))}`}
          >
            <CatalogVisual kind={option.visual?.kind} id={option.visual?.id} className="shrink-0" />
            <span>{option.text}</span>
          </button>
        ))}
      </div>
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
            className={`block w-full rounded-2xl border px-4 py-4 text-left text-[15px] leading-6 disabled:opacity-90 ${optionClass(choiceState(picked === option.value, checked, option.value === data.answer))}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ConnectPlay({
  data,
  onSelect,
  onMiss,
  onSolved,
  checked,
}: {
  data: ConnectPayload;
  onSelect: (pairs: { leftId: string; rightId: string }[]) => void;
  onMiss?: () => void;
  onSolved?: () => void;
  checked: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const [selected, setSelected] = useState<string | null>(null);
  const [locked, setLocked] = useState<{ leftId: string; rightId: string }[]>([]);
  const [faded, setFaded] = useState<Set<string>>(() => new Set());
  const [miss, setMiss] = useState<{ leftId: string; rightId: string } | null>(null);
  const fadeTimers = useRef<number[]>([]);
  const expected = new Set(data.pairs.map((pair) => `${pair.leftId}:${pair.rightId}`));
  const lockedLeft = new Set(locked.map((pair) => pair.leftId));
  const lockedRight = new Set(locked.map((pair) => pair.rightId));

  useEffect(() => {
    const timers = fadeTimers.current;
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    if (!miss) return;
    const timer = window.setTimeout(() => setMiss(null), reduceMotion ? 0 : 520);
    return () => window.clearTimeout(timer);
  }, [miss, reduceMotion]);

  function tone(id: string, side: "left" | "right"): "idle" | "pick" | "ok" | "bad" | "done" {
    if (faded.has(id)) return "done";
    if (locked.some((pair) => (side === "left" ? pair.leftId : pair.rightId) === id)) return "ok";
    if (miss && (side === "left" ? miss.leftId : miss.rightId) === id) return "bad";
    if (side === "left" && selected === id) return "pick";
    return "idle";
  }

  function fadePair(leftId: string, rightId: string) {
    const hold = 1800;
    const timer = window.setTimeout(() => {
      setFaded((current) => {
        const next = new Set(current);
        next.add(leftId);
        next.add(rightId);
        return next;
      });
    }, hold);
    fadeTimers.current.push(timer);
  }

  function pickRight(rightId: string) {
    if (checked || !selected || lockedLeft.has(selected) || lockedRight.has(rightId) || miss) return;
    const leftId = selected;
    if (expected.has(`${leftId}:${rightId}`)) {
      const next = [...locked, { leftId, rightId }];
      setLocked(next);
      setSelected(null);
      fadePair(leftId, rightId);
      onSelect(next);
      if (next.length === data.left.length) onSolved?.();
      return;
    }
    setMiss({ leftId, rightId });
    setSelected(null);
    onMiss?.();
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
              disabled={checked || lockedLeft.has(item.id) || Boolean(miss)}
              onClick={() => setSelected(item.id)}
              className={`block w-full rounded-2xl border px-4 py-3 text-left text-sm ${CONNECT_TONE} ${connectClass(tone(item.id, "left"))}`}
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
              disabled={checked || lockedRight.has(item.id) || Boolean(miss)}
              onClick={() => pickRight(item.id)}
              className={`block w-full rounded-2xl border px-4 py-3 text-left text-sm ${CONNECT_TONE} ${connectClass(tone(item.id, "right"))}`}
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
  checked,
}: {
  data: FillBlankPayload;
  onSelect: (map: Record<string, string>) => void;
  checked: boolean;
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
              readOnly={checked}
              onChange={(event) => {
                const next = { ...values, [id]: event.target.value };
                setValues(next);
                onSelect(next);
              }}
              className="mx-1 w-32 border-b border-border bg-transparent text-base outline-none read-only:cursor-default"
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
  locked = false,
}: {
  prompt: string;
  onSelect: (value: string) => void;
  rows?: number;
  locked?: boolean;
}) {
  const [value, setValue] = useState("");
  return (
    <div>
      <p className="text-lg font-medium leading-7 text-foreground">{prompt}</p>
      <textarea
        value={value}
        disabled={locked}
        onChange={(event) => {
          setValue(event.target.value);
          onSelect(event.target.value);
        }}
        rows={rows}
        className="mt-4 w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-[15px] outline-none disabled:cursor-default"
      />
    </div>
  );
}

function AnalysisPlay({
  data,
  onSelect,
  locked,
}: {
  data: AnalysisPayload;
  onSelect: (value: string) => void;
  locked?: boolean;
}) {
  return (
    <div>
      <p className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm leading-6 text-muted">{data.source}</p>
      <p className="mt-3 text-[11px] text-muted">{data.focusPoints.join(" · ")}</p>
      <div className="mt-4">
        <TextPlay prompt={data.prompt} locked={locked} onSelect={onSelect} rows={6} />
      </div>
    </div>
  );
}

function StepsPlay({
  data,
  reveal,
  socratic,
  locked,
  onSelect,
}: {
  data: ProblemStepsPayload;
  reveal: boolean;
  socratic: boolean;
  locked?: boolean;
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
          <TextPlay prompt="Your work" locked={locked} onSelect={onSelect} rows={3} />
          {index < data.steps.length - 1 && (
            <button
              type="button"
              disabled={locked}
              onClick={() => setIndex((value) => value + 1)}
              className="mt-2 text-xs text-muted disabled:cursor-default"
            >
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
                className={`block w-full rounded-2xl border px-4 py-4 text-left text-[15px] leading-6 ${optionClass(choiceState(picked === choice.id, checked, choice.isCorrect !== false))}`}
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
