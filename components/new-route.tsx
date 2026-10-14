"use client";

import { useAuth } from "@/components/auth-provider";
import { NotebooksHome } from "@/components/notebooks-home";
import { StartScreen } from "@/components/start-screen";
import { isGuestUser } from "@/lib/guest";

/** Signed-in people land on their notebooks. Guests keep the quick-ask start screen. */
export function NewRoute() {
  const { user } = useAuth();
  if (!user) return null;
  if (isGuestUser(user)) return <StartScreen />;
  return <NotebooksHome />;
}
