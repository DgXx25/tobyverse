"use client";

import Link from "next/link";
import { LandingSettingsMenu } from "@/components/landing-settings-menu";

export function LandingHeader({ auth = false }: { auth?: boolean }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between px-4 pt-[env(safe-area-inset-top)] sm:px-5">
      <Link href="/" draggable={false} className="select-none text-foreground" aria-label="TobyVerse">
        <span
          className="block h-7 w-7 bg-current"
          style={{
            WebkitMask: "url(/logo.svg) center / contain no-repeat",
            mask: "url(/logo.svg) center / contain no-repeat",
          }}
        />
      </Link>
      <div className="flex items-center gap-2">
        <LandingSettingsMenu />
        {auth ? (
          <>
            <Link
              href="/login"
              className="inline-flex h-10 items-center rounded-full border border-foreground/80 px-5 text-[15px] font-medium text-foreground transition-colors hover:bg-surface-2"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="inline-flex h-10 items-center rounded-full bg-foreground px-5 text-[15px] font-medium text-background transition-opacity hover:opacity-90"
            >
              Sign up
            </Link>
          </>
        ) : null}
      </div>
    </header>
  );
}
