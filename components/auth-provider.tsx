"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase";
import { ensureUserProfile } from "@/lib/account/store";
import {
  consumeRedirectResult,
  enterAppAfterSignIn,
  persistSignedInSession,
} from "@/lib/auth";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  configured: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  configured: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = isFirebaseConfigured();

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    const auth = getFirebaseAuth();
    let unsub: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        const result = await consumeRedirectResult();
        if (cancelled) return;
        if (result.credential?.user) {
          persistSignedInSession(result.credential.user);
          setUser(result.credential.user);
          void ensureUserProfile(result.credential.user).catch(() => undefined);
          if (!result.credential.user.isAnonymous) enterAppAfterSignIn(true);
        }
      } catch {
        /* consumeRedirectResult maps errors onto the result */
      }

      if (cancelled) return;
      unsub = onAuthStateChanged(auth, (nextUser) => {
        setUser(nextUser);
        setLoading(false);
        if (nextUser) {
          persistSignedInSession(nextUser);
          void ensureUserProfile(nextUser).catch(() => undefined);
          if (!nextUser.isAnonymous) enterAppAfterSignIn(true);
        }
      });
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [configured]);

  const value = useMemo(
    () => ({ user, loading, configured }),
    [user, loading, configured],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
