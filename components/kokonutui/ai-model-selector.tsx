"use client";

/**
 * Model and effort picker adapted from Kokonut UI's AI Model Selector.
 * Upstream: https://github.com/kokonut-labs/kokonutui (MIT)
 * TobyVerse adaptation: app theme, account preferences, and two-view fade interaction.
 */

import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { UiIcon } from "@/components/workspace/ui-icon";
import { usePreferredModel } from "@/components/account/use-preferred-model";
import { AI_EFFORT_LEVELS, DEFAULT_AI_EFFORT, aiEffortDisplayName, type AiEffort, type AiModelSelection } from "@/lib/ai/catalog";

type PanelView = "effort" | "model";

const easeOut = [0.23, 1, 0.32, 1] as const;

function effortHint(effort: AiEffort): string {
  switch (effort) {
    case "low": return "Quick replies with lighter reasoning.";
    case "medium": return "A balanced pace for everyday questions.";
    case "high": return "Thinks longer through more difficult tasks.";
    case "xhigh": return "Takes extra time for careful, multi-step work.";
    case "max": return "Uses the most effort for the hardest tasks.";
  }
}

function EffortGlyph({ level, count }: { level: number; count: number }) {
  return (
    <span aria-hidden="true" className="flex h-3 items-end gap-[2px]">
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className={`w-[3px] rounded-[1px] transition-colors duration-200 ${index <= level ? "bg-accent" : "bg-foreground/20"}`}
          style={{ height: `${((index + 1) / count) * 100}%` }}
        />
      ))}
    </span>
  );
}

