"use client";

import { motion, useReducedMotion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Swap `public/toby-sad.svg` for Toby’s sad face. */
export function PracticeLeave({
  compact,
  onStay,
  onLeave,
}: {
  compact?: boolean;
  onStay: () => void;
  onLeave: () => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col bg-background"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      transition={{ duration: 0.22, ease: EASE }}
    >
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
        <span
          className={`shrink-0 bg-foreground ${compact ? "h-28 w-28" : "h-40 w-40"}`}
          style={{
            WebkitMask: "url(/toby-sad.svg) center / contain no-repeat",
            mask: "url(/toby-sad.svg) center / contain no-repeat",
          }}
          aria-hidden
        />
        <p className="mt-6 text-lg font-medium tracking-tight text-foreground">{"Don't go."}</p>
        <p className="mt-2 max-w-[16rem] text-sm leading-6 text-muted">{"If you leave now, you'll lose your progress."}</p>
      </div>
      <div className={`flex shrink-0 flex-col items-center gap-2 ${compact ? "px-4 pb-4" : "px-6 pb-6"}`}>
        <button
          type="button"
          onClick={onStay}
          className="w-full max-w-xs rounded-2xl bg-foreground px-8 py-3 text-sm font-semibold uppercase tracking-wide text-background"
        >
          Keep going
        </button>
        <button type="button" onClick={onLeave} className="rounded-2xl px-4 py-2 text-sm text-muted hover:text-foreground">
          Leave
        </button>
      </div>
    </motion.div>
  );
}
