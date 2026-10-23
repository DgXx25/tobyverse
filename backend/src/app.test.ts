import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "./app.js";

type TestResponse = {
  status(code: number): TestResponse;
  json(value: unknown): TestResponse;
};

test("health endpoint responds with a small JSON success payload", async () => {
  const app = createApp() as unknown as {
    router: {
      stack: Array<{
        route?: {
          path: string;
          methods: Record<string, boolean>;
          stack: Array<{ handle: unknown }>;
        };
      }>;
    };
  };
  const route = app.router.stack.find(
    (layer) => layer.route?.path === "/healthz" && layer.route.methods.get,
  )?.route;
  assert.ok(route, "GET /healthz must be registered");

  let statusCode = 0;
  let payload: unknown;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      payload = value;
      return this;
    },
  };
  const handler = route.stack[0].handle as (
    request: Record<string, never>,
    response: TestResponse,
    next: () => void,
  ) => void;

  handler({}, response, () => assert.fail("health route should finish the request"));
  assert.equal(statusCode, 200);
  assert.deepEqual(payload, { ok: true });
});
