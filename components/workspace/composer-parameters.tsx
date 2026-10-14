"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ModelOptions } from "@/components/workspace/model-options";
import { UiIcon } from "@/components/workspace/ui-icon";
import { usePreferredModel } from "@/components/account/use-preferred-model";
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
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { name } = usePreferredModel();

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), 160);
    return () => window.clearTimeout(timer);
  }, [open]);

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
        aria-label="Model"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-8 items-center gap-1 rounded-full px-2.5 text-[13px] transition-colors ${
          open ? "bg-surface text-foreground" : "text-muted hover:bg-surface hover:text-foreground"
        }`}
      >
        {name}
        <UiIcon name="chevronDown" size={14} />
      </button>
      {mounted ? (
        <div
          id={menuId}
          className={`absolute bottom-[calc(100%+8px)] right-0 z-50 w-[min(220px,calc(100vw-32px))] rounded-2xl bg-surface-2 p-1.5 shadow-2xl ring-1 ring-border motion-reduce:transition-none ${open ? "composer-menu-enter" : "composer-menu-exit"}`}
        >
          <ModelOptions compact onPicked={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
