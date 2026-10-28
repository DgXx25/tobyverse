"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ThemePicker } from "@/components/workspace/theme-picker";
import { UiIcon } from "@/components/workspace/ui-icon";

export function LandingSettingsMenu() {
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
      if (event.key !== "Escape") return;
      setOpen(false);
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
        aria-label="Settings"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          setOpen((current) => !current);
        }}
        className={`flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface-2 ${
          open ? "bg-surface-2" : ""
        }`}
      >
        <UiIcon name="settings" size={18} />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[240px] rounded-2xl bg-surface-2 p-1.5 shadow-2xl"
        >
          <div className="px-1.5 py-1">
            <ThemePicker />
          </div>
        </div>
      ) : null}
    </div>
  );
}
