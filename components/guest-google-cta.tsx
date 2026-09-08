"use client";

import { useState } from "react";
import {
  authErrorMessage,
  enterAppAfterSignIn,
  persistSignedInSession,
  signInWithGoogle,
} from "@/lib/auth";
import { GUEST_CAP_LINE } from "@/lib/guest";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.3-1.9 3l3.1 2.4c1.8-1.7 2.8-4.1 2.8-7 0-.7-.1-1.3-.2-1.9H12z"
      />
      <path
        fill="#34A853"
        d="M6.6 14.3l-.8.6-2.8 2.2C4.8 20.2 8.1 22 12 22c2.7 0 5-.9 6.7-2.4l-3.1-2.4c-.9.6-2 1-3.6 1-2.8 0-5.1-1.8-6-4.4z"
      />
      <path
        fill="#4A90E2"
        d="M3 7.1C2.4 8.4 2 9.9 2 11.5S2.4 14.6 3 15.9c0 .1 3.6-2.8 3.6-2.8-.2-.6-.4-1.2-.4-1.9s.1-1.3.4-1.9L3 7.1z"
      />
      <path
        fill="#FBBC05"
        d="M12 5.8c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 2.9 14.7 2 12 2 8.1 2 4.8 3.8 3 6.9L6.6 9.7C7 7.1 9.2 5.8 12 5.8z"
      />
    </svg>
  );
}

export function GuestGoogleCta({ line = GUEST_CAP_LINE }: { line?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setError(null);
    setPending(true);
    try {
      const credential = await signInWithGoogle();
      if (!credential) return;
      persistSignedInSession(credential.user);
      enterAppAfterSignIn(true);
    } catch (err) {
      const message = authErrorMessage(err);
      if (message) setError(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col items-center gap-3 px-1">
      <p className="text-center text-sm text-muted">{line}</p>
      <button
        type="button"
        disabled={pending}
        onClick={() => void signIn()}
        className="flex h-11 w-full max-w-sm items-center justify-center gap-3 rounded-full border border-border bg-transparent px-4 text-[15px] text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50"
      >
        <GoogleIcon />
        {pending ? "Connecting…" : "Continue with Google"}
      </button>
      {error ? <p className="text-center text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
