import { getAdminFirestore } from "../firebase/admin.js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function timestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  return null;
}

export async function inspectJobs(now = Date.now()) {
  const snapshot = await getAdminFirestore()
    .collection("generationJobs")
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  return snapshot.docs.flatMap((document) => {
    const data = document.data();
    const status = data.status;
    if (status !== "queued" && status !== "running" && status !== "failed") return [];
    const leaseExpiresAt = timestamp(data.leaseExpiresAt);
    const nextAttemptAt = timestamp(data.nextAttemptAt);
    const updatedAt = timestamp(data.updatedAt);
    const createdAt = timestamp(data.createdAt);
    const stuck = status === "running"
      ? leaseExpiresAt !== null && leaseExpiresAt <= now
      : status === "queued" && nextAttemptAt !== null && nextAttemptAt < now - 5 * 60_000;

    const error = data.error && typeof data.error === "object" ? data.error as Record<string, unknown> : undefined;
    return [{
      jobId: document.id,
      kind: typeof data.kind === "string" ? data.kind : "unknown",
      status,
      attempt: typeof data.attempt === "number" ? data.attempt : 0,
      ageSeconds: createdAt === null ? null : Math.max(0, Math.floor((now - createdAt) / 1_000)),
      updatedAt: updatedAt === null ? null : new Date(updatedAt).toISOString(),
      stuck,
      ...(error ? {
        errorCode: typeof error.code === "string" ? error.code : "unknown",
        retryable: error.retryable === true,
      } : {}),
    }];
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  inspectJobs()
    .then((jobs) => console.log(JSON.stringify({ inspected: jobs.length, jobs }, null, 2)))
    .catch((error) => {
      console.error(`Job inspection failed: ${error instanceof Error ? error.name : "Error"}`);
      process.exitCode = 1;
    });
}
