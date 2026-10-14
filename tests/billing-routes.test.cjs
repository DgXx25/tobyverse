const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");
const meteredRoutes = [
  "app/api/chat/route.ts",
  "app/api/study-sheets/generate/route.ts",
  "app/api/paths/generate/route.ts",
  "app/api/exercises/generate/route.ts",
  "app/api/exercises/feedback/route.ts",
  "app/api/memory/route.ts",
  "app/api/projects/title/route.ts",
  "app/api/images/search/route.ts",
  "app/api/materials/extract/route.ts",
  "app/api/admin/run/route.ts",
  "app/api/admin/audit/route.ts",
];

test("authenticated AI routes start, report, and commit one usage session", () => {
  for (const file of meteredRoutes) {
    const source = read(file);
    assert.match(source, /startAiUsageSession/, file);
    assert.match(source, /usage\.report/, file);
    assert.match(source, /usage\.commit/, file);
  }
});

test("image extraction uses the central provider and streams commit in finally", () => {
  assert.doesNotMatch(read("lib/materials/extract.ts"), /new GoogleGenerativeAI/);
  assert.match(read("lib/ai/json.ts"), /usage:\s*options\.usage/g);
  assert.match(read("app/api/chat/route.ts"), /finally[\s\S]*usage\.commit/);
  assert.match(read("app/api/study-sheets/generate/route.ts"), /finally[\s\S]*usage\.commit/);
});
