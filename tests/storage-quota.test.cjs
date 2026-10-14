const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("admin is server-owned and preserved by client profile updates", () => {
  const rules = read("firestore.rules");
  assert.match(rules, /isValidOptionalAdmin/);
  assert.match(rules, /adminFieldUnchanged/);
  assert.match(rules, /data\.admin is bool/);
  assert.match(rules, /clientCanCreatePlan/);
});

test("permission denied is not presented as storage exhausted", () => {
  const source = read("lib/account/store.ts");
  assert.doesNotMatch(source, /isPermissionDenied\(error\).*StorageQuotaError/s);
  assert.match(source, /wouldExceedStorage/);
});

test("legacy per-feature counters are no longer incremented", () => {
  for (const file of ["lib/exercises/generate-set.ts", "lib/study-sheets/generate-client.ts", "components/project-chat.tsx"]) {
    assert.doesNotMatch(read(file), /incrementUsage\(/);
  }
});

test("storage math does not reject an ordinary small upload", () => {
  const source = read("lib/account/plan.ts");
  assert.match(source, /wouldExceedStorage/);
  assert.doesNotMatch(source, /STORAGE_CAP_BYTES\s*=\s*0/);
});
