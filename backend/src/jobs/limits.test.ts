import assert from "node:assert/strict";
import test from "node:test";
import {
  ActiveJobLimitError,
  addActiveJob,
  MAX_ACTIVE_JOBS_PER_USER,
  removeActiveJob,
} from "./limits.js";

test("the active list accepts three distinct jobs and rejects a fourth", () => {
  const active = addActiveJob([], "job-1");
  const two = addActiveJob(active, "job-2");
  const three = addActiveJob(two, "job-3");

  assert.equal(MAX_ACTIVE_JOBS_PER_USER, 3);
  assert.deepEqual(three, ["job-1", "job-2", "job-3"]);
  assert.throws(() => addActiveJob(three, "job-4"), ActiveJobLimitError);
});

test("adding an existing job is idempotent and terminal removal happens once", () => {
  const once = addActiveJob(["job-1"], "job-1");
  assert.deepEqual(once, ["job-1"]);
  assert.deepEqual(removeActiveJob(once, "job-1"), []);
  assert.deepEqual(removeActiveJob([], "job-1"), []);
});
