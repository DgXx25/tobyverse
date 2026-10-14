import { createSign } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

/** Public OAuth client used by the Firebase CLI (also in firebase-tools). */
const FIREBASE_CLI_CLIENT_ID = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const FIREBASE_CLI_CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const STORAGE_SCOPE = "https://www.googleapis.com/auth/devstorage.full_control";

type TokenCache = { token: string; expiresAt: number };
let cached: TokenCache | null = null;

function bucketName(): string {
  return (
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() ||
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    ""
  );
}

function userProject(): string {
  return (
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    ""
  );
}

function storageHeaders(token: string, extra?: Record<string, string>): Record<string, string> {
  const project = userProject();
  return {
    Authorization: `Bearer ${token}`,
    ...(project ? { "x-goog-user-project": project } : {}),
    ...extra,
  };
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function runningOnGcp(): boolean {
  return Boolean(
    process.env.K_SERVICE ||
      process.env.K_REVISION ||
      process.env.FUNCTION_TARGET ||
      process.env.FUNCTION_NAME ||
      process.env.CLOUD_RUN_JOB ||
      process.env.GCE_METADATA_HOST ||
      process.env.GCE_METADATA_IP,
  );
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
    const refresh = (tokens as { refresh_token?: unknown }).refresh_token;
    if (typeof refresh === "string" && refresh.trim()) return refresh.trim();
  }
  return null;
}

function credentialFile(): Record<string, unknown> | null {
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (envPath) return readJsonFile(envPath);
  const adcWin = process.env.APPDATA
    ? path.join(process.env.APPDATA, "gcloud", "application_default_credentials.json")
    : "";
  const adcUnix = path.join(os.homedir(), ".config", "gcloud", "application_default_credentials.json");
  return (adcWin ? readJsonFile(adcWin) : null) ?? readJsonFile(adcUnix);
}

function serviceAccountJson(): Record<string, unknown> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function b64url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

async function tokenFromRefresh(refreshToken: string, clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!response.ok || !data.access_token) {
    throw new Error("Could not get a Google access token for Storage.");
  }
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(30, (data.expires_in ?? 3600) - 60) * 1000,
  };
  return data.access_token;
}

async function tokenFromServiceAccount(sa: Record<string, unknown>): Promise<string> {
  const email = asString(sa.client_email);
  const key = asString(sa.private_key).replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Service account JSON is missing client_email or private_key.");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: email,
      scope: STORAGE_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const assertion = `${header}.${payload}.${signer.sign(key, "base64url")}`;
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!response.ok || !data.access_token) {
    throw new Error("Could not get a Google access token for Storage.");
  }
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(30, (data.expires_in ?? 3600) - 60) * 1000,
  };
  return data.access_token;
}

export function hasGcsWriteCredentials(): boolean {
  try {
    if (serviceAccountJson()) return true;
    if (runningOnGcp()) return true;
    if (firebaseCliRefreshToken()) return true;
    const file = credentialFile();
    if (!file) return false;
    return Boolean(asString(file.refresh_token) || asString(file.private_key));
  } catch {
    return false;
  }
}

async function tokenFromMetadata(): Promise<string> {
  const host = process.env.GCE_METADATA_HOST || process.env.GCE_METADATA_IP || "metadata.google.internal";
  const url = `http://${host}/computeMetadata/v1/instance/service-accounts/default/token?scopes=${encodeURIComponent(STORAGE_SCOPE)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "Metadata-Flavor": "Google" },
      signal: controller.signal,
    });
  } catch {
    throw new Error("Could not get a Google access token for Storage.");
  } finally {
    clearTimeout(timer);
  }
  const data = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!response.ok || !data.access_token) {
    throw new Error("Could not get a Google access token for Storage.");
  }
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(30, (data.expires_in ?? 3600) - 60) * 1000,
  };
  return data.access_token;
}

async function googleAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const sa = serviceAccountJson();
  if (sa) return tokenFromServiceAccount(sa);

  if (runningOnGcp()) return tokenFromMetadata();

  const cliRefresh = firebaseCliRefreshToken();
  if (cliRefresh) {
    return tokenFromRefresh(cliRefresh, FIREBASE_CLI_CLIENT_ID, FIREBASE_CLI_CLIENT_SECRET);
  }

  const file = credentialFile();
  if (file && asString(file.refresh_token)) {
    return tokenFromRefresh(
      asString(file.refresh_token),
      asString(file.client_id) || FIREBASE_CLI_CLIENT_ID,
      asString(file.client_secret) || FIREBASE_CLI_CLIENT_SECRET,
    );
  }
  if (file && asString(file.private_key)) {
    return tokenFromServiceAccount(file);
  }

  throw new Error("Server Storage is not configured.");
}

export async function uploadGcsObject(objectPath: string, buffer: Buffer, contentType: string): Promise<void> {
  const bucket = bucketName();
  if (!bucket) throw new Error("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set.");
  const token = await googleAccessToken();
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(objectPath)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: storageHeaders(token, { "Content-Type": contentType || "application/octet-stream" }),
      body: new Uint8Array(buffer),
    });
  } catch {
    throw new Error("Storage upload failed. Could not reach Google Cloud Storage.");
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text.slice(0, 240) || `Storage upload failed (${response.status}).`);
  }
}

export async function deleteGcsObject(objectPath: string): Promise<void> {
  const bucket = bucketName();
  if (!bucket) throw new Error("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set.");
  const token = await googleAccessToken();
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectPath)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "DELETE",
      headers: storageHeaders(token),
    });
  } catch {
    throw new Error("Storage delete failed. Could not reach Google Cloud Storage.");
  }
  if (response.status === 404) return;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text.slice(0, 240) || `Storage delete failed (${response.status}).`);
  }
}

export async function listGcsPrefix(prefix: string): Promise<string[]> {
  const bucket = bucketName();
  if (!bucket) throw new Error("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set.");
  const token = await googleAccessToken();
  const names: string[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      prefix,
      maxResults: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o?${params.toString()}`;
    let response: Response;
    try {
      response = await fetch(url, { headers: storageHeaders(token) });
    } catch {
      throw new Error("Could not list files from Storage.");
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text.slice(0, 240) || `Storage list failed (${response.status}).`);
    }
    const data = (await response.json()) as { items?: { name?: string }[]; nextPageToken?: string };
    for (const item of data.items ?? []) {
      if (typeof item.name === "string" && item.name) names.push(item.name);
    }
    pageToken = typeof data.nextPageToken === "string" ? data.nextPageToken : "";
  } while (pageToken);
  return names;
}

export async function downloadGcsObject(
  objectPath: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const bucket = bucketName();
  if (!bucket) throw new Error("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set.");
  const token = await googleAccessToken();
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectPath)}?alt=media`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: storageHeaders(token),
    });
  } catch {
    throw new Error("Could not read file from Storage.");
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text.slice(0, 240) || `Storage read failed (${response.status}).`);
  }
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  return { buffer: Buffer.from(await response.arrayBuffer()), contentType };
}

export function storageBucketName(): string {
  return bucketName();
}
