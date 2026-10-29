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
  const currentStatus = status?.replace(/[.…]+$/, "") || "Thinking";

  return (
    <section aria-label="Assistant activity" className="flex min-w-0 flex-col gap-2 py-1 text-[14px] leading-5 text-muted">
      <ol role="log" aria-label="Work steps" aria-live="polite" className="flex min-w-0 flex-col">
        {rows.map((row, index) => {
          const active = row.phase === "start";
          const failed = row.phase === "error";
          const label = row.toolName === "search_images"
            ? active ? "Searching images" : failed ? "Image search unavailable" : "Searched images"
            : row.status.replace(/[.…]+$/, "");
          const icon = failed ? "warning" : row.phase === "complete" ? "check" : row.toolName === "search_images" ? "imageSearch" : row.toolName === "load_skill" ? "book" : "spark";

          return (
            <motion.li
              key={row.id}
              layout="position"
              initial={reducedMotion ? false : { opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative flex min-w-0 items-start gap-2.5 py-1"
              title={row.status}
            >
              {index < rows.length - 1 || !working ? (
                <span aria-hidden="true" className="absolute bottom-[-5px] left-[7px] top-5 w-px bg-border" />
              ) : null}
              <span className={`relative z-[1] mt-0.5 grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full ${active ? "text-accent" : failed ? "text-red-400" : "text-muted"}`}>
                {active ? <span aria-hidden="true" className="absolute inset-0 rounded-full border border-accent/50 animate-ping motion-reduce:animate-none" /> : null}
                <UiIcon name={icon} size={active ? 14 : 13} className={active ? "text-accent" : "opacity-75"} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={active ? "status-shimmer" : failed ? "text-red-400" : ""}>{label}</span>
                {row.detail ? <code className="ml-2 break-words font-mono text-[12px] text-muted opacity-80 [overflow-wrap:anywhere]">{row.detail}</code> : null}
              </span>
            </motion.li>
          );
        })}
        {!working ? (
          <motion.li
            key="thinking"
            initial={reducedMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex min-w-0 items-start gap-2.5 py-1"
          >
            <span className="mt-0.5 grid h-[15px] w-[15px] shrink-0 place-items-center text-accent">
              <UiIcon name="spark" size={13} />
            </span>
            <span className="status-shimmer min-w-0 truncate">{currentStatus}</span>
          </motion.li>
        ) : null}
      </ol>
      <div className="flex items-center gap-2.5 pl-[25px] text-[12px] text-muted">
        <span aria-hidden="true" className="h-1 w-1 rounded-full bg-accent/70" />
        <span className="tabular-nums">{working ? "Working" : "Thinking"} · {seconds}s</span>
      </div>
    </section>
  );
}
