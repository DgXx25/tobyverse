"use client";

import type { ComponentProps } from "react";
import { Drawer as DrawerPrimitive } from "vaul";

export function Drawer({
  shouldScaleBackground = false,
  handleOnly = true,
  ...props
}: ComponentProps<typeof DrawerPrimitive.Root>) {
  return (
    <DrawerPrimitive.Root shouldScaleBackground={shouldScaleBackground} handleOnly={handleOnly} {...props} />
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

export function DrawerContent({ className = "", children, ...props }: ComponentProps<typeof DrawerPrimitive.Content>) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        className={`fixed inset-x-0 bottom-0 z-[60] mt-24 flex max-h-[92dvh] min-h-[52dvh] flex-col rounded-t-[22px] bg-surface outline-none ${className}`}
        {...props}
      >
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}
