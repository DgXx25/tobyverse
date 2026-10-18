/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Firebase Auth deploy config allows TobyVerse standalone Google callback", () => {
  const config = JSON.parse(read("firebase.json"));
  const redirects = config.auth.providers.googleSignIn.authorizedRedirectUris;

  assert.ok(redirects.includes("https://tobyverse.ge/login/google-callback"));
  assert.ok(redirects.includes("https://tobyverse.ge/__/auth/handler"));
  assert.ok(redirects.includes("https://ugstuff-c351a.firebaseapp.com/__/auth/handler"));
  assert.ok(redirects.includes("http://localhost"));
  assert.ok(redirects.every((uri) => !/^http:\/\/(localhost|127\.0\.0\.1):\d+/.test(uri)));
  assert.ok(redirects.every((uri) => !uri.includes("tobyverse.firebaseapp.com")));
});

test("the normal deploy command applies Firebase Auth configuration with Hosting", () => {
  const packageJson = JSON.parse(read("package.json"));

  assert.match(packageJson.scripts.deploy, /firebase deploy --only auth,hosting/);
});
