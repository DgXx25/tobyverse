import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-background px-6">
      <header className="flex h-14 shrink-0 items-center pt-[env(safe-area-inset-top)]">
        <Link href="/" draggable={false} className="brand-link select-none text-foreground" aria-label="TobyVerse">
          <span
            className="brand-mark block h-7 w-7 bg-current"
            style={{
              WebkitMask: "url(/logo.svg) center / contain no-repeat",
              mask: "url(/logo.svg) center / contain no-repeat",
            }}
          />
        </Link>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center pb-16">
        <div className="w-full max-w-sm">
          <h1 className="mb-8 text-center text-[28px] font-semibold tracking-tight text-foreground">
            Log into your account
          </h1>
          <AuthForm />
        </div>
      </div>
    </main>
  );
}
