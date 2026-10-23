"use client";

import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { unwrapLatex } from "@/lib/visuals/math";

export type FormulaProps = { source: string; display?: boolean };

export function Formula({ source, display = false }: FormulaProps) {
  const latex = unwrapLatex(source);
  const result = useMemo(() => {
    if (!latex) return null;
    try {
      const html = katex.renderToString(latex, {
        throwOnError: false,
        displayMode: display,
        output: "html",
        strict: false,
      });
      return html && !html.includes("katex-error") ? html : null;
    } catch {
      return null;
    }
  }, [latex, display]);

  if (!latex) return null;
  if (!result) return <span className="font-mono text-[15px] text-foreground">{latex}</span>;

  return (
    <span
      className={display ? "katex-display-host" : "katex-host"}
      dangerouslySetInnerHTML={{ __html: result }}
    />
  );
}
