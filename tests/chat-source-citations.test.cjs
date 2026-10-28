const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectChat = fs.readFileSync(path.join(__dirname, '../components/project-chat.tsx'), 'utf8');

test('assistant answers render their retrieved sources below the answer', () => {
  assert.match(projectChat, /import\s*\{[^}]*\bCitedSources\b[^}]*\}\s*from\s*["']@\/components\/workspace\/citations["']/);
  assert.match(projectChat, /<CitedSources\s+sources=\{turnSources\s*\?\?\s*\[\]\}\s+onOpen=\{onOpenMaterial\}\s*\/>/);
});
