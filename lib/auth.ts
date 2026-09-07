import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  type User,
  type UserCredential,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

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

export function signInWithGoogle(): Promise<UserCredential> {
  return signInWithPopup(getFirebaseAuth(), googleProvider());
}

export function signInWithApple(): Promise<UserCredential> {
  return signInWithPopup(getFirebaseAuth(), appleProvider());
}

export function authErrorMessage(error: unknown): string {
  if (typeof error === "object" && error && "code" in error) {
    const code = String((error as { code: string }).code);

    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
      return "";
    }

    if (code === "auth/operation-not-allowed") {
      return "This sign-in method is not enabled in Firebase Auth.";
    }

    if (code === "auth/unauthorized-domain") {
      return "This domain is not authorized in Firebase Auth.";
    }
  }

  return error instanceof Error ? error.message : "Sign-in failed.";
}
