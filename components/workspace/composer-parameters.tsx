"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ModelOptions } from "@/components/workspace/model-options";
import { ChatModeMenu, chatModeLabel } from "@/components/workspace/slash-menu";
import { UiIcon } from "@/components/workspace/ui-icon";
import { usePreferredModel } from "@/components/account/use-preferred-model";
import type { ChatMode } from "@/types/chat";

export function ComposerParameters({
  mode,
  onMode,
}: {
  mode?: ChatMode;
  onMode?: (mode: ChatMode) => void;
}) {
  const menuId = useId();
  const modeMenuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<"model" | "mode" | null>(null);
  const { name } = usePreferredModel();

  useEffect(() => {
    if (!open) return;

    function onPointer(event: MouseEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(null);
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(null);
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
      {mode && onMode ? (
        <div className="relative">
          <button
            type="button"
            aria-label="Reply style"
            aria-haspopup="listbox"
            aria-expanded={open === "mode"}
            aria-controls={modeMenuId}
            onClick={() => setOpen((current) => (current === "mode" ? null : "mode"))}
            className={`flex h-8 items-center gap-1 rounded-full px-2.5 text-[13px] transition-colors ${
              open === "mode" ? "bg-surface text-foreground" : "text-muted hover:bg-surface hover:text-foreground"
            }`}
          >
            {chatModeLabel(mode)}
            <UiIcon name="chevronDown" size={14} />
          </button>
          {open === "mode" ? (
            <div
              id={modeMenuId}
              className="absolute bottom-[calc(100%+8px)] right-0 z-50 min-w-[240px] rounded-2xl bg-surface-2 p-1.5 shadow-2xl ring-1 ring-border"
            >
              <ChatModeMenu
                mode={mode}
                onPick={(next) => {
                  onMode(next);
                  setOpen(null);
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        aria-label="Model"
        aria-haspopup="listbox"
        aria-expanded={open === "model"}
        aria-controls={menuId}
        onClick={() => setOpen((current) => (current === "model" ? null : "model"))}
        className={`flex h-8 items-center gap-1 rounded-full px-2.5 text-[13px] transition-colors ${
          open === "model" ? "bg-surface text-foreground" : "text-muted hover:bg-surface hover:text-foreground"
        }`}
      >
        {name}
        <UiIcon name="chevronDown" size={14} />
      </button>
      {open === "model" ? (
        <div
          id={menuId}
          className="absolute bottom-[calc(100%+8px)] right-0 z-50 min-w-[220px] rounded-2xl bg-surface-2 p-1.5 shadow-2xl ring-1 ring-border"
        >
          <ModelOptions compact onPicked={() => setOpen(null)} />
        </div>
      ) : null}
    </div>
  );
}
