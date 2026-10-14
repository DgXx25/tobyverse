const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("chat sharing uses the browser Firestore client instead of a server function", () => {
  const chats = read("lib/chats.ts");
  const project = read("components/project-view.tsx");

  assert.match(chats, /export async function setChatSharing\(/);
  assert.match(chats, /updateDoc\(ref, \{[\s\S]*public: true,[\s\S]*shareId,[\s\S]*sharedMaterialIds:/);
  assert.match(project, /setChatSharing\(/);
  assert.doesNotMatch(project, /fetch\("\/api\/share"/);
});

test("share errors are shown in a bottom-right toast", () => {
  const project = read("components/project-view.tsx");

  assert.match(project, /fixed bottom-4 right-4/);
  assert.match(project, /role=\{shareNotice === "error" \? "alert" : "status"\}/);
  assert.doesNotMatch(project, /absolute right-3 top-14/);
});

test("share notices dismiss automatically and use readable toast controls", () => {
  const project = read("components/project-view.tsx");

  assert.match(project, /setTimeout\(\(\) => setShareNotice\(null\), shareNotice === "copied" \? 2600 : 5000\)/);
  assert.match(project, /text-\[14px\] text-foreground shadow-lg/);
  assert.match(project, /h-8 w-8 shrink-0 items-center justify-center/);
  assert.match(project, /text-\[20px\]/);
});

test("only the owner can change public share fields", () => {
  const rules = read("firestore.rules");

  assert.match(rules, /shareFieldsValid\(\)/);
  assert.match(rules, /changed\.hasOnly\(\["public", "shareId", "sharedMaterialIds", "sharedSheetIds"\]\)/);
  assert.match(rules, /!request\.resource\.data\.public/);
  assert.match(rules, /shareFieldsUnchangedOrValid\(\)/);
});

test("shared chat reads use the public Firestore client path, not the Admin-only endpoint", () => {
  const view = read("components/shared-chat-view.tsx");
  const rules = read("firestore.rules");
  const client = read("lib/sharing/client.ts");

  assert.match(view, /loadSharedChatClient/);
  assert.match(view, /loadSharedChatClient\(shareId\)[\s\S]*?catch\(async \(\) => \{[\s\S]*fetch\(`\/api\/share/);
  assert.match(client, /where\("shareId", "==", shareId\)/);
  assert.match(rules, /sharedThread\(projectId, threadId\)/);
});

test("public sharing stores reference allowlists and backend errors are not reported as 404", () => {
  const chats = read("lib/chats.ts");
  const route = read("app/api/share/[shareId]/route.ts");

  assert.match(chats, /sharedMaterialIds/);
  assert.match(chats, /sharedSheetIds/);
  assert.doesNotMatch(route, /catch\s*\{\s*return Response\.json\(\{ error: "Shared chat not found\." \}, \{ status: 404 \}\);\s*\}/);
});
