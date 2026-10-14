"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { exerciseStem, subscribeExercises, type ProjectExercise } from "@/lib/exercises";
import { savePracticeIndex } from "@/lib/workspace/practice-progress";
import { examPassed, pickFooterLine, type SetMode, type SetResult } from "@/lib/exercises/session";
import { ExercisePlayer, type ExercisePlayerHandle } from "@/components/exercises/exercise-player";
import { PracticeDone, PracticeReviewIntro } from "@/components/exercises/practice-screens";
import { StatusWait } from "@/components/workspace/status-wait";
import { UiIcon } from "@/components/workspace/ui-icon";
import { PracticeLeave } from "@/components/exercises/practice-leave";

type ItemScore = { correct: boolean; tries: number; firstCorrect: boolean };
type Stage = "play" | "review-intro" | "done";

const EASE = [0.22, 1, 0.36, 1] as const;

export function PracticeSession({
  projectId,
  userId,
  setId,
  ids,
  startIndex,
  mode = "practice",
  layout = "panel",
  onExit,
  onComplete,
}: {
  projectId: string;
  userId: string;
  setId: string;
  ids: string[];
  startIndex: number;
  mode?: SetMode;
  ka?: boolean;
  layout?: "panel" | "chat" | "page";
  onExit: () => void;
  onComplete?: (result: SetResult) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [items, setItems] = useState<ProjectExercise[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [checked, setChecked] = useState(false);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [gotCorrect, setGotCorrect] = useState(false);
  const [askLeave, setAskLeave] = useState(false);
  const [stage, setStage] = useState<Stage>("play");
  const [phrase, setPhrase] = useState("");
  const [advancing, setAdvancing] = useState(false);
  const playerRef = useRef<ExercisePlayerHandle>(null);
  const scoresRef = useRef<Record<string, ItemScore>>({});
  const advancingRef = useRef(false);

  useEffect(() => {
    return subscribeExercises(projectId, (next) => {
      const focused = ids.length ? next.filter((item) => ids.includes(item.id)) : next;
      const ordered = ids.length
        ? ids.flatMap((id) => focused.filter((item) => item.id === id))
        : focused;
      setItems(ordered.length ? ordered : next);
    });
  }, [projectId, ids]);

  useEffect(() => {
    if (!items.length) return;
    setOrder((current) => (current.length ? current : items.map((item) => item.id)));
    setIndex((current) => Math.min(current, Math.max(0, items.length - 1)));
  }, [items]);

  useEffect(() => {
    if (!reviewing && items.length && startIndex > 0) {
      setIndex(Math.min(startIndex, Math.max(0, items.length - 1)));
    }
  }, [startIndex, items.length, reviewing]);

  const persist = useCallback(
    (nextIndex: number) => {
      savePracticeIndex(projectId, setId, nextIndex);
    },
    [projectId, setId],
  );

  const currentId = order[index] ?? items[index]?.id ?? null;
  const active = items.find((item) => item.id === currentId) ?? items[index] ?? null;

  useEffect(() => {
    if (active?.type === "unsupported") {
      setReady(true);
      setChecked(true);
      setLastCorrect(true);
    }
  }, [active?.id, active?.type]);

  function record(id: string, correct: boolean) {
    const prev = scoresRef.current[id];
    if (!prev) {
      scoresRef.current[id] = { correct, tries: 1, firstCorrect: correct };
      return;
    }
    scoresRef.current[id] = {
      correct,
      tries: prev.tries + 1,
      firstCorrect: prev.firstCorrect,
    };
  }

  function buildResult(): SetResult {
    let correct = 0;
    let firstTryCorrect = 0;
    let retried = 0;
    const gaps: string[] = [];
    for (const item of items) {
      const score = scoresRef.current[item.id];
      if (!score) continue;
      if (score.correct) correct += 1;
      if (score.firstCorrect) firstTryCorrect += 1;
      else gaps.push(exerciseStem(item));
      if (score.tries > 1) retried += 1;
    }
    const total = items.length || ids.length || 0;
    return {
      setId,
      mode,
      total,
      correct,
      firstTryCorrect,
      retried,
      passed: mode === "exam" ? examPassed(correct, total) : undefined,
      gaps,
    };
  }

  function resetItem() {
    setChecked(false);
    setReady(false);
    setLastCorrect(false);
    setPhrase("");
    setAdvancing(false);
    advancingRef.current = false;
    setAttempt((n) => n + 1);
  }

  function releaseFooter() {
    if (!advancingRef.current) return;
    advancingRef.current = false;
    setAdvancing(false);
    setPhrase("");
    setLastCorrect(false);
  }

  async function onCheck() {
    if (!ready || checked || checking) return;
    setChecking(true);
    try {
      const verdict = await playerRef.current?.check();
      if (verdict !== true && verdict !== false) return;
      if (active) record(active.id, verdict);
      if (active?.type === "paper" && verdict !== true) {
        setLastCorrect(false);
        setPhrase("");
        setChecked(false);
        return;
      }
      setLastCorrect(verdict);
      setPhrase(pickFooterLine(verdict));
      setChecked(true);
      if (verdict) setGotCorrect(true);
    } finally {
      setChecking(false);
    }
  }

  async function settleConnect() {
    if (checked || checking) return;
    setChecking(true);
    try {
      await playerRef.current?.check();
      if (active) record(active.id, true);
      setLastCorrect(true);
      setPhrase(pickFooterLine(true));
      setChecked(true);
      setGotCorrect(true);
    } finally {
      setChecking(false);
    }
  }

  function finish() {
    persist(0);
    onComplete?.(buildResult());
    onExit();
  }

  function requestExit() {
    if (gotCorrect) {
      setAskLeave(true);
      return;
    }
    persist(index);
    onExit();
  }

  function confirmLeave() {
    persist(0);
    onExit();
  }

  function onContinue() {
    if (advancingRef.current) return;
    if (stage === "review-intro") {
      setStage("play");
      resetItem();
      return;
    }
    if (stage === "done") {
      finish();
      return;
    }
    if (!checked) return;
    if (index < order.length - 1) {
      const next = index + 1;
      advancingRef.current = true;
      setAdvancing(true);
      setIndex(next);
      setChecked(false);
      setReady(false);
      setAttempt((n) => n + 1);
      persist(reviewing ? index : next);
      return;
    }
    if (mode === "practice" && !reviewing) {
      const missed = items.filter((item) => scoresRef.current[item.id]?.correct === false).map((item) => item.id);
      if (missed.length) {
        setReviewing(true);
        setOrder(missed);
        setIndex(0);
        setChecked(false);
        setReady(false);
        setLastCorrect(false);
        setPhrase("");
        setAdvancing(false);
        advancingRef.current = false;
        setStage("review-intro");
        return;
      }
    }
    setPhrase("");
    setLastCorrect(false);
    setStage("done");
  }

  const total = order.length || items.length || ids.length || 1;
  const progress =
    stage === "done" || stage === "review-intro" ? 100 : ((index + (checked ? 1 : 0)) / total) * 100;
  const compact = layout === "chat";
  const hideExit = stage === "done" || stage === "review-intro";
  const playing = stage === "play";
  const screenKey = stage === "play" ? (currentId ?? "empty") : stage;
  const result = stage === "done" ? buildResult() : null;
  const isConnect = active?.type === "connect";
  const footerOpen = playing && Boolean(phrase) && (checked || advancing);
  const showContinue = !playing || checked || isConnect || advancing;
  const actionDisabled = advancing || (playing && !checked && (isConnect || !ready || checking));
  const duration = reduceMotion ? 0 : 0.16;
  const shift = reduceMotion ? 0 : 18;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-transparent">
      <header className={`flex shrink-0 items-center gap-3 ${compact ? "h-10 px-3" : "h-12 px-4"}`}>
        {hideExit ? (
          <span className="w-8" aria-hidden />
        ) : (
          <button
            type="button"
            onClick={requestExit}
            className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
            aria-label={mode === "exam" ? "Stop exam" : "Stop practice"}
          >
            <UiIcon name="close" size={20} />
          </button>
        )}
        <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${progress}%` }} />
        </div>
        {reviewing && playing ? (
          <span className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-muted">Review</span>
        ) : mode === "exam" && playing ? (
          <span className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-muted">Exam</span>
        ) : (
          <span className="w-8" aria-hidden />
        )}
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence initial={false} mode="wait" onExitComplete={releaseFooter}>
          <motion.div
            key={screenKey}
            className={`flex h-full min-h-0 w-full items-center justify-center overflow-y-auto overflow-x-hidden ${
              compact ? "px-5 pb-[5.75rem] pt-5" : "px-8 pb-[6.5rem] pt-8"
            }`}
            initial={{ opacity: 0, x: shift }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -shift * 0.75 }}
            transition={{ duration, ease: EASE }}
          >
            {stage === "review-intro" ? (
              <PracticeReviewIntro compact={compact} />
            ) : stage === "done" && result ? (
              <PracticeDone
                compact={compact}
                correct={result.correct}
                total={result.total}
                exam={mode === "exam"}
                passed={result.passed}
              />
            ) : active ? (
              <ExercisePlayer
                key={`${active.id}-${attempt}`}
                ref={playerRef}
                item={active}
                userId={userId}
                checked={checked}
                onReadyChange={setReady}
                onMiss={() => {
                  if (active) record(active.id, false);
                }}
                onAutoSolve={() => void settleConnect()}
              />
            ) : (
              <StatusWait label="Loading…" />
            )}
          </motion.div>
        </AnimatePresence>

        <footer
          className={`absolute inset-x-0 bottom-0 z-10 flex items-center gap-3 bg-background ${
            compact ? "px-4 py-3" : "px-6 py-4"
          } ${footerOpen ? "border-t border-transparent" : "border-t border-border"}`}
        >
          <AnimatePresence initial={false}>
            {footerOpen ? (
              <motion.div
                key="footer-wash"
                className="pointer-events-none absolute inset-x-0 bottom-full z-0 h-24"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration, ease: EASE }}
                style={{
                  background: lastCorrect
                    ? "linear-gradient(to top, color-mix(in srgb, #22c55e 28%, transparent), transparent)"
                    : "linear-gradient(to top, color-mix(in srgb, #ef4444 28%, transparent), transparent)",
                }}
              />
            ) : null}
          </AnimatePresence>
          <div className="relative z-10 flex min-h-11 min-w-0 flex-1 items-center">
            <AnimatePresence initial={false}>
              {footerOpen ? (
                <motion.div
                  key="footer-line"
                  className="flex min-w-0 items-center gap-3"
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
                  transition={{ duration, ease: EASE }}
                >
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white ${
                      lastCorrect ? "bg-[#22c55e]" : "bg-[#ef4444]"
                    }`}
                  >
                    <UiIcon name={lastCorrect ? "check" : "x"} size={22} />
                  </span>
                  <p
                    className="truncate text-lg font-medium"
                    style={{
                      color: lastCorrect
                        ? "color-mix(in srgb, #22c55e 82%, var(--text))"
                        : "color-mix(in srgb, #ef4444 82%, var(--text))",
                    }}
                  >
                    {phrase}
                  </p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
          <button
            type="button"
            disabled={actionDisabled}
            onClick={() => (playing && !checked && !isConnect && !advancing ? void onCheck() : onContinue())}
            className={`relative z-10 shrink-0 rounded-2xl px-8 py-3 text-sm font-semibold uppercase tracking-wide ${
              footerOpen
                ? lastCorrect
                  ? "bg-[#22c55e] text-white"
                  : "bg-[#ef4444] text-white"
                : "bg-foreground text-background disabled:bg-surface-2 disabled:text-muted"
            }`}
          >
            {showContinue ? "Continue" : checking ? "Checking" : "Check"}
          </button>
        </footer>
      </div>
      <AnimatePresence>
        {askLeave ? (
          <PracticeLeave key="leave" compact={compact} onStay={() => setAskLeave(false)} onLeave={confirmLeave} />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
