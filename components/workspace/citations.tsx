"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { sourceLocator } from "@/lib/rag/sources";
import type { ChatSourceRef } from "@/types/chat";

type CitationValue = {
  sources: ChatSourceRef[];
  onOpen?: (materialId: string) => void;
};

const CitationContext = createContext<CitationValue | null>(null);

export function CitationProvider({
  sources,
  onOpen,
  children,
}: {
  sources?: ChatSourceRef[];
  onOpen?: (materialId: string) => void;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ sources: sources ?? [], onOpen }), [sources, onOpen]);
  return <CitationContext.Provider value={value}>{children}</CitationContext.Provider>;
}

function describe(source: ChatSourceRef): string {
  return [source.title, sourceLocator(source), source.section].filter(Boolean).join(" · ");
}

/** The small numbered pill that replaces [S3] inside an answer. */
export function CitationMark({ n }: { n: number }) {
  const context = useContext(CitationContext);
  const source = context?.sources.find((item) => item.n === n);
  if (!source) return null;
  const label = describe(source);
  return (
    <button
      type="button"
      onClick={() => context?.onOpen?.(source.materialId)}
      title={source.snippet ? `${label}\n\n${source.snippet}` : label}
      aria-label={`Source ${n}: ${label}`}
      className="mx-[2px] inline-flex h-[17px] min-w-[17px] -translate-y-px items-center justify-center rounded-full border border-border bg-surface-2 px-1 align-baseline text-[10px] font-medium leading-none text-muted transition-colors hover:border-foreground/30 hover:text-foreground"
    >
      {n}
    </button>
  );
}

/** Where the answer came from, under the message. Only the passages the answer used. */
export function CitedSources({
  sources,
  onOpen,
}: {
  sources: ChatSourceRef[];
  onOpen?: (materialId: string) => void;
}) {
  if (sources.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Sources">
      {sources.map((source) => {
        const locator = sourceLocator(source);
        return (
          <button
            key={source.n}
            type="button"
            onClick={() => onOpen?.(source.materialId)}
            title={source.snippet || describe(source)}
            className="inline-flex h-7 max-w-[min(100%,260px)] items-center gap-1.5 rounded-full border border-border bg-surface px-2 text-[12px] leading-none text-muted transition-colors hover:border-foreground/25 hover:text-foreground"
          >
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-surface-2 text-[10px] font-medium text-foreground">
              {source.n}
            </span>
            <span className="min-w-0 truncate">{source.title}</span>
            {locator ? <span className="shrink-0 text-muted/80">{locator}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
