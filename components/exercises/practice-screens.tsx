"use client";

export function PracticeReviewIntro({ compact }: { compact?: boolean }) {
  return (
    <div className={`mx-auto flex w-full max-w-md flex-col items-center text-center ${compact ? "px-2" : "px-4"}`}>
      <p className="text-xl font-medium tracking-tight text-foreground">{"Let's go through the mistakes."}</p>
      <p className="mt-2 max-w-[18rem] text-sm leading-6 text-muted">{"We'll work through what you missed."}</p>
    </div>
  );
}

export function PracticeDone({
  compact,
  correct,
  total,
  exam,
  passed,
}: {
  compact?: boolean;
  correct: number;
  total: number;
  exam?: boolean;
  passed?: boolean;
}) {
  const score = `${correct} of ${total}`;
  const line = exam ? (passed ? "You passed." : "You're done.") : "You're done.";
  return (
    <div className={`mx-auto flex w-full max-w-md flex-col items-center text-center ${compact ? "px-2" : "px-4"}`}>
      <span
        className={`shrink-0 bg-foreground ${compact ? "h-24 w-24" : "h-32 w-32"}`}
        style={{
          WebkitMask: "url(/toby1.svg) center / contain no-repeat",
          mask: "url(/toby1.svg) center / contain no-repeat",
        }}
        aria-hidden
      />
      <p className="mt-6 text-xl font-medium tracking-tight text-foreground">{line}</p>
      <p className="mt-2 text-sm text-muted">{score}</p>
    </div>
  );
}
