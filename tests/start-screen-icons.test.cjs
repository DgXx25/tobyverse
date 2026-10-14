/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("new page suggestion icons use the theme accent", () => {
  const css = read("app/globals.css");
  const startScreen = read("components/start-screen.tsx");

  assert.match(
    startScreen,
    /<span className="start-suggest-icon accent-symbol">/,
  );
  const iconRule = css.match(/\.start-suggest-icon\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(iconRule, /color:\s*var\(--accent\);/);
});
