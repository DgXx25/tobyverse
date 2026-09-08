"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  consumeRedirectResult,
  enterAppAfterSignIn,
  hasPendingAuthRedirect,
  isAccountUser,
  peekCurrentUser,
  persistSignedInSession,
} from "@/lib/auth";
import { hasSignedInCookie } from "@/lib/signed-in-cookie";

/** Client gate for /login only. Does not wrap the app shell or public home. */
export function LandingAuthGate({
  children,
  sessionHint = false,
}: {
  children: ReactNode;
  sessionHint?: boolean;
}) {
  const { user, loading } = useAuth();
  const sent = useRef(false);
  const [redirectReady, setRedirectReady] = useState(false);
  const [redirectError, setRedirectError] = useState<string | null>(null);
  const current = user ?? peekCurrentUser();
  const account = isAccountUser(current);
  const restoring = loading && (account || sessionHint || hasSignedInCookie());
  const pendingRedirect = hasPendingAuthRedirect();

  useEffect(() => {
    let live = true;
    void consumeRedirectResult()
      .then((result) => {
        if (!live) return;
        const next = result.credential?.user;
        if (isAccountUser(next)) {
          persistSignedInSession(next);
          enterAppAfterSignIn(true);
          return;
        }
        if (result.error) setRedirectError(result.error);
      })
      .finally(() => {
        if (live) setRedirectReady(true);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!redirectReady || loading || sent.current) return;
    if (!isAccountUser(user)) return;
    sent.current = true;
    persistSignedInSession(user);
    enterAppAfterSignIn(true);
  }, [redirectReady, loading, user]);

  if (!redirectError && (account || restoring || pendingRedirect || !redirectReady || loading)) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <>
      {redirectError ? (
        <p className="fixed bottom-6 left-0 right-0 z-20 px-4 text-center text-sm text-red-400">{redirectError}</p>
      ) : null}
      {children}
    </>
  );
}
