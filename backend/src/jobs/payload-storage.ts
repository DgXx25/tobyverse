import { getStorage } from "firebase-admin/storage";
import { getAdminAuth } from "../firebase/admin.js";
import { assertJobDocumentSize, MAX_JOB_DOCUMENT_BYTES } from "./limits.js";

export type JobPayloadField = "input" | "result";

export interface JobPayloadStorage {
  saveJson(path: string, value: unknown): Promise<void>;
  readJson(path: string): Promise<unknown>;
  delete(path: string): Promise<void>;
}

type StorageFile = {
  save(body: string, options: {
    resumable: false;
    contentType: string;
    metadata: { cacheControl: string };
  }): Promise<unknown>;
  download(): Promise<[Buffer]>;
  delete(options: { ignoreNotFound: true }): Promise<unknown>;
};

type StorageBucket = { file(path: string): StorageFile };

export function resolveFirebaseStorageBucketName(
  env: Partial<Pick<NodeJS.ProcessEnv, "FIREBASE_STORAGE_BUCKET" | "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET">> = process.env,
): string {
  const bucket = env.FIREBASE_STORAGE_BUCKET?.trim()
    || env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
  if (!bucket) {
    throw new Error("Firebase Storage bucket is not configured. Set FIREBASE_STORAGE_BUCKET or NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET.");
  }
  return bucket;
}

export class FirebaseJobPayloadStorage implements JobPayloadStorage {
  private readonly bucketName?: string;
  private readonly resolveBucket: (name: string) => StorageBucket;

  constructor(options: {
    bucketName?: string;
    resolveBucket?: (name: string) => StorageBucket;
  } = {}) {
    this.bucketName = options.bucketName;
    this.resolveBucket = options.resolveBucket
      ?? ((name) => getStorage(getAdminAuth().app).bucket(name));
  }

  private file(path: string) {
    const bucketName = this.bucketName?.trim() || resolveFirebaseStorageBucketName();
    return this.resolveBucket(bucketName).file(path);
  }

  async saveJson(path: string, value: unknown) {
    const body = JSON.stringify(value);
    if (body === undefined) throw new TypeError("Job payload must be JSON serializable.");
    await this.file(path).save(body, {
      resumable: false,
      contentType: "application/json; charset=utf-8",
      metadata: { cacheControl: "private, no-store" },
    });
  }

  async readJson(path: string) {
    const [body] = await this.file(path).download();
    return JSON.parse(body.toString("utf8")) as unknown;
  }

  async delete(path: string) {
    await this.file(path).delete({ ignoreNotFound: true });
  }
}

export function jobPayloadPath(uid: string, jobId: string, field: JobPayloadField): string {
  const safeUid = encodeURIComponent(uid);
  const safeJobId = encodeURIComponent(jobId);
  return `users/${safeUid}/generation-jobs/${safeJobId}/${field}.json`;
}

export async function withPayloadReference<T extends object>(input: {
  document: T;
  field: JobPayloadField;
  payload: unknown;
  path: string;
  storage: JobPayloadStorage;
}): Promise<{ document: T & Record<string, unknown>; serializedBytes: number }> {
  const inline = { ...input.document, [input.field]: input.payload } as T & Record<string, unknown>;
  const inlineBytes = Buffer.byteLength(JSON.stringify(inline), "utf8");
  if (inlineBytes <= MAX_JOB_DOCUMENT_BYTES) {
    return { document: inline, serializedBytes: assertJobDocumentSize(inline) };
  }

  const referenceField = input.field === "input" ? "inputRef" : "resultRef";
  const referenced = { ...input.document, [referenceField]: input.path } as T & Record<string, unknown>;
  const referencedBytes = assertJobDocumentSize(referenced);
  await input.storage.saveJson(input.path, input.payload);
  return { document: referenced, serializedBytes: referencedBytes };
}
