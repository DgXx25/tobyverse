import assert from "node:assert/strict";
import test from "node:test";
import { createChatGenerationHandler } from "./chat.js";
import type { GenerationJob } from "../types.js";

const job: GenerationJob = {
  id: "job-chat-1", uid: "user-1", kind: "chat", status: "running",
  idempotencyHash: "hash", createdAt: 1, updatedAt: 1, expiresAt: null,
  attempt: 1, attemptId: "attempt-1", nextAttemptAt: 1, eventSequence: 0,
  cancelRequested: false,
};

test("chat jobs stream the existing chat response into persisted events and a result", async () => {
  let receivedToken = "";
  let receivedSignal: AbortSignal | undefined;
  const handler = createChatGenerationHandler({
    async idTokenFor(uid) { assert.equal(uid, "user-1"); return "server-issued-id-token"; },
    async invokeChat(request) {
      receivedToken = request.headers.get("authorization") ?? "";
      receivedSignal = request.signal;
      return new Response([
        'data: {"delta":"Hello "}\n\n',
        'data: {"delta":"there."}\n\n',
        'data: {"tool":{"name":"answer","args":{}}}\n\n',
        'data: {"done":true}\n\n',
      ].join(""), { headers: { "Content-Type": "text/event-stream" } });
    },
  });
  const controller = new AbortController();
  const events: Array<{ type: string; data: unknown }> = [];
  const result = await handler({ prompt: "Hello" }, {
    job,
    attemptId: "attempt-1",
    signal: controller.signal,
    async emit(event: { type: string; data?: unknown }) { events.push({ type: event.type, data: event.data }); },
  } as never) as { text: string; tool: unknown; events: unknown[] };

  assert.equal(receivedToken, "Bearer server-issued-id-token");
  assert.equal(receivedSignal?.aborted, controller.signal.aborted);
  assert.equal(result.text, "Hello there.");
  assert.deepEqual(events.map(({ type }) => type), ["delta", "delta", "tool", "done"]);
  assert.equal(result.events.length, 4);
  controller.abort();
  assert.equal(receivedSignal?.aborted, true);
});

test("a chat route error becomes a failed job error instead of a false success", async () => {
  const handler = createChatGenerationHandler({
    async idTokenFor() { return "token"; },
    async invokeChat() {
      return new Response('data: {"error":"Provider failed"}\n\n', {
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  });

  await assert.rejects(
    handler({ prompt: "Hello" }, {
      job,
      attemptId: "attempt-1",
      signal: new AbortController().signal,
      async emit() {},
    } as never),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "chat_generation_failed",
  );
});
