import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  type Firestore,
} from "firebase/firestore";
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
  // Firebase's handler is always https://<authDomain>/__/auth/handler.
  // Using localhost makes Chrome open https://localhost:3000, which this dev
  // server does not speak, so sign-in dies with ERR_SSL_PROTOCOL_ERROR. On
  // Safari, using the app's own Firebase-authorized host avoids the
  // cross-site storage restrictions that break Firebase's redirect helper.
  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase();
    const appHosts = new Set([
      "tobyverse.ge",
      "www.tobyverse.ge",
      "tobyverse.web.app",
      "tobyverse.firebaseapp.com",
      "ugstuff-c351a.web.app",
      "ugstuff-c351a.firebaseapp.com",
    ]);
    if (appHosts.has(host)) return host === "www.tobyverse.ge" ? "tobyverse.ge" : host;
  }
  return configured;
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
let db: Firestore | undefined;

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
  const app = getFirebaseApp();
  if (db && db.app === app) return db;

  if (typeof window !== "undefined") {
    try {
      db = initializeFirestore(app, {
        // Keep the browser cache in memory. Firestore's persistent multi-tab
        // manager writes a mutation marker to localStorage for every pending
        // write; in long-lived browser profiles that queue can hit the
        // localStorage quota and make Firestore's async queue fail internally.
        // Memory cache keeps tabs independent and leaves server data untouched.
        localCache: memoryLocalCache(),
      });
      return db;
    } catch {
      // Another Firebase module may have initialized Firestore already, or
      // IndexedDB may be unavailable. Memory-backed Firestore is still safe.
    }
  }

  db = getFirestore(app);
  return db;
}

export function getFirebaseStorage(): FirebaseStorage {
  return getStorage(getFirebaseApp());
}
