import {
  GoogleAuthProvider,
  OAuthProvider,
  browserPopupRedirectResolver,
  getRedirectResult,
  linkWithCredential,
  linkWithPopup,
  linkWithRedirect,
  reauthenticateWithPopup,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  type User,
  type UserCredential,
} from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase";
import { POST_LOGIN_PATH, writeSignedInCookie } from "@/lib/signed-in-cookie";
import { authPopupUnreliable } from "@/lib/standalone";

export { POST_LOGIN_PATH };

const PENDING_REDIRECT_KEY = "tv.auth-redirect";
const GOOGLE_OIDC_KEY = "tv.google-oidc";
const GOOGLE_OIDC_STATE_KEY = "tv.google-oidc-state";
const GOOGLE_ID_TOKEN_KEY = "tv.google-id-token";
const GOOGLE_OAUTH_ERROR_KEY = "tv.google-oauth-error";
const REDIRECT_RESULT_MS = 15000;

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

export function enterAppAfterSignIn(_cookieJustSet: boolean, go?: (path: string) => void) {
  if (typeof window === "undefined" || enteredApp) return;
  if (!isPreAuthPath(window.location.pathname)) return;
  if (peekCurrentUser()?.isAnonymous) return;
  enteredApp = true;
  if (go) {
    go(POST_LOGIN_PATH);
    return;
  }
  window.location.replace(POST_LOGIN_PATH);
}

export function persistSignedInSession(user: User | null) {
  if (!isAccountUser(user)) return;
  writeSignedInCookie(true);
}

let redirectResultPromise:
  | Promise<{ credential: UserCredential | null; error: string | null; attempted: boolean }>
  | undefined;

function resolveRedirectResult(auth: ReturnType<typeof getFirebaseAuth>) {
  return new Promise<UserCredential | null>((resolve, reject) => {
    const timer = window.setTimeout(() => resolve(null), REDIRECT_RESULT_MS);
    getRedirectResult(auth, browserPopupRedirectResolver).then(
      (credential) => {
        window.clearTimeout(timer);
        resolve(credential);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function consumeRedirectResult(): Promise<{
  credential: UserCredential | null;
  error: string | null;
  attempted: boolean;
}> {
  if (typeof window === "undefined" || !isFirebaseConfigured()) {
    return Promise.resolve({ credential: null, error: null, attempted: false });
  }

  if (!redirectResultPromise) {
    const auth = getFirebaseAuth();
    redirectResultPromise = resolveRedirectResult(auth)
      .then((next) => ({ credential: next ?? null, error: null as string | null, attempted: false }))
      .catch((error) => {
        const message = authErrorMessage(error);
        return { credential: null, error: message || null, attempted: false };
      })
      .finally(() => {
        clearPendingRedirect();
      });
  }

  return redirectResultPromise;
}

function googleParamsFromLocation(): URLSearchParams {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  const fromHash = new URLSearchParams(hash);
  if (fromHash.get("id_token") || fromHash.get("error") || fromHash.get("state")) return fromHash;
  return new URLSearchParams(window.location.search);
}

function stripAuthParamsFromUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.delete("id_token");
  url.searchParams.delete("access_token");
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");
  url.searchParams.delete("state");
  url.searchParams.delete("authuser");
  url.searchParams.delete("prompt");
  url.searchParams.delete("iss");
  window.history.replaceState(window.history.state, "", url.pathname + url.search);
}

async function applyGoogleIdToken(idToken: string): Promise<UserCredential> {
  const auth = getFirebaseAuth();
  const credential = GoogleAuthProvider.credential(idToken);
  const guest = auth.currentUser;
  if (guest?.isAnonymous) {
    try {
      return await linkWithCredential(guest, credential);
    } catch (error) {
      if (!isAccountTakenError(error)) throw error;
    }
  }
  return signInWithCredential(auth, credential);
}

let googleIdTokenPromise: Promise<{ credential: UserCredential | null; error: string | null }> | undefined;

/** Finish Google sign-in when the app callback receives an ID token. */
export function consumeGoogleIdTokenFromUrl(): Promise<{
  credential: UserCredential | null;
  error: string | null;
}> {
  if (typeof window === "undefined" || !isFirebaseConfigured()) {
    return Promise.resolve({ credential: null, error: null });
  }
  if (!googleIdTokenPromise) googleIdTokenPromise = finishGoogleIdTokenFromUrl();
  return googleIdTokenPromise;
}

async function finishGoogleIdTokenFromUrl(): Promise<{
  credential: UserCredential | null;
  error: string | null;
}> {
  const params = googleParamsFromLocation();
  let idToken = params.get("id_token");
  let oauthError = params.get("error");
  const returnedState = params.get("state");
  let pending = false;
  let expectedState: string | null = null;
  try {
    pending = sessionStorage.getItem(GOOGLE_OIDC_KEY) === "1";
    if (!idToken) idToken = sessionStorage.getItem(GOOGLE_ID_TOKEN_KEY);
    if (!oauthError) oauthError = sessionStorage.getItem(GOOGLE_OAUTH_ERROR_KEY);
    sessionStorage.removeItem(GOOGLE_OIDC_KEY);
    sessionStorage.removeItem(GOOGLE_ID_TOKEN_KEY);
    sessionStorage.removeItem(GOOGLE_OAUTH_ERROR_KEY);
  } catch {
    /* ignore */
  }
  try {
    expectedState = localStorage.getItem(GOOGLE_OIDC_STATE_KEY);
    localStorage.removeItem(GOOGLE_OIDC_STATE_KEY);
  } catch {
    /* ignore */
  }
  if (!expectedState) {
    try {
      expectedState = sessionStorage.getItem(GOOGLE_OIDC_STATE_KEY);
      sessionStorage.removeItem(GOOGLE_OIDC_STATE_KEY);
    } catch {
      /* ignore */
    }
  }
  if (!idToken && !oauthError && !pending) return { credential: null, error: null };

  if (!expectedState || !returnedState || returnedState !== expectedState) {
    stripAuthParamsFromUrl();
    return { credential: null, error: "Sign-in expired. Click Google again." };
  }

  if (oauthError) {
    stripAuthParamsFromUrl();
    if (oauthError === "access_denied") return { credential: null, error: null };
    return { credential: null, error: params.get("error_description") || "Google sign-in was cancelled." };
  }
  if (!idToken) {
    return { credential: null, error: "Sign-in didn't finish. Click Google again." };
  }

  try {
    const credential = await applyGoogleIdToken(idToken);
    stripAuthParamsFromUrl();
    return { credential, error: null };
  } catch (error) {
    stripAuthParamsFromUrl();
    return { credential: null, error: authErrorMessage(error) || "Sign-in failed." };
  }
}

async function googleWebClientId(): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  if (!apiKey) throw new Error("Firebase is not configured.");
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      continueUri: window.location.origin + "/",
      providerId: "google.com",
    }),
  });
  const data = (await response.json()) as { authUri?: string; error?: { message?: string } };
  if (!response.ok || !data.authUri) {
    throw new Error(data.error?.message || "Could not start Google sign-in.");
  }
  const clientId = new URL(data.authUri).searchParams.get("client_id");
  if (!clientId) throw new Error("Could not start Google sign-in.");
  return clientId;
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function startGoogleIdTokenSignIn(): Promise<null> {
  const clientId = await googleWebClientId();
  const nonce = randomNonce();
  const state = randomNonce();
  const redirectUri = `${window.location.origin}/login/google-callback`;
  try {
    sessionStorage.setItem(GOOGLE_OIDC_KEY, "1");
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(GOOGLE_OIDC_STATE_KEY, state);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.setItem(GOOGLE_OIDC_STATE_KEY, state);
  } catch {
    /* ignore */
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "id_token",
    scope: "openid email profile",
    nonce,
    state,
    prompt: "select_account",
  });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  return null;
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

