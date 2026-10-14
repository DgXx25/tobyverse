/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) request = path.join(root, request.slice(2));
  return originalResolve.call(this, request, parent, isMain, options);
};
require.extensions[".ts"] = function (module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(output, filename);
};

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const { PROJECT_ICONS, projectIconFor, foldersOf, normalizeFolder, isProjectIcon } = require("../lib/workspace/project-icons.ts");
const { needsAutoTitle, notebookTitle, UNTITLED_NOTEBOOK_TITLE } = require("../lib/workspace/title.ts");
const { STUDIO_TILES } = require("../lib/workspace/studio.ts");
const { detectSubjectSkill, formatSkillBlock, SUBJECT_SKILLS } = require("../lib/skills/index.ts");

test("a new notebook is untitled until its first question names it", () => {
  assert.equal(UNTITLED_NOTEBOOK_TITLE, "Untitled notebook");
  assert.equal(needsAutoTitle(UNTITLED_NOTEBOOK_TITLE), true);
  assert.equal(needsAutoTitle("Organic chemistry"), false);
  assert.equal(notebookTitle(""), UNTITLED_NOTEBOOK_TITLE);
  assert.equal(notebookTitle("  untitled   notebook "), UNTITLED_NOTEBOOK_TITLE);
  assert.equal(notebookTitle("A long real title that the list must not rewrite at all"), "A long real title that the list must not rewrite at all");
});

test("notebook symbols are stable and never fall back to nothing", () => {
  assert.equal(projectIconFor({ id: "abc", icon: "brain" }), "brain");
  const first = projectIconFor({ id: "abc" });
  assert.equal(projectIconFor({ id: "abc" }), first);
  assert.equal(projectIconFor({ id: "abc", icon: "not-an-icon" }), first);
  assert.ok(PROJECT_ICONS.every(isProjectIcon));
  const spread = new Set(Array.from({ length: 60 }, (_, i) => projectIconFor({ id: `project-${i}` })));
  assert.ok(spread.size > 5, "default symbols should vary across notebooks");
});

test("folders are tidy, de-duplicated and ordered by use", () => {
  assert.equal(normalizeFolder("  Study   plans "), "Study plans");
  assert.equal(normalizeFolder(undefined), "");
  const folders = foldersOf([{ folder: "Work" }, { folder: "Study" }, { folder: " Study " }, {}, { folder: "" }]);
  assert.deepEqual(folders, ["Study", "Work"]);
});

test("every Studio tile maps to a tool the chat already accepts", () => {
  const tools = new Set(["create_practice", "create_sheet", "create_path"]);
  assert.equal(new Set(STUDIO_TILES.map((tile) => tile.id)).size, STUDIO_TILES.length);
  for (const tile of STUDIO_TILES) {
    assert.ok(tools.has(tile.tool), `${tile.id} uses ${tile.tool}`);
    assert.ok(tile.prompt.length > 10);
  }
});

test("the notebook shell replaces the chat sidebar", () => {
  const shell = read("components/app-shell.tsx");
  assert.match(shell, /<Topbar \/>/);
  assert.doesNotMatch(shell, /Sidebar/);
  const view = read("components/project-view.tsx");
  assert.match(view, /<SourcesPane/);
  assert.match(view, /onStudioCreate=\{createFromStudio\}/);
  assert.match(view, /readFlag\(SOURCES_KEY\) \?\? true/);
  assert.match(view, /readFlag\(STUDIO_KEY\) \?\? true/);
  assert.doesNotMatch(view, /Expand pane/);
  assert.doesNotMatch(view, /id: "share"/);
  const panel = read("components/workspace/artifact-panel.tsx");
  assert.match(panel, /useState<TabId>\("studio"\)/);
});

test("a subject skill rides along only on clear evidence", () => {
  assert.equal(detectSubjectSkill({ prompt: "hi" }), null);
  assert.equal(detectSubjectSkill({ prompt: "what is a limit" }), null);
  assert.equal(
    detectSubjectSkill({ prompt: "solve this equation", projectTitle: "Calculus II", materialNames: ["Derivatives.pdf"] })?.id,
    "math",
  );
  assert.equal(
    detectSubjectSkill({ projectTitle: "ორგანული ქიმია", materialNames: ["ქიმიის წიგნი.pdf"], prompt: "აღწერე რეაქცია" })?.id,
    "chemistry",
  );
  assert.equal(
    detectSubjectSkill({ prompt: "explain this function", projectTitle: "Python course", sourceText: "def f(x): return x # code and algorithm" })?.id,
    "programming",
  );
});

test("skills are wording only and never add a ritual", () => {
  assert.equal(formatSkillBlock(null), "");
  const ids = new Set();
  for (const skill of SUBJECT_SKILLS) {
    assert.ok(!ids.has(skill.id));
    ids.add(skill.id);
    assert.ok(skill.write.length < 420, `${skill.id} stays compact`);
    assert.doesNotMatch(skill.write, /always (end|finish|close)|quiz the|end with a question|recap/i);
  }
  const block = formatSkillBlock(SUBJECT_SKILLS[0]);
  assert.match(block, /add no lesson, quiz or recap/);
  assert.match(block, /request still comes first/);
});
