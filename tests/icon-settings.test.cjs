const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("workspace symbols use the free Hugeicons set", () => {
  const icon = read("components/workspace/ui-icon.tsx");
  const project = read("components/project-view.tsx");
  const panel = read("components/workspace/artifact-panel.tsx");
  const kindIcon = read("components/workspace/file-kind-icon.tsx");
  const media = read("lib/library/media.ts");
  assert.match(icon, /@hugeicons\/react/);
  assert.match(icon, /@hugeicons\/core-free-icons/);
  for (const name of ["Search01Icon", "Settings01Icon", "Share01Icon", "SidebarLeftIcon", "Notebook01Icon", "Folder01Icon"]) {
    assert.ok(icon.includes(name), `missing hugeicon ${name}`);
  }
  assert.match(kindIcon, /@hugeicons\/core-free-icons/);
  assert.match(kindIcon, /Pdf01Icon/);
  assert.match(kindIcon, /Doc01Icon/);
  assert.match(media, /return "jpg"/);
  assert.match(media, /return "png"/);
  assert.match(project, /icon: "panelRight"/);
  assert.match(project, /icon: "panelLeft"/);
  assert.match(panel, /icon: "spark"/);
  assert.match(read("components/topbar.tsx"), /Notebook settings/);
  assert.match(read("components/workspace/sources-pane.tsx"), /name="plus"/);
  assert.match(read("components/workspace/studio-pane.tsx"), /icon: "notes"/);
});

test("file kind tiles use the uploaded format assets", () => {
  const kindIcon = read("components/workspace/file-kind-icon.tsx");
  const media = read("lib/library/media.ts");

  for (const name of ["pdf", "doc", "docx", "csv", "excel", "ppt", "pptx", "jpg", "png"]) {
    assert.match(kindIcon, new RegExp(`${name}:\\s*\\w+Icon`), `missing ${name} icon`);
  }
  assert.match(media, /return "doc"/);
  assert.match(media, /return "csv"/);
  assert.match(media, /return "excel"/);
  assert.match(media, /return "ppt"/);
});

test("settings sections have hover and persistent active states, except Account opens separately", () => {
  const settings = read("components/workspace/settings-modal.tsx");
  const css = read("app/globals.css");
  assert.match(settings, /settings-section-item/);
  assert.match(css, /\.settings-section-item:hover/);
  assert.match(css, /\.settings-section-item\[data-active="true"\]/);
  assert.match(settings, /window\.open\("\/account", "_blank"/);
  assert.match(read("components/account-sheet.tsx"), /window\.open\("\/account", "_blank"/);
});
