import assert from "node:assert/strict";
import test from "node:test";
import { createLegacyChatInvoker } from "./legacy-chat-bridge.js";

test("the compatibility bridge invokes the existing route with the worker-owned request", async () => {
  let received: Request | undefined;
  const invoker = createLegacyChatInvoker(async () => ({
    async POST(request) {
      received = request;
      return new Response("accepted", { status: 202 });
    },
  }));
  const request = new Request("http://tobyverse.internal/api/chat", { method: "POST" });
  const response = await invoker(request);

  assert.equal(received, request);
  assert.equal(response.status, 202);
  assert.equal(await response.text(), "accepted");
});

test("the default bridge can load the current Next chat handler under Node", async () => {
  const invoke = createLegacyChatInvoker();
  const response = await invoke(new Request("http://tobyverse.internal/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Hello" }),
  }));
  assert.equal(response.status, 401);
});
