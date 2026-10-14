/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("top bar icons use the active theme accent", () => {
  const topbar = read("components/topbar.tsx");
  const css = read("app/globals.css");

  assert.match(topbar, /accent-symbol/);
  assert.match(css, /\.accent-symbol\s*\{\s*color:\s*var\(--accent\);\s*\}/);
});

test("standalone OAuth returns without a server redirect or a short result timeout", () => {
  const auth = read("lib/auth.ts");
  const middleware = read("middleware.ts");
  const callback = read("app/login/google-callback/page.tsx");
  const layout = read("app/layout.tsx");

  assert.doesNotMatch(auth, /Promise\.race\(\[\s*getRedirectResult/);
  assert.match(auth, /REDIRECT_RESULT_MS\s*=\s*15000/);
  assert.doesNotMatch(middleware, /if \(signedIn && \(pathname === "\/" \|\| pathname === "\/login"\)/);
  assert.match(callback, /target\.hash\s*=\s*window\.location\.hash/);
  assert.match(layout, /matchMedia\(\\?"\(display-mode: standalone\)\\?"\)/);
});
