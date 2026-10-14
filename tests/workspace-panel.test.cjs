const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("chat reactions render the new inactive and filled icons", () => {
  const source = read("components/project-chat.tsx");

  assert.match(source, /src=\{turnReaction\[message\.id\] === "like" \? "\/icons\/like-filled\.svg" : "\/icons\/like\.svg"\}/);
  assert.match(source, /src=\{turnReaction\[message\.id\] === "dislike" \? "\/icons\/deslike-filled\.svg" : "\/icons\/deslike\.svg"\}/);
  assert.match(source, /style=\{\{ filter: "brightness\(0\) saturate\(100%\).*hue-rotate\(202deg\)/);
  assert.match(source, /disabled=\{turnReaction\[message\.id\] === "dislike"\}/);
});

test("project chat keeps stopped output quiet and renders bounded follow-up prompts", () => {
  const source = read("components/project-chat.tsx");

  assert.match(source, /const \[stoppedIds, setStoppedIds\] = useState/);
  assert.match(source, /const \[suggestedFollowups, setSuggestedFollowups\] = useState/);
  assert.match(source, /if \(partial\) \{[\s\S]*setStoppedIds/);
  assert.doesNotMatch(source, /Request was interrupted by the user/);
  assert.match(source, /slice\(0, 2\)/);
  assert.match(source, /How can I help you today\?/);
  assert.match(source, /What topics interest you\?/);
});

test("library cards use a barely brighter background on hover", () => {
  const source = read("components/library-page.tsx");

  assert.match(source, /bg-surface-2 transition-colors hover:bg-\[color-mix\(in_srgb,var\(--surface-2\)_96%,white\)\]/);
});

test("pane clips fixed-width content and keeps its toggle in the chat header", () => {
  const source = read("components/project-view.tsx");
  const panel = read("components/workspace/artifact-panel.tsx");
  const chat = read("components/project-chat.tsx");

  assert.match(source, /width:\s*panelOpen\s*\?\s*\(panelExpanded\s*\?\s*"100%"\s*:\s*artifactWidth\)\s*:\s*0/);
  assert.match(source, /shrink-0\s+overflow-hidden/);
  assert.match(source, /minWidth:\s*panelExpanded\s*\?\s*undefined\s*:\s*artifactWidth/);
  assert.doesNotMatch(source, /max-md:w-full\s+max-md:min-w-0/);
  assert.match(source, /inert=\{panelOpen\s*\?\s*undefined\s*:\s*true\}/);
  assert.match(source, /label:\s*panelOpen\s*\?\s*"Hide Studio"\s*:\s*"Show Studio"/);
  assert.match(source, /onClick:\s*\(\)\s*=>\s*setStudio\(!panelOpen\)/);
  assert.doesNotMatch(source, /\.\.\.\(!panelOpen\s*\?/);
  assert.doesNotMatch(source, /\{!panelOpen\s*\?\s*<div/);
  assert.match(source, /project-workspace[\s\S]*?absolute right-3 top-1 z-40 hidden md:flex[\s\S]*?relative flex min-h-0 min-w-0 flex-1 flex-col/);
  assert.doesNotMatch(source, /<ArtifactPanel[\s\S]*?\bonClose=\{closePanel\}/);

  assert.match(panel, /<aside className="relative z-\[1\] flex h-full w-full shrink-0 flex-col overflow-hidden bg-transparent/);
  assert.match(panel, /overflow-hidden bg-surface/);
  assert.doesNotMatch(panel, /\bpy-2\s+pl-1\s+pr-2\b/);
  assert.doesNotMatch(panel, /aria-label="Close panel"/);
  assert.match(panel, /<QuietIconCluster\s+size=\{18\}/);
  assert.match(panel, /title="No materials yet"/);

  assert.match(chat, /<ChatComposer[\s\S]*?pad=\{false\}/);
  assert.match(chat, /<ChatComposer[\s\S]*?className="composer-pad"/);

  assert.match(source, /\$\{panelOpen\s*\?\s*"opacity-100"\s*:\s*"opacity-0"\}/);
  assert.match(
    source,
    /transition-opacity\s+duration-\[160ms\]\s+ease-\[cubic-bezier\(0\.4,0,0\.2,1\)\]/,
  );
  assert.doesNotMatch(source, /paneShown|paneIn/);
});

test("pane reserves composer space and supports a full overlay mode", () => {
  const source = read("components/project-view.tsx");
  const chat = read("components/project-chat.tsx");
  const icon = read("components/workspace/ui-icon.tsx");

  assert.match(source, /panelExpanded/);
  assert.doesNotMatch(source, /"Expand pane"/);
  assert.match(source, /onComposerHeightChange=\{setComposerHeight\}/);
  assert.match(source, /--composer-height/);
  assert.match(source, /absolute inset-y-0 right-0/);
  assert.match(source, /right-3 top-1 z-40/);

  assert.match(chat, /onComposerHeightChange/);
  assert.match(chat, /onComposerHeightChange\?\.\(height\)/);
  assert.match(icon, /Maximize01Icon/);
  assert.match(icon, /Minimize01Icon/);
  assert.match(icon, /maximize:\s*Maximize01Icon/);
  assert.match(icon, /minimize:\s*Minimize01Icon/);
});

test("expanded pane keeps the collapse toggle on the far right with an opaque surface", () => {
  const source = read("components/project-view.tsx");

  assert.doesNotMatch(source, /id:\s*"panel-expand"/);
  assert.match(source, /const panelToggleAction[\s\S]*id:\s*"panel"/);
  assert.match(source, /absolute inset-y-0 right-0 z-30 max-w-full bg-surface/);
});

test("pane controls use the smaller icon scale", () => {
  const source = read("components/project-view.tsx");
  const panel = read("components/workspace/artifact-panel.tsx");

  assert.match(source, /QuietIconCluster\s+size=\{18\}/);
  assert.match(panel, /QuietIconCluster\s+[\s\S]*?size=\{18\}/);
});

test("full pane expands from the right without changing chat layout", () => {
  const source = read("components/project-view.tsx");

  assert.match(source, /absolute inset-y-0 right-0 z-30 max-w-full bg-surface/);
  assert.match(source, /minWidth:\s*panelExpanded\s*\?\s*undefined\s*:\s*artifactWidth/);
  assert.match(source, /width:\s*panelOpen\s*\?\s*\(panelExpanded\s*\?\s*"100%"\s*:\s*artifactWidth\)/);
});

test("full pane keeps the chat column reserved and isolates the animated surface", () => {
  const source = read("components/project-view.tsx");

  assert.match(source, /aria-hidden="true"[\s\S]*?style=\{\{\s*width:\s*panelOpen\s*\?\s*artifactWidth\s*:\s*0\s*\}\}/);
  assert.match(source, /artifact-panel-slot/);
});

test("pane animation clips the content surface while expanded mode fills the workspace", () => {
  const source = read("components/project-view.tsx");
  const styles = read("app/globals.css");

  assert.match(source, /artifact-panel-slot/);
  assert.match(source, /style=\{\{[\s\S]*width:\s*panelExpanded\s*\?\s*"100%"\s*:\s*artifactWidth/);
  assert.match(source, /transition-opacity\s+duration-\[160ms\]/);
  assert.match(styles, /\.artifact-panel-slot\s*\{[\s\S]*contain:\s*layout paint[\s\S]*transition:\s*width 180ms/);
});

test("chat reserves the pane slot with the same synchronized width transition", () => {
  const source = read("components/project-view.tsx");
  const styles = read("app/globals.css");

  assert.match(source, /artifact-panel-reserve/);
  assert.match(source, /style=\{\{\s*width:\s*panelOpen\s*\?\s*artifactWidth\s*:\s*0\s*\}\}/);
  assert.match(styles, /\.artifact-panel-reserve\s*\{[\s\S]*transition:\s*width 180ms/);
});

test("notes keep the chat minimum and size the pane from the workspace width", () => {
  const source = read("components/project-view.tsx");

  assert.match(source, /const MIN_NOTES = 360/);
  assert.match(source, /const MIN_CHAT = 420/);
  assert.match(source, /workspaceRef\s*=\s*useRef/);
  assert.match(source, /workspaceRef\.current\?\.clientWidth/);
  assert.match(source, /workspace - other - MIN_CHAT/);
  assert.match(source, /ref=\{workspaceRef\}/);
});

test("full pane fills its content while keeping the overlay full width", () => {
  const source = read("components/project-view.tsx");

  assert.match(source, /width:\s*panelOpen\s*\?\s*\(panelExpanded\s*\?\s*"100%"/);
  assert.match(source, /width:\s*panelExpanded\s*\?\s*"100%"\s*:\s*artifactWidth/);
  assert.match(source, /minWidth:\s*panelExpanded\s*\?\s*undefined\s*:\s*artifactWidth/);
  assert.match(source, /h-full shrink-0 transition-opacity/);
});

test("every panel view shares the notes maximum width", () => {
  const source = read("components/project-view.tsx");

  assert.match(source, /workspace - other - MIN_CHAT/);
  assert.doesNotMatch(source, /panelView === "sheets"[\s\S]*?Math\.round\(workspaceWidth \* 0\.55\)/);
});

test("page-specific chrome replaces the global pane controls", () => {
  const source = read("components/project-view.tsx");
  const panel = read("components/workspace/artifact-panel.tsx");
  const viewer = read("components/workspace/material-viewer.tsx");

  assert.match(source, /panelOwnChrome/);
  assert.match(source, /actions=\{\[panelToggleAction\]\}/);
  assert.match(source, /onPanelChromeChange=\{setPanelOwnChrome\}/);
  assert.match(panel, /onPanelChromeChange/);
  assert.match(panel, /tab === "practice"[\s\S]*?selectedSet/);
  assert.match(panel, /tab === "path"[\s\S]*?selectedPath/);
  assert.match(viewer, /!overlay\s*&&\s*onBack/);
});

test("panel-owned chrome keeps a global pane toggle available", () => {
  const source = read("components/project-view.tsx");

  assert.match(source, /const panelToggleAction[\s\S]*label: panelOpen \? "Hide Studio" : "Show Studio"/);
  assert.match(source, /actions=\{\[panelToggleAction\]\}/);
  assert.match(source, /actions=\{\[sourcesToggleAction\]\}/);
  assert.match(source, /setMobileTopActions\(<QuietIconCluster size=\{18\} actions=\{paneToggles\} \/>\)/);
  assert.match(source, /<QuietIconCluster className="pointer-events-auto" size=\{18\} actions=\{\[panelToggleAction\]\} \/>/);
  assert.doesNotMatch(source, /setMobileTopActions\(panelOwnChrome \? null/);
  assert.doesNotMatch(source, /\{!panelOwnChrome \? \(/);
});

test("panel blocks are lifted slightly above the panel surface and paste icons use text color", () => {
  const panel = read("components/workspace/artifact-panel.tsx");
  const styles = read("app/globals.css");

  assert.match(panel, /artifact-panel-block/);
  assert.match(styles, /\.artifact-panel-block\s*\{[\s\S]*background:\s*var\(--surface\)/);
  assert.match(styles, /\.artifact-panel-paste-icon\s*\{[\s\S]*color:\s*var\(--text\)/);
  assert.match(read("components/library-media.tsx"), /materialType === "paste"/);
});

test("pane fills the desktop height without rounded outer edges", () => {
  const source = read("components/project-view.tsx");
  const panel = read("components/workspace/artifact-panel.tsx");

  assert.match(source, /absolute inset-y-0 right-0 z-30/);
  assert.doesNotMatch(panel, /rounded-l-2xl/);
  assert.match(panel, /bg-surface/);
});

test("panel surface and tile grid use the available width", () => {
  const styles = read("app/globals.css");
  const media = read("components/library-media.tsx");

  assert.match(styles, /\.artifact-grid-container\s*\{[\s\S]*width:\s*100%/);
  assert.match(styles, /\.artifact-tile-grid\s*\{[\s\S]*width:\s*100%/);
  assert.match(media, /artifact-panel-paste-icon/);
});

test("material and note grids scale from two to at most five columns", () => {
  const styles = read("app/globals.css");
  assert.match(styles, /\.artifact-tile-grid\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(styles, /@container\s+artifact-grid\s+\(min-width:\s*420px\)[\s\S]*?repeat\(3,/);
  assert.match(styles, /@container\s+artifact-grid\s+\(min-width:\s*520px\)[\s\S]*?repeat\(4,/);
  assert.match(styles, /@container\s+artifact-grid\s+\(min-width:\s*620px\)[\s\S]*?repeat\(5,/);
  assert.doesNotMatch(styles, /repeat\(6,\s*minmax\(0,\s*1fr\)\)/);
});

test("chat stays pinned to the bottom while the panel width changes", () => {
  const view = read("components/project-view.tsx");
  const chat = read("components/project-chat.tsx");

  assert.match(view, /chatLayoutWidth=\{panelOpen \? artifactWidth : 0\}/);
  assert.match(chat, /chatLayoutWidth\?: number/);
  assert.match(chat, /chatLayoutWidth == null \|\| !pinBottomRef\.current[\s\S]*?stickToBottom\(\);[\s\S]*?\}, \[chatLayoutWidth, stickToBottom\]\)/);
});

test("empty project chat reuses the rotating start headline", () => {
  const source = read("components/project-chat.tsx");
  assert.match(source, /import\s*\{\s*HeadlineVerb\s*\}\s*from\s*"@\/components\/workspace\/headline-verb"/);
  assert.match(source, /emptyThread\s*\?\s*\([\s\S]*?<HeadlineVerb\s*\/>/);
});

test("long user prompts collapse with a fade and expand on click", () => {
  const chat = read("components/project-chat.tsx");
  const styles = read("app/globals.css");

  assert.match(chat, /expandedUserMessages/);
  assert.match(chat, /chat-prompt-collapsed/);
  assert.match(chat, /aria-expanded=/);
  assert.match(styles, /\.chat-prompt-collapsed\s*\{[\s\S]*max-height:/);
  assert.match(styles, /\.chat-prompt-collapsed::after\s*\{[\s\S]*linear-gradient/);
});
