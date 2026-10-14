"use client";

import { BrandMark } from "@/components/brand-mark";

export function LandingHeader() {
  return (
    <header className="relative z-10 flex h-16 shrink-0 items-center px-5 pt-[env(safe-area-inset-top)] sm:px-8">
      <BrandMark color="var(--text)" />
    </header>
  );
}
