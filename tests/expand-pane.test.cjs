/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("expanded pane uses the full available content width", () => {
  const source = read("components/project-view.tsx");

  assert.match(source, /width:\s*panelExpanded\s*\?\s*"100%"\s*:\s*artifactWidth/);
  assert.doesNotMatch(source, /width:\s*panelExpanded\s*\?\s*"min\(100%, 720px\)"/);
});

test("tooltip cluster guards non-Node related targets", () => {
  const source = read("components/workspace/quiet-icon-cluster.tsx");

  assert.match(source, /function isEventTargetInside/);
  assert.match(source, /isEventTargetInside\(clusterRef\.current, event\.relatedTarget\)/);
});
