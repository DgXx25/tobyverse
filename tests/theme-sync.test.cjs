const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const provider = fs.readFileSync(path.join(root, "components/workspace/theme-provider.tsx"), "utf8");

test("stale profile snapshots cannot override a local theme selection while it is being saved", () => {
  assert.match(provider, /pendingThemeRef/);
  assert.match(provider, /remote !== pending\.theme[\s\S]*?return;/);
  assert.match(provider, /if \(remote !== pending\.theme\) return;\s*pendingThemeRef\.current = null/);
  assert.match(provider, /pendingThemeRef\.current = \{ userId, theme: next \}/);
});

test("theme profile sync is keyed by the stable auth id", () => {
  assert.match(provider, /const userId = user\?\.uid/);
  assert.match(provider, /subscribeUserProfile\(userId/);
  assert.match(provider, /\}, \[userId\]\)/);
  assert.doesNotMatch(provider, /themeRef\.current = theme;/);
});
