"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase";
import { ensureUserProfile } from "@/lib/account/store";
import {
  consumeGoogleIdTokenFromUrl,
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
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = isFirebaseConfigured();

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    const auth = getFirebaseAuth();
    const go = (path: string) => router.replace(path);

    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
      if (nextUser) {
        persistSignedInSession(nextUser);
        void ensureUserProfile(nextUser).catch(() => undefined);
        if (!nextUser.isAnonymous) enterAppAfterSignIn(true, go);
      }
    });

    void (async () => {
      const google = await consumeGoogleIdTokenFromUrl();
      if (google.credential?.user) {
        persistSignedInSession(google.credential.user);
        setUser(google.credential.user);
        void ensureUserProfile(google.credential.user).catch(() => undefined);
        if (!google.credential.user.isAnonymous) enterAppAfterSignIn(true, go);
        return;
      }
      const result = await consumeRedirectResult();
      if (result.credential?.user) {
        persistSignedInSession(result.credential.user);
        setUser(result.credential.user);
        void ensureUserProfile(result.credential.user).catch(() => undefined);
        if (!result.credential.user.isAnonymous) enterAppAfterSignIn(true, go);
      }
    })();

    return () => unsub();
  }, [configured, router]);

  const value = useMemo(
    () => ({ user, loading, configured }),
    [user, loading, configured],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
