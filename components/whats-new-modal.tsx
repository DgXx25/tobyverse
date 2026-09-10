"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { UiIcon } from "@/components/workspace/ui-icon";
import { markWhatsNewSeen, shouldShowWhatsNew, WHATS_NEW } from "@/lib/whats-new";

export function WhatsNewModal() {
  const [open, setOpen] = useState(false);
  const continueRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!shouldShowWhatsNew()) return;
    const timer = window.setTimeout(() => setOpen(true), 280);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    continueRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      markWhatsNewSeen();
      setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [open]);

  function dismiss() {
    markWhatsNewSeen();
    setOpen(false);
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="whats-new"
          className="fixed inset-0 z-[70] flex items-end justify-center bg-overlay p-4 sm:items-center"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) dismiss();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="whats-new-title"
            aria-describedby="whats-new-lead"
            className="relative w-full max-w-[420px] overflow-hidden rounded-2xl bg-surface shadow-2xl"
            initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={dismiss}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-foreground"
              aria-label="Close"
            >
              <UiIcon name="close" size={16} />
            </button>

            <div className="px-6 pb-6 pt-7 sm:px-7">
              <span
                className="mb-4 block h-8 w-8 bg-foreground"
                style={{
                  WebkitMask: "url(/logo.svg) center / contain no-repeat",
                  mask: "url(/logo.svg) center / contain no-repeat",
                }}
                aria-hidden
              />
              <p className="text-[12px] font-medium tracking-wide text-muted">{WHATS_NEW.eyebrow}</p>
              <h2 id="whats-new-title" className="mt-1 text-[22px] font-semibold tracking-tight text-foreground">
                {WHATS_NEW.title}
              </h2>
              <p id="whats-new-lead" className="mt-2 text-[14px] leading-6 text-muted">
                {WHATS_NEW.lead}
              </p>

              <ul className="mt-6 space-y-4">
                {WHATS_NEW.items.map((item) => (
                  <li key={item.title} className="flex gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-foreground">
                      <UiIcon name={item.icon} size={18} className="accent-symbol" />
                    </span>
                    <span className="min-w-0 pt-0.5">
                      <span className="flex items-center gap-2">
                        <span className="text-[15px] font-medium text-foreground">{item.title}</span>
                        {item.badge ? (
                          <span className="rounded-full bg-[var(--highlight-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--highlight)]">
                            {item.badge}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-5 text-muted">{item.body}</span>
                    </span>
                  </li>
                ))}
              </ul>

              <button
                ref={continueRef}
                type="button"
                onClick={dismiss}
                className="mt-7 flex h-11 w-full items-center justify-center rounded-full bg-foreground text-[14px] font-medium text-background"
              >
                Continue
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
