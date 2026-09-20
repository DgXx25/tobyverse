"use client";

import { createContext, useContext, useLayoutEffect, useMemo, type ReactNode } from "react";

type StreamAnim = {
  active: boolean;
  seen: number;
  cursor: { n: number };
};

const StreamAnimContext = createContext<StreamAnim | null>(null);

export function StreamAnimRoot({
  active,
  seen,
  onSeen,
  children,
}: {
  active: boolean;
  seen: number;
  onSeen: (next: number) => void;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ active, seen, cursor: { n: 0 } }), [active, seen]);
  useLayoutEffect(() => {
    onSeen(active ? value.cursor.n : 0);
  });
  return <StreamAnimContext.Provider value={value}>{children}</StreamAnimContext.Provider>;
}

function splitStreamParts(text: string): string[] {
  if (!text) return [];
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const parts: string[] = [];
    for (const { segment, isWordLike } of new Intl.Segmenter(undefined, { granularity: "word" }).segment(text)) {
      if (isWordLike || parts.length === 0) parts.push(segment);
      else parts[parts.length - 1] += segment;
    }
    return parts;
  }
  return text.match(/\S+\s*|\s+/g) ?? [text];
}

/** Word-level fade for the live markdown block. Settled text stays unwrapped. */
export function StreamWords({ text }: { text: string }) {
  const ctx = useContext(StreamAnimContext);
  if (!ctx?.active || !text) return <>{text}</>;
  return (
    <>
      {splitStreamParts(text).map((part) => {
        const start = ctx.cursor.n;
        ctx.cursor.n += part.length;
        return (
          <span key={start} className={start >= ctx.seen ? "stream-word" : undefined}>
            {part}
          </span>
        );
      })}
    </>
  );
}
