import Link from "next/link";
import { LandingAuthGate } from "@/components/landing-auth-gate";

export default function HomePage() {
  return (
    <LandingAuthGate>
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #262626 1px, transparent 1px), linear-gradient(to bottom, #262626 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse at center, black 20%, transparent 70%)",
          }}
        />

        <div className="relative z-10 flex flex-col items-center text-center">
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.28em] text-muted">
            Studio
          </p>
          <h1 className="text-5xl font-medium tracking-tight text-foreground sm:text-6xl">
            TobyVerse
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-muted">
            A quiet workspace for building worlds, stories, and projects with Gemini.
          </p>
          <div className="mt-10 flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Enter
            </Link>
          </div>
        </div>
      </main>
    </LandingAuthGate>
  );
}
