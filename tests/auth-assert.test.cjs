const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) request = path.join(root, request.slice(2));
  return originalResolve.call(this, request, parent, isMain, options);
};
require.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};

test("signed-in request verification uses the server Firebase verifier, not Identity Toolkit lookup", async () => {
  let calls = 0;
  Module._load = function (request, parent, isMain) {
    if (request === "@/lib/server/firestore-admin") {
      return { verifyAdminIdToken: async () => {
        calls++;
        return { uid: "user-1", email: "user@example.com", email_verified: true, firebase: { sign_in_provider: "google.com" } };
      } };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  const { assertSignedInRequest } = require("../lib/api/assert.ts");
  const session = await assertSignedInRequest(new Request("https://tobyverse.test/api", {
    headers: { Authorization: "Bearer verified-id-token" },
  }));
  assert.deepEqual(session, { uid: "user-1", email: "user@example.com", emailVerified: true, anonymous: false });
  assert.equal(calls, 1);
});

test("anonymous sessions are identified from verified Firebase claims", async () => {
  Module._load = function (request, parent, isMain) {
    if (request === "@/lib/server/firestore-admin") {
      return { verifyAdminIdToken: async () => ({ uid: "guest-1", firebase: { sign_in_provider: "anonymous" } }) };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[require.resolve("../lib/api/assert.ts")];
  const { assertSignedInRequest } = require("../lib/api/assert.ts");
  const session = await assertSignedInRequest(new Request("https://tobyverse.test/api", {
    headers: { Authorization: "Bearer verified-anon-token" },
  }));
  assert.equal(session.anonymous, true);
  assert.equal(session.email, null);
});
