"use client";

import { useEffect, useRef } from "react";

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const LOCK_PX = 10;
const OPEN_W = 273;
const CLOSED_W = 64;
const RANGE = OPEN_W - CLOSED_W;

type Sample = { x: number; y: number; t: number; v: number };

function interactive(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function flingMs(distance: number, velocity: number) {
  const speed = Math.max(Math.abs(velocity), 0.28);
  return Math.min(280, Math.max(140, distance / speed));
}

export function useSidebarSwipe(input: {
  panel: { current: HTMLElement | null };
  overlay?: { current: HTMLElement | null };
  enabled: boolean;
  kind: "rail" | "sheet";
  collapsed?: boolean;
  onCollapse: () => void;
  onExpand?: () => void;
}) {
  const collapsedRef = useRef(input.collapsed === true);
  const onCollapseRef = useRef(input.onCollapse);
  const onExpandRef = useRef(input.onExpand);
  collapsedRef.current = input.collapsed === true;
  onCollapseRef.current = input.onCollapse;
  onExpandRef.current = input.onExpand;

  useEffect(() => {
    const root = input.panel.current;
    if (!root || !input.enabled) return;
    const el = root;
    const kind = input.kind;

    const drag: Sample = { x: 0, y: 0, t: 0, v: 0 };
    let originX = 0;
    let originY = 0;
    let locked = false;
    let tracking = false;
    let pointerId = -1;
    let offset = 0;
    let suppressClick = false;
    let sheetW = 320;
    let raf = 0;

    function setDragging(on: boolean) {
      el.classList.toggle("sidebar-dragging", on);
    }

    function apply(next: number) {
      offset = next;
      if (kind === "sheet") {
        const x = Math.min(0, Math.max(-sheetW, -next));
        el.style.transform = `translate3d(${x}px, 0, 0)`;
        const layer = input.overlay?.current;
        if (layer) layer.style.opacity = String(1 - Math.min(1, next / sheetW));
        return;
      }
      const collapsed = collapsedRef.current;
      el.style.width = `${Math.min(OPEN_W, Math.max(CLOSED_W, collapsed ? CLOSED_W + next : OPEN_W - next))}px`;
    }

    function paint(next: number) {
      offset = next;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        apply(offset);
      });
    }

    function clearPaint() {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      el.style.transition = "";
      el.style.transform = "";
      el.style.width = "";
      const layer = input.overlay?.current;
      if (layer) {
        layer.style.transition = "";
        layer.style.opacity = "";
      }
    }

    function settle(commit: boolean) {
      const collapsed = collapsedRef.current;
      const remaining = Math.max(kind === "sheet" ? (commit ? sheetW - offset : offset) : commit ? RANGE - offset : offset, 24);
      const duration = flingMs(remaining, drag.v) / 1000;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      apply(offset);
      el.style.transition = kind === "sheet" ? `transform ${duration}s ${EASE}` : `width ${duration}s ${EASE}`;
      if (kind === "sheet") {
        el.style.transform = commit ? "translate3d(-110%, 0, 0)" : "translate3d(0, 0, 0)";
        const layer = input.overlay?.current;
        if (layer) {
          layer.style.transition = `opacity ${duration}s ${EASE}`;
          layer.style.opacity = commit ? "0" : "1";
        }
      } else {
        const expand = collapsed ? commit : !commit;
        el.style.width = `${expand ? OPEN_W : CLOSED_W}px`;
      }

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        setDragging(false);
        if (commit) {
          if (kind === "rail" && collapsed) onExpandRef.current?.();
          else onCollapseRef.current();
        }
        requestAnimationFrame(() => {
          requestAnimationFrame(clearPaint);
        });
      };
      el.addEventListener(
        "transitionend",
        (event) => {
          if (event.target !== el) return;
          if (kind === "sheet" ? event.propertyName === "transform" : event.propertyName === "width") finish();
        },
        { once: true },
      );
      window.setTimeout(finish, Math.ceil(duration * 1000) + 60);
    }

    function onMove(event: PointerEvent) {
      if (!tracking || event.pointerId !== pointerId) return;
      const dx = event.clientX - originX;
      const dy = event.clientY - originY;
      const dt = event.timeStamp - drag.t;
      if (dt > 0 && dt < 80) {
        drag.v = drag.v * 0.35 + ((event.clientX - drag.x) / dt) * 0.65;
      }
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.t = event.timeStamp;

      if (!locked) {
        if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
        const collapsed = collapsedRef.current;
        const dismiss =
          kind === "sheet" || !collapsed ? dx < 0 && Math.abs(dx) > Math.abs(dy) : dx > 0 && Math.abs(dx) > Math.abs(dy);
        if (!dismiss) {
          tracking = false;
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onUp);
          return;
        }
        locked = true;
        setDragging(true);
        el.style.transition = "none";
        const layer = input.overlay?.current;
        if (layer) layer.style.transition = "none";
        try {
          el.setPointerCapture(event.pointerId);
        } catch {
          /* capture is best-effort */
        }
      }

      event.preventDefault();
      const collapsed = collapsedRef.current;
      const raw = kind === "rail" && collapsed ? dx : -dx;
      const max = kind === "sheet" ? sheetW : RANGE;
      paint(Math.min(max, Math.max(0, raw)));
    }

    function onUp(event: PointerEvent) {
      if (!tracking || event.pointerId !== pointerId) return;
      tracking = false;
      const wasLocked = locked;
      locked = false;
      pointerId = -1;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      try {
        if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      if (!wasLocked) return;
      suppressClick = true;
      const collapsed = collapsedRef.current;
      const away = kind === "rail" && collapsed ? drag.v : -drag.v;
      const limit = kind === "sheet" ? sheetW : RANGE;
      settle(offset > limit * 0.32 || away > 0.45);
    }

    function onDown(event: PointerEvent) {
      if (event.button !== 0 || interactive(event.target)) return;
      tracking = true;
      locked = false;
      pointerId = event.pointerId;
      originX = event.clientX;
      originY = event.clientY;
      offset = 0;
      sheetW = el.getBoundingClientRect().width || 320;
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.t = event.timeStamp;
      drag.v = 0;
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    }

    function onClick(event: MouseEvent) {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    }

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("click", onClick, true);
      setDragging(false);
      clearPaint();
    };
  }, [input.panel, input.overlay, input.enabled, input.kind]);
}
