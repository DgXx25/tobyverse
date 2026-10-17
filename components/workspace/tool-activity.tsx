"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { UiIcon } from "@/components/workspace/ui-icon";
import type { ToolStatusUpdate } from "@/lib/ai/tool-execution";

export function ToolActivity({ rows, status, startedAt }: {
  rows: ToolStatusUpdate[];
  status?: string;
  startedAt?: number;
}) {
  const since = useRef(startedAt ?? Date.now());
  const [now, setNow] = useState(() => Date.now());
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const working = rows.some((row) => row.phase === "start");
  const seconds = Math.max(0, Math.floor((now - since.current) / 1000));

  return (
    <div className="flex min-w-0 flex-col gap-4 py-1 text-[14px] leading-5 text-muted">
      <ol role="log" aria-label="Tool activity" aria-live="polite" className="flex min-w-0 flex-col gap-3">
        {rows.map((row, index) => {
          const label = row.toolName === "search_images"
            ? row.phase === "start" ? "Searching images" : row.phase === "complete" ? "Searched images" : "Image search unavailable"
            : row.status.replace(/[.…]+$/, "");
          return (
            <motion.li key={row.id} layout="position" initial={reducedMotion ? false : { opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}
              className="relative flex min-w-0 items-start gap-2.5" title={row.status}>
              {index < rows.length - 1 || !working ? (
                <span aria-hidden="true" className="absolute bottom-[-12px] left-[7px] top-5 w-px bg-muted opacity-25" />
              ) : null}
              <UiIcon name={row.phase === "error" ? "warning" : row.toolName === "search_images" ? "imageSearch" : row.toolName === "load_skill" ? "book" : "spark"}
                size={15} className="mt-0.5 shrink-0 opacity-75" />
              <span className="min-w-0">
                <span className={row.phase === "start" ? "status-shimmer" : ""}>{label}</span>
                {row.detail ? <code className="ml-2 break-words font-mono text-[12px] text-muted opacity-80 [overflow-wrap:anywhere]">{row.detail}</code> : null}
              </span>
            </motion.li>
          );
        })}
        {!working ? (
          <li className="flex items-center gap-2.5">
            <UiIcon name="bulb" size={15} className="shrink-0 opacity-60" />
            <span className="status-shimmer">{rows.length ? "Thinking" : status || "Thinking"}</span>
          </li>
        ) : null}
      </ol>
      <div className="flex items-center gap-2.5 text-[13px]">
        <UiIcon name="spark" size={12} className="shrink-0 text-accent" />
        <span className="tabular-nums">Working for {seconds}s</span>
      </div>
    </div>
  );
}
