/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) request = path.join(root, request.slice(2));
  return originalResolve.call(this, request, parent, isMain, options);
};
require.extensions[".ts"] = function (module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(output, filename);
};

const { fastMainChatRoute } = require("../lib/workspace/chat-opening.ts");
const chatRouteSource = fs.readFileSync(path.join(root, "components/chat-route.tsx"), "utf8");
const projectViewSource = fs.readFileSync(path.join(root, "components/project-view.tsx"), "utf8");
const firebaseSource = fs.readFileSync(path.join(root, "lib/firebase.ts"), "utf8");

test("an owned canonical project id can open its main chat immediately", () => {
  const project = {
    id: "project-42",
    userId: "user-7",
  };

  assert.deepEqual(fastMainChatRoute("project-42", "user-7", project), {
    projectId: "project-42",
    threadId: "main",
    project,
  });
});

test("a missing or foreign project never bypasses chat route resolution", () => {
  assert.equal(fastMainChatRoute("project-42", "user-7", null), null);
  assert.equal(
    fastMainChatRoute("project-42", "user-7", { id: "project-42", userId: "other-user" }),
    null,
  );
  assert.equal(
    fastMainChatRoute("project-42", "user-7", { id: "other-project", userId: "user-7" }),
    null,
  );
});

test("chat route can render a resolved project without a second project read", () => {
  assert.match(chatRouteSource, /getProjectById/);
  assert.match(chatRouteSource, /fastMainChatRoute/);
  assert.match(chatRouteSource, /initialProject=/);
  assert.match(projectViewSource, /initialProject\?: Project/);
});

test("browser Firestore keeps a persistent local cache for warm chat openings", () => {
  assert.match(firebaseSource, /initializeFirestore/);
  assert.match(firebaseSource, /persistentLocalCache/);
  assert.match(firebaseSource, /persistentMultipleTabManager/);
});

test("chat route and project view show a loading shell instead of a blank workspace", () => {
  assert.match(chatRouteSource, /ProjectLoading/);
  assert.match(projectViewSource, /ProjectLoading/);
});
