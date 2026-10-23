import type { ReactNode } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { ForceMarketingDark } from "@/components/force-marketing-dark";

export function LegalPage({
  title,
  effective,
  children,
}: {
  title: string;
  effective: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-[#0a0a0a] text-[#ececec]">
      <ForceMarketingDark />
      <header className="flex h-16 items-center px-5 pt-[env(safe-area-inset-top)] sm:px-8">
        <BrandMark />
      </header>
      <article className="mx-auto w-full max-w-[760px] px-6 pb-24 pt-10 sm:px-8 sm:pt-14">
        <h1 className="text-center text-[40px] font-semibold tracking-tight text-[#ececec] sm:text-[48px]">
          {title}
        </h1>
        <div className="mt-6 flex items-center justify-between gap-4 text-[14px] text-[#ececec]">
          <p>Effective {effective}</p>
          <Link href="/" className="underline underline-offset-2 hover:text-white">
            Home
          </Link>
        </div>
        <hr className="mt-5 border-[#33312f]" />
        <div className="legal-body mt-10">{children}</div>
        <nav aria-label="Policies" className="mt-16 flex flex-wrap gap-x-6 gap-y-3 border-t border-[#33312f] pt-6 text-sm text-[#a7a7a7]">
          <Link href="/privacy" className="hover:text-white">Privacy</Link>
          <Link href="/terms" className="hover:text-white">Terms</Link>
          <Link href="/refunds" className="hover:text-white">Refund policy</Link>
          <Link href="/pricing" className="hover:text-white">Pricing</Link>
        </nav>
      </article>
    </main>
  );
}
