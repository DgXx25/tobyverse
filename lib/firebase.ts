import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { authPopupUnreliable } from "@/lib/standalone";

function readEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function envFirebaseConfig() {
  return {
    apiKey: readEnv(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    authDomain: readEnv(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: readEnv(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: readEnv(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: readEnv(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
    appId: readEnv(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  };
}

function authDomainForOrigin(configured?: string): string | undefined {
  if (typeof window === "undefined") return configured;
  // Same-origin auth helper (proxied at /__/auth). Cross-origin firebaseapp.com
  // loses the redirect session in Cursor/VS Code Simple Browser.
  return window.location.host;
}

function getFirebaseConfig() {
  const env = envFirebaseConfig();
  return {
    ...env,
    authDomain: authDomainForOrigin(env.authDomain),
  };
}

export function isFirebaseConfigured(): boolean {
  const config = envFirebaseConfig();

  return Boolean(
    config.apiKey &&
      config.authDomain &&
      config.projectId &&
      config.storageBucket &&
      config.messagingSenderId &&
      config.appId,
  );
}

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Firebase is not configured. Copy .env.local.example to .env.local and add your keys.",
    );
  }

  if (getApps().length) {
    return getApp();
  }

  return initializeApp(getFirebaseConfig());
}

let auth: Auth | undefined;

export function getFirebaseAuth(): Auth {
  const app = getFirebaseApp();
  if (auth && auth.app === app) return auth;

  if (typeof window === "undefined") {
    auth = getAuth(app);
    return auth;
  }

  try {
    auth = initializeAuth(app, {
      persistence: authPopupUnreliable()
        ? browserLocalPersistence
        : [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    auth = getAuth(app);
  }
  return auth;
}

export function getFirebaseDb(): Firestore {
  return getFirestore(getFirebaseApp());
}

export function getFirebaseStorage(): FirebaseStorage {
  return getStorage(getFirebaseApp());
}
