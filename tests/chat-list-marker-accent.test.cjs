const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
const theme = fs.readFileSync(path.join(root, "lib/workspace/theme.ts"), "utf8");

test("ordered and unordered chat list markers follow the selected accent", () => {
  assert.match(css, /\.chat-body li::marker\s*\{\s*color:\s*var\(--list-marker\);\s*\}/);
  assert.match(theme, /--list-marker/);
  assert.match(theme, /accent === "default" \? "var\(--text-muted\)"/);
});
