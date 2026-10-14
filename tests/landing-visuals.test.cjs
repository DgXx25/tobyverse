/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("landing keeps the app palette and the new animated headline", () => {
  const landing = read("components/landing-screen.tsx");
  const auth = read("components/auth-form.tsx");

  assert.match(landing, /import \{ HeadlineVerb \} from "@\/components\/workspace\/headline-verb"/);
  assert.match(landing, /What should we <HeadlineVerb \/>\?/);
  assert.match(landing, /bg-background/);
  assert.match(auth, /variant === "marketing"[\s\S]*?bg-surface-2/);
  assert.doesNotMatch(landing, /<GalaxyWarp\s*\/>/);
});

test("landing brand mark is explicitly white", () => {
  const header = read("components/landing-header.tsx");
  const brand = read("components/brand-mark.tsx");

  assert.match(header, /<BrandMark[^>]*color="#fff"/);
  assert.match(brand, /color\?: string/);
  assert.match(brand, /style=\{\{ color \}\}/);
});
