const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const provider = fs.readFileSync(path.join(root, "components/workspace/theme-provider.tsx"), "utf8");
const picker = fs.readFileSync(path.join(root, "components/workspace/theme-picker.tsx"), "utf8");
const styles = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");

test("local high-contrast preference is not replaced by a stale cloud profile", () => {
  assert.match(provider, /hasStoredHighContrast\(\)/);
  assert.match(provider, /localContrast !== remoteContrast/);
});

test("high contrast is exposed as an accessible switch", () => {
  assert.match(picker, /role="switch"/);
  assert.match(picker, /aria-checked=\{highContrast\}/);
  assert.doesNotMatch(picker, /type="checkbox"/);
});

test("high-contrast mode uses the stronger dark palette", () => {
  assert.match(styles, /html\.dark\.high-contrast\s*\{[^}]*--bg:\s*#000000;[^}]*--surface:\s*#181818;[^}]*--border:\s*#626266;/s);
});
