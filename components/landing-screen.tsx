"use client";

import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { ForceMarketingDark } from "@/components/force-marketing-dark";
import { GalaxyWarp } from "@/components/galaxy-warp";
import { LandingHeader } from "@/components/landing-header";

export function LandingScreen() {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-[#0a0a0a] text-[#ececec]">
      <ForceMarketingDark />
      <GalaxyWarp />
      <LandingHeader />
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-6 pb-16">
        <div className="flex w-full flex-col items-center">
          <h1 className="mb-8 flex items-center justify-center gap-[0.28em] text-[32px] font-medium tracking-tight text-[#ececec] sm:text-[36px]">
            <span
              className="inline-block h-[1.5em] w-[1.5em] shrink-0 bg-current"
              style={{
                WebkitMask: "url(/toby1.svg) center / contain no-repeat",
                mask: "url(/toby1.svg) center / contain no-repeat",
              }}
              aria-hidden
            />
            What should we learn?
          </h1>
          <div className="w-full max-w-[360px]">
            <AuthForm variant="marketing" />
            <p className="mt-6 text-center text-[12px] leading-5 text-[#8a8682]">
              By continuing, you acknowledge TobyVerse&apos;s{" "}
              <Link href="/privacy" className="underline underline-offset-2 hover:text-[#ececec]">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link href="/terms" className="underline underline-offset-2 hover:text-[#ececec]">
                Terms
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
