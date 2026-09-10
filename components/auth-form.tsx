"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  authErrorMessage,
  consumeRedirectResult,
  enterAppAfterSignIn,
  isAccountUser,
  isAppleSignInConfigured,
  persistSignedInSession,
  signInWithApple,
  signInWithGoogle,
} from "@/lib/auth";
import { useAuth } from "@/components/auth-provider";

type Provider = "google" | "apple";

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

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
      <path d="M16.37 12.86c0-1.84 1.5-2.73 1.57-2.78-.86-1.25-2.19-1.42-2.66-1.44-1.13-.11-2.21.67-2.78.67-.58 0-1.46-.65-2.4-.63-1.23.02-2.37.72-3 1.82-1.28 2.22-.33 5.5.91 7.3.61.88 1.33 1.86 2.28 1.83.91-.04 1.26-.59 2.36-.59 1.09 0 1.41.59 2.37.57.98-.02 1.6-.88 2.2-1.77.69-1.01 1-2 1-2.04-.02 0-1.94-.74-1.96-2.94zM14.92 6.9c.5-.61 1.04-1.44.92-2.28-.89.04-1.97.59-2.61 1.2-.57.54-1.08 1.4-.94 2.23 1 .08 2.02-.51 2.63-1.15z" />
    </svg>
  );
}

export function AuthForm({ variant = "default" }: { variant?: "default" | "marketing" }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const sent = useRef(false);
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redirectReady, setRedirectReady] = useState(false);
  const configured = isFirebaseConfigured();
  const appleConfigured = isAppleSignInConfigured();

  useEffect(() => {
    let live = true;
    void consumeRedirectResult()
      .then((result) => {
        if (!live) return;
        if (isAccountUser(result.credential?.user) && result.credential) {
          persistSignedInSession(result.credential.user);
          sent.current = true;
          enterAppAfterSignIn(true, (path) => router.replace(path));
        }
      })
      .finally(() => {
        if (live) setRedirectReady(true);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!redirectReady || loading || !isAccountUser(user) || sent.current) return;
    sent.current = true;
    persistSignedInSession(user);
    enterAppAfterSignIn(true, (path) => router.replace(path));
  }, [redirectReady, loading, user, router]);

  async function signIn(provider: Provider) {
    setError(null);
    setPending(provider);

    try {
      const credential = provider === "google" ? await signInWithGoogle() : await signInWithApple();
      if (!credential) return;

      persistSignedInSession(credential.user);
      sent.current = true;
      enterAppAfterSignIn(true, (path) => router.replace(path));
    } catch (err) {
      const message = authErrorMessage(err);
      if (message) setError(message);
    } finally {
      setPending(null);
    }
  }

  const marketing = variant === "marketing";
  const buttonClass = marketing
    ? "flex h-12 w-full items-center justify-center gap-3 rounded-[10px] border-[1px] border-white/[0.08] bg-[#1c1b1a] px-4 text-[15px] text-[#ececec] transition-colors hover:bg-[#262524] disabled:opacity-50"
    : "flex h-12 w-full items-center justify-center gap-3 rounded-full border border-border bg-transparent px-4 text-[15px] text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50";

  if (!configured) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
        Firebase is not configured. Copy{" "}
        <span className="font-mono text-foreground">.env.local.example</span> to{" "}
        <span className="font-mono text-foreground">.env.local</span> and add your keys.
      </div>
    );
  }

  if (loading || !redirectReady || isAccountUser(user)) {
    return <div className="h-28" />;
  }

  return (
    <div className="w-full">
      <div className="space-y-3">
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => signIn("google")}
          className={buttonClass}
        >
          <GoogleIcon />
          {pending === "google" ? "Connecting…" : "Continue with Google"}
        </button>

        {appleConfigured ? (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => signIn("apple")}
            className={buttonClass}
          >
            <AppleIcon />
            {pending === "apple" ? "Connecting…" : "Continue with Apple"}
          </button>
        ) : null}
      </div>

      {error && <p className="mt-4 text-center text-xs text-red-400">{error}</p>}
    </div>
  );
}
