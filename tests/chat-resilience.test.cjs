/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("project APIs use Admin-backed Bearer auth and bounded bootstrap", () => {
  assert.match(source("app/api/projects/create/route.ts"), /verifyAdminIdToken/);
  assert.match(source("app/api/projects/bootstrap/route.ts"), /verifyAdminIdToken/);
  assert.match(source("app/api/projects/bootstrap/route.ts"), /limit\(40\)/);
});

test("chat listener is bounded and project creation has a 12 second deadline", () => {
  assert.match(source("lib/chats.ts"), /limit\(40\)/);
  assert.match(source("lib/workspace/start-project.ts"), /12_000/);
  assert.match(source("components/project-chat.tsx"), /initialMessages/);
  assert.match(source("components/chat-route.tsx"), /api\/projects\/bootstrap/);
});

test("settled work status discloses persisted steps and empty stop is not saved", () => {
  assert.match(source("components/workspace/status-wait.tsx"), /Worked for .*›/);
  assert.match(source("components/project-chat.tsx"), /if \(partial\)/);
  assert.match(source("components/project-chat.tsx"), /savedSteps|artifactStepsRef/);
});
