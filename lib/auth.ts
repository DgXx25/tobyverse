import {
  GoogleAuthProvider,
  OAuthProvider,
  browserPopupRedirectResolver,
  getRedirectResult,
  linkWithPopup,
  linkWithRedirect,
  reauthenticateWithPopup,
  signInAnonymously,
  signInWithPopup,
  signInWithRedirect,
  type User,
  type UserCredential,
} from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase";
import { POST_LOGIN_PATH, writeSignedInCookie } from "@/lib/signed-in-cookie";
import { isStandaloneDisplay } from "@/lib/standalone";

export { POST_LOGIN_PATH };

const PENDING_REDIRECT_KEY = "tv.auth-redirect";

function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

function appleProvider() {
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  return provider;
}

export function isAppleSignInConfigured(): boolean {
  const serviceId = process.env.NEXT_PUBLIC_APPLE_SERVICE_ID?.trim();
  const redirect = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI?.trim();
  return Boolean(serviceId && redirect);
}

function markPendingRedirect() {
  try {
    sessionStorage.setItem(PENDING_REDIRECT_KEY, "1");
  } catch {
    /* Safari private / standalone may block storage */
  }
}

function clearPendingRedirect() {
  try {
    sessionStorage.removeItem(PENDING_REDIRECT_KEY);
  } catch {
    /* ignore */
  }
}

export function hasPendingAuthRedirect(): boolean {
  try {
    return sessionStorage.getItem(PENDING_REDIRECT_KEY) === "1";
  } catch {
    return false;
  }
}

export function peekCurrentUser(): User | null {
  try {
    if (typeof window === "undefined" || !isFirebaseConfigured()) return null;
    return getFirebaseAuth().currentUser;
  } catch {
    return null;
  }
}

export function isAccountUser(user: User | null | undefined): user is User {
  return Boolean(user && !user.isAnonymous);
}

function isPreAuthPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/login";
}

let enteredApp = false;

export function enterAppAfterSignIn(cookieJustSet: boolean) {
  if (typeof window === "undefined" || enteredApp) return;
  if (!isPreAuthPath(window.location.pathname)) return;
  if (peekCurrentUser()?.isAnonymous) return;
  enteredApp = true;
  if (cookieJustSet) {
    window.location.assign(POST_LOGIN_PATH);
    return;
  }
  window.location.replace(POST_LOGIN_PATH);
}

export function persistSignedInSession(user: User | null) {
  if (!isAccountUser(user)) return;
  writeSignedInCookie(true);
}

let redirectResultPromise: Promise<{ credential: UserCredential | null; error: string | null }> | undefined;

export function consumeRedirectResult(): Promise<{ credential: UserCredential | null; error: string | null }> {
  if (typeof window === "undefined" || !isFirebaseConfigured()) {
    return Promise.resolve({ credential: null, error: null });
  }

  if (!redirectResultPromise) {
    const auth = getFirebaseAuth();
    redirectResultPromise = getRedirectResult(auth, browserPopupRedirectResolver)
      .then((next) => ({ credential: next ?? null, error: null as string | null }))
      .catch((error) => {
        const message = authErrorMessage(error);
        return { credential: null, error: message || null };
      })
      .finally(() => {
        clearPendingRedirect();
      });
  }

  return redirectResultPromise;
}

export async function requireSignedInUser(): Promise<User> {
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user?.uid) {
    throw new Error("Sign in required.");
  }
  await user.getIdToken();
  return user;
}

export async function ensureSessionUser(): Promise<User> {
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  if (auth.currentUser?.uid) {
    await auth.currentUser.getIdToken();
    return auth.currentUser;
  }
  const credential = await signInAnonymously(auth);
  return credential.user;
}

function isAccountTakenError(error: unknown): boolean {
  if (typeof error !== "object" || !error || !("code" in error)) return false;
  const code = String((error as { code: string }).code);
  return code === "auth/credential-already-in-use" || code === "auth/email-already-in-use";
}

async function linkOrSignIn(
  auth: ReturnType<typeof getFirebaseAuth>,
  user: User | null,
  provider: GoogleAuthProvider | OAuthProvider,
): Promise<UserCredential | null> {
  const guest = Boolean(user?.isAnonymous);
  if (isStandaloneDisplay()) {
    markPendingRedirect();
    if (guest && user) {
      await linkWithRedirect(user, provider, browserPopupRedirectResolver);
      return null;
    }
    await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
    return null;
  }
  if (guest && user) {
    try {
      return await linkWithPopup(user, provider, browserPopupRedirectResolver);
    } catch (error) {
      if (!isAccountTakenError(error)) throw error;
    }
  }
  return signInWithPopup(auth, provider, browserPopupRedirectResolver);
}

export async function signInWithGoogle(): Promise<UserCredential | null> {
  const auth = getFirebaseAuth();
  return linkOrSignIn(auth, auth.currentUser, googleProvider());
}

export async function signInWithApple(): Promise<UserCredential | null> {
  const auth = getFirebaseAuth();
  return linkOrSignIn(auth, auth.currentUser, appleProvider());
}

export async function reauthenticateCurrentUser(user: User): Promise<void> {
  const providerId = user.providerData[0]?.providerId;
  if (providerId === "google.com") {
    await reauthenticateWithPopup(user, googleProvider());
    return;
  }
  if (providerId === "apple.com") {
    await reauthenticateWithPopup(user, appleProvider());
  }
}

export function authErrorMessage(error: unknown): string {
  if (typeof error === "object" && error && "code" in error) {
    const code = String((error as { code: string }).code);

    if (
      code === "auth/popup-closed-by-user" ||
      code === "auth/cancelled-popup-request" ||
      code === "auth/redirect-cancelled-by-user"
    ) {
      return "";
    }

    if (code === "auth/operation-not-allowed" || code === "auth/admin-restricted-operation") {
      return "Enable Anonymous sign-in in Firebase Auth (Authentication → Sign-in method).";
    }

    if (code === "auth/unauthorized-domain") {
      return "This domain is not authorized in Firebase Auth.";
    }
  }

  return error instanceof Error ? error.message : "Sign-in failed.";
}
