import assert from "node:assert/strict";
import test from "node:test";
import { MAX_JOB_DOCUMENT_BYTES } from "./limits.js";
import {
  FirebaseJobPayloadStorage,
  resolveFirebaseStorageBucketName,
  withPayloadReference,
  type JobPayloadStorage,
} from "./payload-storage.js";

function memoryStorage() {
  const objects = new Map<string, string>();
  const storage: JobPayloadStorage = {
    async saveJson(path, value) { objects.set(path, JSON.stringify(value)); },
    async readJson(path) {
      const value = objects.get(path);
      if (value === undefined) throw new Error("missing object");
      return JSON.parse(value) as unknown;
    },
    async delete(path) { objects.delete(path); },
  };
  return { storage, objects };
}

test("small payloads remain inline when the serialized job fits the Firestore cap", async () => {
  const { storage, objects } = memoryStorage();
  const job = await withPayloadReference({
    document: { id: "job-1", status: "queued" },
    field: "input",
    payload: { prompt: "short" },
    path: "users/u1/generation-jobs/job-1/input.json",
    storage,
  });

  assert.ok(job.serializedBytes <= MAX_JOB_DOCUMENT_BYTES);
  assert.deepEqual(job.document.input, { prompt: "short" });
  assert.equal(job.document.inputRef, undefined);
  assert.equal(objects.size, 0);
});

test("oversized payloads are moved to private Storage and only their path stays in the document", async () => {
  const { storage, objects } = memoryStorage();
  const input = { prompt: "x".repeat(MAX_JOB_DOCUMENT_BYTES + 10_000) };
  const path = "users/u1/generation-jobs/job-1/input.json";
  const job = await withPayloadReference({
    document: { id: "job-1", status: "queued" },
    field: "input",
    payload: input,
    path,
    storage,
  });

  assert.ok(job.serializedBytes <= MAX_JOB_DOCUMENT_BYTES);
  assert.equal(job.document.input, undefined);
  assert.equal(job.document.inputRef, path);
  assert.deepEqual(await storage.readJson(path), input);
  assert.equal(objects.size, 1);
});

test("Storage bucket resolution uses an explicit server bucket or the existing Firebase app setting", () => {
  assert.equal(resolveFirebaseStorageBucketName({ FIREBASE_STORAGE_BUCKET: "  private-bucket  " }), "private-bucket");
  assert.equal(resolveFirebaseStorageBucketName({ NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "public-configured-bucket" }), "public-configured-bucket");
  assert.throws(() => resolveFirebaseStorageBucketName({}), /Firebase Storage bucket is not configured/);
});

test("Firebase payload storage consistently uses the configured bucket for save, read, and cleanup", async () => {
  const objects = new Map<string, string>();
  const resolvedBuckets: string[] = [];
  const storage = new FirebaseJobPayloadStorage({
    bucketName: "explicit-job-bucket",
    resolveBucket(name) {
      resolvedBuckets.push(name);
      return {
        file(path) {
          return {
            async save(body) { objects.set(path, body); },
            async download() {
              const body = objects.get(path);
              if (body === undefined) throw new Error("missing object");
              return [Buffer.from(body)];
            },
            async delete() { objects.delete(path); },
          };
        },
      };
    },
  });
  const payload = { result: "x".repeat(300 * 1024) };

  await storage.saveJson("users/u1/generation-jobs/j1/result.json", payload);
  assert.deepEqual(await storage.readJson("users/u1/generation-jobs/j1/result.json"), payload);
  await storage.delete("users/u1/generation-jobs/j1/result.json");

  assert.deepEqual(resolvedBuckets, ["explicit-job-bucket", "explicit-job-bucket", "explicit-job-bucket"]);
  assert.equal(objects.size, 0);
});
