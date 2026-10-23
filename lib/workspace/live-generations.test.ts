import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_ACTIVE_NAVIGATION_GENERATIONS,
  abortLiveGeneration,
  beginLiveGeneration,
  finishLiveGeneration,
  getActiveGenerationProjectIds,
  getActiveGenerationCount,
  getLiveGeneration,
  makeLiveGenerationKey,
  subscribeActiveGenerations,
  subscribeLiveGeneration,
  updateLiveGeneration,
} from "./live-generations.js";

test("a conversation's stream survives navigation unsubscribe and is available when the view returns", () => {
  const key = makeLiveGenerationKey("project-a", "main");
  const controller = new AbortController();
  const initialStream = { content: "first part", status: "Thinking…" };
  assert.equal(beginLiveGeneration({ key, projectId: "project-a", threadId: "main", controller, stream: initialStream }), true);

  let notifications = 0;
  const leaveView = subscribeLiveGeneration(key, () => { notifications += 1; });
  leaveView();
  assert.equal(updateLiveGeneration<typeof initialStream>(key, controller, (stream) => ({ ...stream!, content: "first part, then more" })), true);
  assert.equal(controller.signal.aborted, false, "leaving a route must not abort the request");

  const resumed = getLiveGeneration<typeof initialStream>(key);
  assert.equal(resumed?.stream?.content, "first part, then more");
  assert.equal(resumed?.stream?.status, "Thinking…");
  assert.deepEqual(getActiveGenerationProjectIds(), ["project-a"]);
  assert.equal(notifications, 0, "a departed view should no longer receive updates");

  let returnedViewNotifications = 0;
  const returnView = subscribeLiveGeneration(key, () => { returnedViewNotifications += 1; });
  updateLiveGeneration<typeof initialStream>(key, controller, (stream) => ({ ...stream!, content: "complete" }));
  assert.equal(returnedViewNotifications, 1);
  returnView();

  finishLiveGeneration(key, controller);
  assert.equal(getLiveGeneration(key), null);
  assert.deepEqual(getActiveGenerationProjectIds(), []);
});

test("three project conversations can keep independent generations active, with a fourth rejected", () => {
  const entries = Array.from({ length: MAX_ACTIVE_NAVIGATION_GENERATIONS }, (_, index) => {
    const projectId = `project-${index + 1}`;
    const key = makeLiveGenerationKey(projectId, "main");
    const controller = new AbortController();
    return { key, projectId, controller };
  });

  for (const entry of entries) {
    assert.equal(beginLiveGeneration({ ...entry, threadId: "main", stream: { content: entry.projectId } }), true);
  }
  const fourthController = new AbortController();
  assert.equal(beginLiveGeneration({
    key: makeLiveGenerationKey("project-4", "main"),
    projectId: "project-4",
    threadId: "main",
    controller: fourthController,
    stream: { content: "project-4" },
  }), false);
  assert.deepEqual(getActiveGenerationProjectIds(), ["project-1", "project-2", "project-3"]);

  assert.equal(abortLiveGeneration(entries[1].key), true);
  assert.equal(entries[1].controller.signal.aborted, true);
  assert.equal(entries[0].controller.signal.aborted, false);
  for (const entry of entries) finishLiveGeneration(entry.key, entry.controller);
  assert.deepEqual(getActiveGenerationProjectIds(), []);
});

test("active project indicators update when generations start and finish", () => {
  let notifications = 0;
  const unsubscribe = subscribeActiveGenerations(() => { notifications += 1; });
  const first = { key: makeLiveGenerationKey("project-a", "main"), projectId: "project-a", threadId: "main", controller: new AbortController() };
  const second = { key: makeLiveGenerationKey("project-a", "thread-2"), projectId: "project-a", threadId: "thread-2", controller: new AbortController() };

  assert.equal(beginLiveGeneration({ ...first, stream: { content: "one" } }), true);
  assert.equal(beginLiveGeneration({ ...second, stream: { content: "two" } }), true);
  assert.equal(getActiveGenerationCount(), 2);
  assert.deepEqual(getActiveGenerationProjectIds(), ["project-a"]);
  assert.equal(notifications, 1, "a second active conversation in the same project keeps one tab indicator");

  finishLiveGeneration(first.key, first.controller);
  assert.equal(getActiveGenerationCount(), 1);
  assert.deepEqual(getActiveGenerationProjectIds(), ["project-a"]);
  finishLiveGeneration(second.key, second.controller);
  assert.equal(notifications, 2);
  assert.deepEqual(getActiveGenerationProjectIds(), []);
  unsubscribe();
});