function shouldFallbackToRedirect(error: unknown): boolean {
  if (typeof error !== "object" || !error || !("code" in error)) return false;
  const code = String((error as { code: string }).code);
  return (
    code === "auth/popup-blocked" ||
    code === "auth/popup-closed-by-user" ||
    code === "auth/cancelled-popup-request" ||
    code === "auth/web-storage-unsupported"
  );
}

async function startRedirectSignIn(
  auth: ReturnType<typeof getFirebaseAuth>,
  user: User | null,
  provider: GoogleAuthProvider | OAuthProvider,
): Promise<null> {
  markPendingRedirect();
  const guest = Boolean(user?.isAnonymous);
  if (guest && user) {
    await linkWithRedirect(user, provider, browserPopupRedirectResolver);
    return null;
  }
  await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
  return null;
}

async function linkOrSignIn(
  auth: ReturnType<typeof getFirebaseAuth>,
  user: User | null,
  provider: GoogleAuthProvider | OAuthProvider,
): Promise<UserCredential | null> {
  const guest = Boolean(user?.isAnonymous);
  if (authPopupUnreliable()) {
    if (provider.providerId === "google.com") {
      return startGoogleIdTokenSignIn();
    }
    return startRedirectSignIn(auth, user, provider);
  }
  try {
    if (guest && user) {
      try {
        return await linkWithPopup(user, provider, browserPopupRedirectResolver);
      } catch (error) {
        if (!isAccountTakenError(error)) throw error;
      }
    }
    return await signInWithPopup(auth, provider, browserPopupRedirectResolver);
  } catch (error) {
    if (shouldFallbackToRedirect(error)) {
      return startRedirectSignIn(auth, user, provider);
    }
    throw error;
  }
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
