const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("public homepage stays static and signed-in users route at middleware", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8");
  const middleware = fs.readFileSync("middleware.ts", "utf8");
  assert.doesNotMatch(page, /cookies\(\)|headers\(\)/);
  assert.match(middleware, /pathname ===/);
  assert.match(middleware, /SIGNED_IN_COOKIE/);
  assert.match(middleware, /POST_LOGIN_PATH/);
});

test("new-project route paints a shell before loading route-specific client screens", () => {
  const route = fs.readFileSync("components/new-route.tsx", "utf8");
  assert.match(route, /ssr: false, loading: \(\) => <StartupSkeleton/);
  assert.match(route, /dynamic\(\(\) => import\("@\/components\/notebooks-home"\)/);
});
