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
      className="mx-[2px] inline-flex h-[17px] min-w-[17px] -translate-y-px items-center justify-center rounded-full bg-surface px-1 align-baseline text-[10px] font-medium leading-none text-muted transition-colors hover:text-foreground"
    >
      {n}
    </button>
  );
}
