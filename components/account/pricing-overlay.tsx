"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { PlansPage } from "@/components/account/plans-page";

/** Shows the real pricing page over the current screen without changing its route. */
export function PricingOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setPortalTarget(open ? document.body : null);
  }, [open]);

  useEffect(() => {
    if (!open || !portalTarget) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open, onClose, portalTarget]);

  if (!open || !portalTarget) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose a TobyVerse plan"
      className="fixed inset-0 z-[120] overflow-y-auto bg-[#0a0a0a] text-[#ececec]"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <button
        ref={closeButton}
        type="button"
        onClick={onClose}
        aria-label="Close plan selection"
        className="fixed right-4 top-4 z-[130] flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-[#1b1b1b]/90 text-white shadow-lg backdrop-blur transition hover:bg-[#303030] sm:right-6 sm:top-6"
      >
        <X size={19} aria-hidden="true" />
      </button>
      <PlansPage />
    </div>,
    portalTarget,
  );
}
