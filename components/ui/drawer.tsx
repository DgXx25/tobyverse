"use client";

import { useRef, type ComponentProps } from "react";
import { Drawer as DrawerPrimitive } from "vaul";

type DragSample = { y: number; t: number; v: number };

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

function translateY(el: HTMLElement) {
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return 0;
  try {
    return new DOMMatrixReadOnly(t).m42;
  } catch {
    const inner = t.slice(t.indexOf("(") + 1, t.indexOf(")"));
    const parts = inner.split(",");
    if (t.startsWith("matrix3d") && parts.length >= 14) return Number(parts[13]) || 0;
    if (parts.length >= 6) return Number(parts[5]) || 0;
    return 0;
  }
}

function flingToClosed(velocityPxPerMs: number) {
  const drawer = document.querySelector<HTMLElement>("[data-vaul-drawer]");
  const overlay = document.querySelector<HTMLElement>("[data-vaul-overlay]");
  if (!drawer) return 0.28;
  const current = Math.max(translateY(drawer), 0);
  const remaining = Math.max(drawer.getBoundingClientRect().height * 1.08 - current, 64);
  const speed = Math.max(velocityPxPerMs, 0.28);
  const duration = Math.min(0.36, Math.max(0.12, remaining / (speed * 1000)));
  drawer.style.transition = `transform ${duration}s ${EASE}`;
  drawer.style.transform = "translate3d(0, 110%, 0)";
  if (overlay) {
    overlay.style.transition = `opacity ${duration}s ${EASE}`;
    overlay.style.opacity = "0";
  }
  return duration;
}

export function Drawer({
  shouldScaleBackground = false,
  handleOnly = false,
  autoFocus = true,
  onOpenChange,
  onDrag,
  onRelease,
  ...props
}: ComponentProps<typeof DrawerPrimitive.Root>) {
  const drag = useRef<DragSample>({ y: 0, t: 0, v: 0 });
  const closing = useRef(false);

  return (
    <DrawerPrimitive.Root
      shouldScaleBackground={shouldScaleBackground}
      handleOnly={handleOnly}
      autoFocus={autoFocus}
      {...props}
      onDrag={(event, percent) => {
        const now = performance.now();
        const y = event.pageY;
        if (drag.current.t) {
          const dt = now - drag.current.t;
          if (dt > 0 && dt < 80) {
            drag.current.v = drag.current.v * 0.35 + ((y - drag.current.y) / dt) * 0.65;
          }
        }
        drag.current.y = y;
        drag.current.t = now;
        onDrag?.(event, percent);
      }}
      onRelease={onRelease}
      onOpenChange={(open) => {
        if (open) {
          closing.current = false;
          drag.current = { y: 0, t: 0, v: 0 };
          onOpenChange?.(true);
          return;
        }
        if (closing.current) return;
        closing.current = true;
        const duration = flingToClosed(drag.current.v);
        drag.current = { y: 0, t: 0, v: 0 };
        const drawer = document.querySelector<HTMLElement>("[data-vaul-drawer]");
        const finish = () => {
          if (!closing.current) return;
          closing.current = false;
          onOpenChange?.(false);
        };
        drawer?.addEventListener(
          "transitionend",
          (event) => {
            if (event.propertyName === "transform") finish();
          },
          { once: true },
        );
        window.setTimeout(finish, Math.ceil(duration * 1000) + 80);
      }}
    />
  );
}

export const DrawerTrigger = DrawerPrimitive.Trigger;
export const DrawerPortal = DrawerPrimitive.Portal;
export const DrawerClose = DrawerPrimitive.Close;
export const DrawerTitle = DrawerPrimitive.Title;
export const DrawerDescription = DrawerPrimitive.Description;
export const DrawerHandle = DrawerPrimitive.Handle;

export function DrawerOverlay({ className = "", ...props }: ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return <DrawerPrimitive.Overlay className={`fixed inset-0 z-[60] bg-black/50 ${className}`} {...props} />;
}

export function DrawerContent({
  className = "",
  children,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: ComponentProps<typeof DrawerPrimitive.Content>) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        {...props}
        className={`fixed inset-x-0 bottom-0 z-[60] mt-24 flex max-h-[92dvh] min-h-[52dvh] flex-col rounded-t-[22px] bg-surface outline-none ${className}`}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          onOpenAutoFocus?.(event);
          const target = event.currentTarget;
          if (target instanceof HTMLElement) target.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onCloseAutoFocus?.(event);
        }}
      >
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}
