"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ThemePicker } from "@/components/workspace/theme-picker";
import { ParametersPanel } from "@/components/workspace/parameters-panel";
import { UiIcon } from "@/components/workspace/ui-icon";

export function LandingSettingsMenu() {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<"home" | "parameters">("home");

  useEffect(() => {
    if (!open) return;

    function onPointer(event: MouseEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setPage("home");
    }

    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (page === "parameters") {
        setPage("home");
        return;
      }
      setOpen(false);
    }

    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, page]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Settings"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          setOpen((current) => !current);
          setPage("home");
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
          {page === "home" ? (
            <>
              <div className="px-1.5 py-1">
                <ThemePicker />
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => setPage("parameters")}
                className="mt-0.5 flex h-10 w-full items-center gap-3 rounded-xl px-2.5 text-left text-[14px] text-foreground hover:bg-foreground/10"
              >
                <UiIcon name="sliders" size={18} className="accent-symbol" />
                Parameters
              </button>
            </>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => setPage("home")}
                className="mb-1 flex h-10 w-full items-center gap-2 rounded-xl px-2 text-[14px] text-foreground hover:bg-foreground/10"
              >
                <UiIcon name="back" size={16} />
                Parameters
              </button>
              <div className="px-0.5 pb-1">
                <ParametersPanel />
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
