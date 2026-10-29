"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { ModelOptions } from "@/components/workspace/model-options";
import { UiIcon } from "@/components/workspace/ui-icon";
import { usePreferredModel } from "@/components/account/use-preferred-model";
import { AI_EFFORT_LEVELS, DEFAULT_AI_EFFORT, aiEffortDisplayName } from "@/lib/ai/catalog";
import type { ChatMode } from "@/types/chat";

export function ComposerParameters({
  mode: _mode,
  onMode: _onMode,
}: {
  mode?: ChatMode;
  onMode?: (mode: ChatMode) => void;
}) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelView, setPanelView] = useState<"effort" | "model">("effort");
  const [panelVisible, setPanelVisible] = useState(true);
  const { name, model, effort, effortName, setEffort } = usePreferredModel();
  const effortIndex = AI_EFFORT_LEVELS.indexOf(effort);
  const selectedLabel = model === "auto" ? "Auto" : name.replace("Claude ", "");

  function switchPanelView(next: "effort" | "model") {
    if (next === panelView || panelTimerRef.current !== null) return;
    setPanelVisible(false);
    panelTimerRef.current = window.setTimeout(() => {
      panelTimerRef.current = null;
      setPanelView(next);
      window.requestAnimationFrame(() => setPanelVisible(true));
    }, 150);
  }

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), 160);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (open) return;
    if (panelTimerRef.current !== null) window.clearTimeout(panelTimerRef.current);
    panelTimerRef.current = null;
    setPanelView("effort");
    setPanelVisible(true);
  }, [open]);

  useEffect(() => () => {
    if (panelTimerRef.current !== null) window.clearTimeout(panelTimerRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;

    function onPointer(event: MouseEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex items-center gap-0.5">
      <button
        type="button"
        aria-label={`Model ${name}, effort ${effortName}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-8 items-center gap-1 rounded-full px-2.5 text-[13px] transition-colors ${
          open ? "bg-surface text-foreground" : "text-muted hover:bg-surface hover:text-foreground"
        }`}
      >
        <span>{selectedLabel}</span>
        <span className="text-muted">{effortName}</span>
        <UiIcon name="chevronDown" size={14} />
      </button>
      {mounted ? (
        <div
          id={menuId}
          role="dialog"
          aria-label={panelView === "effort" ? "Effort settings" : "Select model"}
          className={`absolute bottom-[calc(100%+8px)] right-0 z-50 w-[min(288px,calc(100vw-32px))] min-h-[154px] rounded-2xl border border-border bg-surface p-3 motion-reduce:transition-none ${open ? "composer-menu-enter" : "composer-menu-exit"}`}
        >
          <div className={`transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none ${panelVisible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}>
            {panelView === "effort" ? (
              <>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[11px] leading-4 text-muted">Effort</span>
                      <p className="text-[15px] font-semibold leading-5 text-accent">{effortName}</p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Select model. Current model: ${name}`}
                      aria-haspopup="listbox"
                      onClick={() => switchPanelView("model")}
                      className="group/model -ml-1 flex max-w-full items-center gap-1 rounded-md px-1 text-left text-[12px] leading-5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <span className="truncate">{name}</span>
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
                    className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16.2 9.2a6.3 6.3 0 1 0 .1 2.1" />
                      <path d="M16.2 4.8v4.5h-4.5" />
                    </svg>
                  </button>
                </div>

                <div className="relative px-1">
                  <input
                    aria-label="Effort"
                    aria-valuetext={effortName}
                    className="effort-range"
                    type="range"
                    min={0}
                    max={AI_EFFORT_LEVELS.length - 1}
                    step={1}
                    value={effortIndex}
                    onChange={(event) => setEffort(AI_EFFORT_LEVELS[Number(event.currentTarget.value)])}
                    style={{ "--effort-progress": `${(effortIndex / (AI_EFFORT_LEVELS.length - 1)) * 100}%` } as CSSProperties}
                  />
                  <div className="pointer-events-none absolute inset-x-[9px] top-[9px] flex justify-between" aria-hidden="true">
                    {AI_EFFORT_LEVELS.map((level, index) => (
                      <span key={level} className={`h-1 w-1 rounded-full ${index <= effortIndex ? "bg-white/90" : "bg-muted/60"}`} />
                    ))}
                  </div>
                </div>
                <div className="mt-1 flex justify-between px-0.5 text-[10px] text-muted" aria-hidden="true">
                  <span>Faster</span>
                  <span>More thinking</span>
                </div>
              </>
            ) : (
              <div>
                <div className="mb-2 flex h-7 items-center justify-between px-1">
                  <p className="text-[12px] font-medium text-muted">Select model</p>
                  <button
                    type="button"
                    aria-label="Back to effort settings"
                    onClick={() => switchPanelView("effort")}
                    className="grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 3 5 8l5 5" />
                    </svg>
                  </button>
                </div>
                <ModelOptions compact onPicked={() => switchPanelView("effort")} />
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
