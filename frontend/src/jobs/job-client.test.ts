import assert from "node:assert/strict";
import test from "node:test";
import { createJobClient } from "./job-client.js";

test("job creation uses the current Firebase token and its idempotency key", async () => {
  let captured: RequestInit | undefined;
  const client = createJobClient({
    async getIdToken() { return "firebase-id-token"; },
    async fetcher(_input, init) {
      captured = init;
      return Response.json({ jobId: "job-1", status: "queued" }, { status: 202 });
    },
  });

  const result = await client.start({ prompt: "Hello" }, "request-key-123");
  const headers = new Headers(captured?.headers);
  assert.equal(result.jobId, "job-1");
  assert.equal(headers.get("authorization"), "Bearer firebase-id-token");
  assert.deepEqual(JSON.parse(String(captured?.body)), {
    kind: "chat", payload: { prompt: "Hello" }, idempotencyKey: "request-key-123",
  });
});

test("event reconnect sends the last persisted cursor and closes on a terminal event", async () => {
  let requestHeaders: Headers | undefined;
  const states: string[] = [];
  const events: number[] = [];
  const client = createJobClient({
    async getIdToken() { return "token"; },
    async fetcher(_input, init) {
      requestHeaders = new Headers(init?.headers);
      return new Response("id: 12\nevent: succeeded\ndata: null\n\n", {
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  });
  await client.events("job 1", 11, new AbortController().signal, (event) => events.push(event.id), (state) => states.push(state));

  assert.equal(requestHeaders?.get("last-event-id"), "11");
  assert.equal(requestHeaders?.get("authorization"), "Bearer token");
  assert.deepEqual(events, [12]);
  assert.equal(states.at(-1), "closed");
});

test("exhausted reconnect attempts produce a visible paused state", async () => {
  let finalState = "";
  let finalMessage = "";
  const client = createJobClient({
    async getIdToken() { return "token"; },
    async fetcher() { throw new Error("offline"); },
    maxReconnects: 0,
  });
  await client.events("job-1", 0, new AbortController().signal, () => {}, (state, message) => {
    finalState = state;
    finalMessage = message ?? "";
  });
  assert.equal(finalState, "paused");
  assert.match(finalMessage, /offline/);
});
