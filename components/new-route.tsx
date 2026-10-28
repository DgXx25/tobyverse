"use client";

import dynamic from "next/dynamic";
import { useAuth } from "@/components/auth-provider";
import { isGuestUser } from "@/lib/guest";

// Keep the shared app shell responsive while these route-specific client bundles load.
const StartScreen = dynamic(() => import("@/components/start-screen").then((mod) => mod.StartScreen), { ssr: false, loading: () => <StartupSkeleton /> });
const NotebooksHome = dynamic(() => import("@/components/notebooks-home").then((mod) => mod.NotebooksHome), { ssr: false, loading: () => <StartupSkeleton /> });

function StartupSkeleton() {
  return <div aria-label="Loading Tobyverse" className="mx-auto flex h-full w-full max-w-6xl flex-col px-6 pt-10 max-[1100px]:px-3 max-[1100px]:pt-4">
    <div className="h-8 w-36 animate-pulse rounded-lg bg-foreground/10" />
    <div className="mt-6 grid grid-cols-4 gap-4 max-[1100px]:grid-cols-1">
      {Array.from({ length: 8 }, (_, index) => <div key={index} className="aspect-[5/3] animate-pulse rounded-2xl bg-surface-2 max-[1100px]:aspect-auto max-[1100px]:min-h-[68px]" />)}
    </div>
  </div>;
}

/** Signed-in people land on their notebooks. Guests keep the quick-ask start screen. */
export function NewRoute() {
  const { user } = useAuth();
  if (!user) return null;
  if (isGuestUser(user)) return <StartScreen />;
  return <NotebooksHome />;
}
