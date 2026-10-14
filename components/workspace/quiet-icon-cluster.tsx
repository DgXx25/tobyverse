"use client";

import { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { UiIcon, type UiIconName } from "@/components/workspace/ui-icon";

export type QuietIconAction = {
  id: string;
  label: string;
  icon: UiIconName;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
};

type TipState = {
  label: string;
  rect: DOMRect;
};

const TIP_GAP = 8;
const TIP_FADE_MS = 140;

function isEventTargetInside(container: Node | null, target: EventTarget | null) {
  if (!container || !target || typeof Node === "undefined" || !(target instanceof Node)) return false;
  return container.contains(target);
}

export function QuietIconCluster({
  actions,
  className = "",
  size = 20,
}: {
  actions: QuietIconAction[];
  className?: string;
  size?: number;
}) {
  const tipId = useId();
  const clusterRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef(0);
  const [tip, setTip] = useState<TipState | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [visible, setVisible] = useState(false);

  const hide = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    setVisible(false);
    hideTimer.current = window.setTimeout(() => {
      setTip(null);
      setCoords(null);
    }, TIP_FADE_MS);
  }, []);

  const show = useCallback((label: string, node: HTMLElement) => {
    window.clearTimeout(hideTimer.current);
    setVisible(false);
    setTip({ label, rect: node.getBoundingClientRect() });
  }, []);

  function leaveCluster(event: MouseEvent<HTMLDivElement>) {
    if (isEventTargetInside(clusterRef.current, event.relatedTarget)) return;
    hide();
  }

  useEffect(() => {
    return () => window.clearTimeout(hideTimer.current);
  }, []);

  useEffect(() => {
    if (!tip) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") hide();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [tip, hide]);

  useEffect(() => {
    if (!tip) return;
    const tipNode = tipRef.current;
    const width = tipNode?.offsetWidth ?? 72;
    const height = tipNode?.offsetHeight ?? 28;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = tip.rect.left + tip.rect.width / 2;
    left = Math.min(vw - width / 2 - 8, Math.max(width / 2 + 8, left));
    let top = tip.rect.bottom + TIP_GAP;
    if (top + height > vh - 8) {
      top = tip.rect.top - TIP_GAP - height;
    }
    setCoords({ top, left });
    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, [tip]);

  return (
    <div
      ref={clusterRef}
      className={`flex items-center gap-0.5 ${className}`}
      onMouseLeave={leaveCluster}
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          disabled={action.disabled}
          aria-label={action.label}
          aria-current={action.active ? "true" : undefined}
          aria-disabled={action.disabled || undefined}
          aria-describedby={tip?.label === action.label ? tipId : undefined}
          onClick={() => {
            if (action.disabled) return;
            action.onClick();
          }}
          onMouseEnter={(event) => {
            if (action.disabled) return;
            show(action.label, event.currentTarget);
          }}
          onFocus={(event) => {
            if (action.disabled) return;
            show(action.label, event.currentTarget);
          }}
          onBlur={(event) => {
            if (isEventTargetInside(clusterRef.current, event.relatedTarget)) return;
            hide();
          }}
          className={`flex h-9 w-9 items-center justify-center rounded-[10px] shadow-none ${
            action.disabled
              ? "pointer-events-none cursor-default bg-transparent text-muted opacity-35"
              : action.active
                ? "cursor-pointer bg-surface-2 text-foreground"
                : "cursor-pointer bg-transparent text-muted hover:text-foreground"
          }`}
        >
          <UiIcon name={action.icon} size={size} />
        </button>
      ))}
      {tip && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={tipRef}
              id={tipId}
              role="tooltip"
              className={`pointer-events-none fixed z-[90] -translate-x-1/2 whitespace-nowrap rounded-lg bg-surface-2 px-3 py-1.5 text-[12px] leading-none text-foreground shadow-none transition-opacity duration-150 ease-out ${
                visible && coords ? "opacity-100" : "opacity-0"
              }`}
              style={{
                top: coords?.top ?? 0,
                left: coords?.left ?? 0,
              }}
            >
              {tip.label}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
