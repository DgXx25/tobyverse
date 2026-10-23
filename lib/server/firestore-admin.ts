import fs from "fs";
import os from "os";
import path from "path";
import { applicationDefault, cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/** Public OAuth client used by the Firebase CLI. Same pair Storage already uses. */
const FIREBASE_CLI_CLIENT_ID = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const FIREBASE_CLI_CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";

function firebaseProjectId(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    undefined
  );
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function runningOnGcp(): boolean {
  return Boolean(
    process.env.K_SERVICE ||
      process.env.K_REVISION ||
      process.env.FUNCTION_TARGET ||
      process.env.FUNCTION_NAME ||
      process.env.CLOUD_RUN_JOB,
  );
}

function serviceAccountFromEnv(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
}

function credentialFile(): Record<string, unknown> | null {
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (envPath) return readJsonFile(envPath);
  const windows = process.env.APPDATA
    ? path.join(process.env.APPDATA, "gcloud", "application_default_credentials.json")
    : "";
  const unix = path.join(os.homedir(), ".config", "gcloud", "application_default_credentials.json");
  return (windows ? readJsonFile(windows) : null) ?? readJsonFile(unix);
}

function firebaseCliRefreshToken(): string | null {
  if (runningOnGcp()) return null;
  const candidates = [
    path.join(os.homedir(), ".config", "configstore", "firebase-tools.json"),
    path.join(process.env.APPDATA || "", "configstore", "firebase-tools.json"),
  ].filter(Boolean);
  for (const filePath of candidates) {
    const json = readJsonFile(filePath);
    const tokens = json?.tokens;
    if (!tokens || typeof tokens !== "object") continue;
    const token = asString((tokens as { refresh_token?: unknown }).refresh_token).trim();
    if (token) return token;
  }
  return null;
}

const ADMIN_PREFIX = "toby-admin";

/** Firestore rejects an explicit refresh-token credential. It accepts the same login as application default credentials. */
function firestoreAccepts(app: App): boolean {
  const credential = app.options.credential as { implicit?: boolean; privateKey?: string } | undefined;
  if (!credential) return false;
  if (typeof credential.privateKey === "string" && credential.privateKey.includes("PRIVATE KEY")) return true;
  if (credential.implicit === true) return true;
  return credential.constructor?.name === "ApplicationDefaultCredential";
}

function publishCliLogin(projectId: string | undefined): boolean {
  const file = credentialFile();
  const fileRefresh = file ? asString(file.refresh_token).trim() : "";
  const token = fileRefresh || firebaseCliRefreshToken();
  if (!token || runningOnGcp()) return false;

  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const envFile = envPath ? readJsonFile(envPath) : null;
  if (envFile && asString(envFile.private_key)) return false;
  if (envFile && asString(envFile.refresh_token).trim() === token) return true;
  if (file && fileRefresh === token && !envPath) return true;

  const filePath = path.join(os.tmpdir(), "tobyverse-adc.json");
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      type: "authorized_user",
      client_id: (file && asString(file.client_id)) || FIREBASE_CLI_CLIENT_ID,
      client_secret: (file && asString(file.client_secret)) || FIREBASE_CLI_CLIENT_SECRET,
      refresh_token: token,
      ...(projectId ? { quota_project_id: projectId } : {}),
    }),
  );
  process.env.GOOGLE_APPLICATION_CREDENTIALS = filePath;
  return true;
}

function adminApp() {
  const ready = getApps().find((app) => app.name.startsWith(ADMIN_PREFIX) && firestoreAccepts(app));
  if (ready) return ready;

  const projectId = firebaseProjectId();
  if (projectId) {
    if (!process.env.GOOGLE_CLOUD_PROJECT) process.env.GOOGLE_CLOUD_PROJECT = projectId;
    if (!process.env.GCLOUD_PROJECT) process.env.GCLOUD_PROJECT = projectId;
  }

  const serviceAccount = serviceAccountFromEnv();
  if (serviceAccount) {
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId || projectId,
    }, `${ADMIN_PREFIX}-cert`);
  }

  const file = credentialFile();
  if (file && asString(file.private_key) && asString(file.client_email)) {
    return initializeApp({
      credential: cert(file as ServiceAccount),
      projectId: asString(file.project_id) || projectId,
    }, `${ADMIN_PREFIX}-cert`);
  }

  if (runningOnGcp() || publishCliLogin(projectId)) {
    return initializeApp({
      credential: applicationDefault(),
      projectId,
    }, `${ADMIN_PREFIX}-adc`);
  }

  throw new Error(
    "Server Firebase is not signed in. Run `firebase login` in this project, or set FIREBASE_SERVICE_ACCOUNT_JSON.",
  );
}

export function getAdminFirestore() {
  return getFirestore(adminApp());
}

export function getAdminAuth() {
  return getAuth(adminApp());
}

export function verifyAdminIdToken(token: string) {
  return getAuth(adminApp()).verifyIdToken(token);
}
