const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const packageJson = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8"),
);

test("the existing dev command keeps Next.js on port 3000", () => {
  assert.equal(packageJson.scripts.dev, "next dev --turbopack --port 3000");
});

test("the parallel stack has a root launcher script", () => {
  assert.equal(packageJson.scripts["dev:stack"], "node scripts/dev-stack.mjs");
});
