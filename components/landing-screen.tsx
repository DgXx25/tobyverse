"use client";

import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { ForceMarketingDark } from "@/components/force-marketing-dark";
import { LandingHeader } from "@/components/landing-header";
import { HeadlineVerb } from "@/components/workspace/headline-verb";

export function LandingScreen() {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-background text-foreground">
      <ForceMarketingDark />
      <LandingHeader />
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-6 pb-16">
        <div className="flex w-full flex-col items-center">
          <h1 className="mb-8 flex items-center justify-center gap-[0.28em] text-[32px] font-medium leading-[1.2] tracking-tight text-foreground sm:text-[36px]">
            <span
              className="inline-block h-[1.5em] w-[1.5em] shrink-0 bg-current"
              style={{
                WebkitMask: "url(/toby1.svg) center / contain no-repeat",
                mask: "url(/toby1.svg) center / contain no-repeat",
              }}
              aria-hidden
            />
            <span aria-hidden="true" className="whitespace-nowrap">
              What should we <HeadlineVerb />?
            </span>
          </h1>
          <div className="w-full max-w-[360px]">
            <AuthForm variant="marketing" />
            <p className="mt-6 text-center text-[12px] leading-5 text-muted">
              By continuing, you acknowledge TobyVerse&apos;s{" "}
              <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
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
