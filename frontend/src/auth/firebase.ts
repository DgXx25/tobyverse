import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const env = import.meta.env ?? {};
const config = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function getFirebaseAuth() {
  if (Object.values(config).some((value) => !value?.trim())) return null;
  const app = getApps().length ? getApp() : initializeApp(config);
  return getAuth(app);
}
