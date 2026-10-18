"use client";

import dynamic from "next/dynamic";
import { useAuth } from "@/components/auth-provider";
import { NotebooksHome } from "@/components/notebooks-home";
import { isGuestUser } from "@/lib/guest";

const StartScreen = dynamic(() => import("@/components/start-screen").then((mod) => mod.StartScreen));

/** Signed-in people land on their notebooks. Guests keep the quick-ask start screen. */
export function NewRoute() {
  const { user } = useAuth();
  if (!user) return null;
  if (isGuestUser(user)) return <StartScreen />;
  return <NotebooksHome />;
}
