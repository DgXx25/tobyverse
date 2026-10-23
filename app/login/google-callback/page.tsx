"use client";

import { useEffect, useState } from "react";
import { consumeGoogleIdTokenFromUrl, consumePostAuthPath } from "@/lib/auth";

export default function GoogleCallbackPage() {
  const [message, setMessage] = useState("Signing in…");

  useEffect(() => {
    let active = true;
    void consumeGoogleIdTokenFromUrl().then(({ credential, error }) => {
      if (!active) return;
      if (credential?.user && !credential.user.isAnonymous) {
        window.location.replace(consumePostAuthPath());
        return;
      }
      if (error) {
        setMessage(error);
        return;
      }
      setMessage("Sign-in was cancelled or expired. Please try again.");
    }).catch(() => {
      if (active) setMessage("Sign-in failed. Please try again.");
    });
    return () => { active = false; };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center text-foreground">
      <div className="max-w-sm">
        <p role="status" className="text-sm text-muted">{message}</p>
        {message !== "Signing in…" ? (
          <a href="/login" className="mt-4 inline-flex rounded-full bg-surface px-4 py-2 text-sm text-foreground">
            Return to sign in
          </a>
        ) : null}
      </div>
    </main>
  );
}
