import { AuthError } from "@/lib/api/assert";
import type { AdminSession } from "@/lib/admin/assert";

type FirestoreValue = {
  stringValue?: string;
  booleanValue?: boolean;
  integerValue?: string;
  timestampValue?: string;
};

export type FirestoreRestDocument = {
  name: string;
  fields?: Record<string, FirestoreValue>;
};

function endpoint(path: string) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (!projectId) throw new AuthError("Firebase project ID is not configured.", 500);
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${path}`;
}

async function readJson<T>(url: string, session: AdminSession): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${session.token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new AuthError("Could not read admin data.", response.status === 403 ? 403 : 500);
  return response.json() as Promise<T>;
}

export function listAdminDocuments(collection: string, session: AdminSession) {
  return readJson<{ documents?: FirestoreRestDocument[] }>(
    `${endpoint(encodeURIComponent(collection))}?pageSize=1000`, session,
  ).then((result) => result.documents ?? []);
}

export function getAdminDocument(collection: string, id: string, session: AdminSession) {
  return readJson<FirestoreRestDocument>(
    endpoint(`${encodeURIComponent(collection)}/${encodeURIComponent(id)}`), session,
  );
}

export function restString(document: FirestoreRestDocument, key: string): string {
  return document.fields?.[key]?.stringValue ?? "";
}

export function restDate(document: FirestoreRestDocument, key: string): string {
  return document.fields?.[key]?.timestampValue ?? document.fields?.[key]?.stringValue ?? "";
}

export function restDocumentId(document: FirestoreRestDocument): string {
  return document.name.split("/").at(-1) ?? "";
}
