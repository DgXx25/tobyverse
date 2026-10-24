"use client";

import { useRef, type ComponentProps } from "react";
import { Drawer as DrawerPrimitive } from "vaul";

type DragSample = { position: number; t: number; v: number; element: HTMLElement | null };

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

function translateAlongAxis(el: HTMLElement, direction: NonNullable<ComponentProps<typeof DrawerPrimitive.Root>["direction"]>) {
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return 0;
  try {
    const matrix = new DOMMatrixReadOnly(t);
    return direction === "left" || direction === "right" ? matrix.m41 : matrix.m42;
  } catch {
    const inner = t.slice(t.indexOf("(") + 1, t.indexOf(")"));
    const parts = inner.split(",");
    if (t.startsWith("matrix3d") && parts.length >= 14) {
      return Number(parts[direction === "left" || direction === "right" ? 12 : 13]) || 0;
    }
    if (parts.length >= 6) return Number(parts[direction === "left" || direction === "right" ? 4 : 5]) || 0;
    return 0;
  }
}

function flingToClosed(drag: DragSample, direction: NonNullable<ComponentProps<typeof DrawerPrimitive.Root>["direction"]>) {
  const drawer = drag.element ?? document.querySelector<HTMLElement>("[data-vaul-drawer]");
  if (!drawer) return null;
  const current = translateAlongAxis(drawer, direction);
  // A click/escape dismissal has no in-flight drag to preserve; let Vaul run
  // its normal close animation for those cases.
  if (Math.abs(current) < 1) return null;

  const horizontal = direction === "left" || direction === "right";
  const dimension = horizontal ? drawer.getBoundingClientRect().width : drawer.getBoundingClientRect().height;
  const remaining = Math.max(dimension * 1.08 - Math.abs(current), 48);
  const closingSign = direction === "bottom" || direction === "right" ? 1 : -1;
  const speed = Math.max(drag.v * closingSign, 0.28);
  const duration = Math.min(0.36, Math.max(0.12, remaining / (speed * 1000)));
  const target =
    direction === "left" ? "translate3d(-110%, 0, 0)" :
    direction === "right" ? "translate3d(110%, 0, 0)" :
    direction === "top" ? "translate3d(0, -110%, 0)" :
    "translate3d(0, 110%, 0)";
  drawer.style.transition = `transform ${duration}s ${EASE}`;
  drawer.style.setProperty("--mobile-drawer-duration", `${duration}s`);
  drawer.style.transform = target;
  const overlay = drawer.parentElement?.querySelector<HTMLElement>("[data-vaul-overlay]");
  if (overlay) {
    overlay.style.transition = `opacity ${duration}s ${EASE}`;
    overlay.style.setProperty("--mobile-drawer-overlay-duration", `${duration}s`);
    overlay.style.opacity = "0";
  }
  return duration;
}

export function Drawer({
  shouldScaleBackground = false,
  handleOnly = false,
  autoFocus = true,
  direction = "bottom",
  onOpenChange,
  onDrag,
  onRelease,
  ...props
}: ComponentProps<typeof DrawerPrimitive.Root>) {
  const drag = useRef<DragSample>({ position: 0, t: 0, v: 0, element: null });
  const closing = useRef(false);

  return (
    <DrawerPrimitive.Root
      shouldScaleBackground={shouldScaleBackground}
      handleOnly={handleOnly}
      autoFocus={autoFocus}
      direction={direction}
      {...props}
      onDrag={(event, percent) => {
        const now = performance.now();
        const position = direction === "left" || direction === "right" ? event.pageX : event.pageY;
        const closingSign = direction === "bottom" || direction === "right" ? 1 : -1;
        if (drag.current.t) {
          const dt = now - drag.current.t;
          if (dt > 0 && dt < 100) drag.current.v = drag.current.v * 0.35 + (((position - drag.current.position) / dt) * closingSign) * 0.65;
          else drag.current.v = 0;
        }
        drag.current.position = position;
        drag.current.t = now;
        drag.current.element = event.currentTarget;
        onDrag?.(event, percent);
      }}
      onRelease={onRelease}
      onOpenChange={(open) => {
        if (open) {
          closing.current = false;
          drag.current = { position: 0, t: 0, v: 0, element: null };
          onOpenChange?.(true);
          return;
        }
        if (closing.current) return;
        const duration = flingToClosed(drag.current, direction);
        if (duration === null) {
          onOpenChange?.(false);
          return;
        }
        closing.current = true;
        const drawer = drag.current.element ?? document.querySelector<HTMLElement>("[data-vaul-drawer]");
        drag.current = { position: 0, t: 0, v: 0, element: null };
        const finish = () => {
          if (!closing.current) return;
          closing.current = false;
          drawer?.style.removeProperty("--mobile-drawer-duration");
          const overlay = drawer?.parentElement?.querySelector<HTMLElement>("[data-vaul-overlay]");
          overlay?.style.removeProperty("--mobile-drawer-overlay-duration");
          // Clear the swipe's inline opacity/transition before Vaul changes to
          // data-state=closed, so the normal close fade can run and the next
          // open starts from a clean style state.
          overlay?.style.removeProperty("opacity");
          overlay?.style.removeProperty("transition");
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