function EffortTrack({ value, onChange, labelId }: { value: number; onChange: (index: number) => void; labelId: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const count = AI_EFFORT_LEVELS.length;

  function indexAt(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return value;
    return Math.max(0, Math.min(count - 1, Math.floor(((clientX - rect.left) / rect.width) * count)));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, number> = {
      ArrowLeft: value - 1,
      ArrowDown: value - 1,
      ArrowRight: value + 1,
      ArrowUp: value + 1,
      Home: 0,
      End: count - 1,
    };
    if (event.key in steps) {
      event.preventDefault();
      onChange(Math.max(0, Math.min(count - 1, steps[event.key])));
    }
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    onChange(indexAt(event.clientX));
  }

  return (
    <div
      aria-labelledby={labelId}
      aria-valuemax={count - 1}
      aria-valuemin={0}
      aria-valuenow={value}
      aria-valuetext={aiEffortDisplayName(AI_EFFORT_LEVELS[value])}
      className="h-9 cursor-pointer touch-none select-none rounded-lg bg-foreground/[0.06] p-1 outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      onKeyDown={onKeyDown}
      onLostPointerCapture={() => setDragging(false)}
      onPointerDown={startDrag}
      onPointerMove={(event) => {
        if (!dragging) return;
        const next = indexAt(event.clientX);
        if (next !== value) onChange(next);
      }}
      onPointerUp={() => setDragging(false)}
      role="slider"
      tabIndex={0}
    >
      <div className="relative flex h-full" ref={trackRef}>
        <motion.span
          aria-hidden="true"
          className="absolute inset-y-0 rounded-md bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.14)] ring-1 ring-border/70"
          initial={false}
          animate={{ left: `${(value / count) * 100}%`, width: `${100 / count}%` }}
          transition={{ duration: dragging ? 0.1 : 0.22, ease: easeOut }}
        />
        {AI_EFFORT_LEVELS.map((effort, index) => (
          <span
            key={effort}
            aria-hidden="true"
            className={`relative flex flex-1 items-center justify-center text-[11px] transition-colors duration-150 ${index === value ? "font-medium text-foreground" : "text-muted"}`}
          >
            {aiEffortDisplayName(effort)}
          </span>
        ))}
      </div>
    </div>
  );
}

function modelDescription(id: AiModelSelection, fallback: string) {
  if (id === "auto") return "Recommended model for each request";
  if (id === "gpt-6-luna") return "Efficient multilingual model · OpenAI";
  if (id === "deepseek-flash") return "Strong quality for the cost · DeepSeek";
  return fallback.replace("Claude ", "Fast, capable · Claude ");
}

export function AIModelSelector() {
  const { name, model, effort, effortName, options, setEffort, setModel } = usePreferredModel();
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const effortLabelId = useId();
  const [open, setOpen] = useState(false);
  const [panelView, setPanelView] = useState<PanelView>("effort");
  const effortIndex = Math.max(0, AI_EFFORT_LEVELS.indexOf(effort));

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setPanelView("effort");
  }, [open]);

  const motionTransition = reduceMotion ? { duration: 0 } : { duration: 0.17, ease: easeOut };

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative flex items-center" ref={rootRef}>
        <button
          ref={triggerRef}
          type="button"
          aria-label={`Model ${name}, effort ${effortName}. Change selection`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
          className={`flex h-8 max-w-[min(260px,65vw)] items-center gap-2 rounded-full px-3 text-[13px] transition-colors ${open ? "bg-surface text-foreground" : "text-muted hover:bg-surface hover:text-foreground"}`}
        >
          <span className="truncate font-medium">{model === "auto" ? "Default" : name}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-muted">
            <EffortGlyph count={AI_EFFORT_LEVELS.length} level={effortIndex} />
            <span>{effortName}</span>
          </span>
          <UiIcon name="chevronDown" size={13} className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>

        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              id={panelId}
              role="dialog"
              aria-label={panelView === "effort" ? "Effort settings" : "Select model"}
              className="absolute bottom-full left-0 z-50 mb-2 w-[min(304px,calc(100vw-32px))] origin-bottom-left overflow-hidden rounded-2xl border border-border/80 bg-surface p-1.5 text-foreground shadow-[0_12px_36px_rgba(0,0,0,0.3)] ring-1 ring-white/[0.025]"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.97, y: 5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 3 }}
              transition={motionTransition}
            >
              <AnimatePresence initial={false} mode="wait">
                {panelView === "effort" ? (
                  <motion.div
                    key="effort"
                    initial={reduceMotion ? false : { opacity: 0, y: 5, filter: "blur(2px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, filter: "blur(2px)" }}
                    transition={motionTransition}
                    className="px-2 pt-2 pb-1"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span id={effortLabelId} className="text-[11px] text-muted">Effort</span>
                          <p className="text-[15px] font-semibold leading-5 text-accent">{effortName}</p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Select model. Current model: ${name}`}
                          aria-haspopup="listbox"
                          onClick={() => setPanelView("model")}
                          className="group/model -ml-1 flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left text-[12px] text-muted transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          <span className="truncate">{model === "auto" ? "Default" : name}</span>
                          <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3 shrink-0 fill-none stroke-current transition-transform group-hover/model:translate-x-0.5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m6 3 5 5-5 5" />
                          </svg>
                        </button>
                      </div>
                      <button
                        type="button"
                        aria-label={`Reset effort to ${aiEffortDisplayName(DEFAULT_AI_EFFORT)}`}
                        title={`Reset to ${aiEffortDisplayName(DEFAULT_AI_EFFORT)}`}
                        onClick={() => setEffort(DEFAULT_AI_EFFORT)}
                        className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M16.2 9.2a6.3 6.3 0 1 0 .1 2.1" />
                          <path d="M16.2 4.8v4.5h-4.5" />
                        </svg>
                      </button>
                    </div>
                    <EffortTrack
                      labelId={effortLabelId}
                      value={effortIndex}
                      onChange={(index) => setEffort(AI_EFFORT_LEVELS[index])}
                    />
                    <div className="relative mt-2 h-8">
                      <AnimatePresence initial={false} mode="popLayout">
                        <motion.p
                          key={effort}
                          initial={reduceMotion ? false : { opacity: 0, filter: "blur(2px)" }}
                          animate={{ opacity: 1, filter: "blur(0px)" }}
                          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(2px)" }}
                          transition={motionTransition}
                          className="absolute inset-x-0 top-0 text-[11px] leading-4 text-muted"
                        >
                          {effortHint(effort)}
                        </motion.p>
                      </AnimatePresence>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="model"
                    initial={reduceMotion ? false : { opacity: 0, y: 5, filter: "blur(2px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, filter: "blur(2px)" }}
                    transition={motionTransition}
                    className="px-1 py-1"
                  >
                    <div className="mb-1 flex h-8 items-center justify-between px-1.5">
                      <p className="text-[12px] font-medium text-muted">Select model</p>
                      <button
                        type="button"
                        aria-label="Back to effort settings"
                        onClick={() => setPanelView("effort")}
                        className="grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10 3 5 8l5 5" />
                        </svg>
                      </button>
                    </div>
                    <div role="listbox" aria-label="Model" className="max-h-[min(280px,50vh)] overflow-y-auto overscroll-contain pr-0.5">
                      {options.map((option) => {
                        const selected = option.id === model;
                        const isDefault = option.id === "auto";
                        return (
                          <button
                            key={option.id}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => {
                              setModel(option.id);
                              setPanelView("effort");
                            }}
                            className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left outline-none transition-colors focus-visible:bg-foreground/[0.06] ${selected ? "bg-foreground/[0.055]" : "hover:bg-foreground/[0.045]"}`}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium text-foreground">{isDefault ? "Default" : option.name}</span>
                              <span className="block truncate text-[11px] leading-4 text-muted">{modelDescription(option.id, option.name)}</span>
                            </span>
                            <span className="flex size-4 shrink-0 items-center justify-center text-accent">
                              {selected ? <UiIcon name="check" size={14} /> : option.paidOnly ? <span className="text-[10px] text-muted">Pro</span> : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
