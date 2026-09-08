"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ParametersPanel } from "@/components/workspace/parameters-panel";
import { UiIcon } from "@/components/workspace/ui-icon";

export function ComposerParameters() {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

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
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Parameters"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-8 items-center gap-1 rounded-full px-2.5 text-[13px] transition-colors ${
          open ? "bg-surface text-foreground" : "text-muted hover:bg-surface hover:text-foreground"
        }`}
      >
        Gemini
        <UiIcon name="chevronDown" size={14} />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute bottom-[calc(100%+8px)] right-0 z-50 w-[220px] rounded-2xl bg-surface p-1.5 shadow-2xl ring-1 ring-border"
        >
          <ParametersPanel />
        </div>
      ) : null}
    </div>
  );
}
