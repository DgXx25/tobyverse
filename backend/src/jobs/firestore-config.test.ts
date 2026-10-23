import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(process.cwd(), "..");

test("job documents, event subcollections, and active counters deny direct client access", () => {
  const rules = readFileSync(resolve(root, "firestore.rules"), "utf8");
  for (const collection of ["generationJobs", "generationJobLimits", "generationJobRequests"]) {
    assert.match(rules, new RegExp(`match /${collection}/`));
  }
  assert.match(rules, /match \/events\//);
  assert.match(rules, /allow read, write: if false/);
});

test("worker queue and expired-lease queries have composite indexes", () => {
  const { indexes } = JSON.parse(readFileSync(resolve(root, "firestore.indexes.json"), "utf8")) as {
    indexes: Array<{ collectionGroup: string; fields: Array<{ fieldPath: string }> }>;
  };
  const fieldSets = indexes
    .filter((index) => index.collectionGroup === "generationJobs")
    .map((index) => index.fields.map(({ fieldPath }) => fieldPath));
  assert.ok(fieldSets.some((fields) => fields.includes("status") && fields.includes("nextAttemptAt")));
  assert.ok(fieldSets.some((fields) => fields.includes("status") && fields.includes("leaseExpiresAt")));
});
