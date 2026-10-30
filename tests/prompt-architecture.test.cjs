/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

const { buildChatSystemPrompt } = require('../lib/chat/context.ts');
const { detectSubjectSkill } = require('../lib/skills/index.ts');
const base = { projectId: 'p', projectTitle: 'Workspace', projectDescription: '', goal: '', mode: 'auto', materials: [], knowledgeItems: [], prompt: 'Hello' };
const activePath = { title: 'English', courseTitle: 'English', nodeTitle: 'Present perfect', teach: 'Discuss usage', outcome: '', done: 0, total: 4, courseCount: 1, started: true };

test('multi-step equations use one vertically aligned math block with optional purpose text', () => {
  const { CORE_SYSTEM_INSTRUCTION } = require('../lib/ai/core-instruction.ts');
  const { CHAT_TOOL_DEFINITIONS } = require('../lib/ai/tools.ts');
  const illustrate = CHAT_TOOL_DEFINITIONS.find(({ name }) => name === 'illustrate');
  assert.match(CORE_SYSTEM_INSTRUCTION, /For math and quantitative explanations, put meaningful formulas and worked calculations in display-math blocks/i);
  assert.match(CORE_SYSTEM_INSTRUCTION, /one equation per row/i);
  assert.match(CORE_SYSTEM_INSTRUCTION, /Avoid inline prose and arrow chains/i);
  assert.match(CORE_SYSTEM_INSTRUCTION, /short purpose note .*explain the goal, not the operation/i);
  assert.match(CORE_SYSTEM_INSTRUCTION, /Do not force a block around every number/i);
  assert.match(CORE_SYSTEM_INSTRUCTION, /MUST end with one short, broad, optional-sounding question offering to continue/i);
  assert.match(illustrate.description, /Optionally emit typed catalog blocks when a visual materially helps/);
  assert.doesNotMatch(illustrate.description, /For multi-step equation solutions, prefer inline display-math blocks/);
  const { SUBJECT_SKILLS } = require('../lib/skills/index.ts');
  const math = SUBJECT_SKILLS.find(({ id }) => id === 'math');
  assert.match(math.write, /math explanations as well as requested solutions, place meaningful formulas .* display-math blocks/i);
});

test('equation math blocks need no wording hint or extra tool schema', () => {
  const prompt = buildChatSystemPrompt({ ...base, prompt: 'იპოვე z: 6z + 4 = 28.' });
  assert.doesNotMatch(prompt, /Optional native blocks available this turn \(sections\)/);
  assert.match(prompt, /one display-math block using .*begin\{aligned\}/i);
  assert.match(prompt, /short purpose note .*explain the goal, not the operation/i);
});

test('one short core is the exact prefix in every mode, with optional ordered slots', () => {
  const { CORE_SYSTEM_INSTRUCTION } = require('../lib/ai/core-instruction.ts');
  const { assembleChatSystemPrompt } = require('../lib/chat/system-prompt.ts');
  const words = CORE_SYSTEM_INSTRUCTION.split(/\s+/).length;
  assert.ok(words >= 150 && words <= 400, `core has ${words} words`);
  assert.match(CORE_SYSTEM_INSTRUCTION, /MUST avoid repeating information across formats; use another form only for distinct value/u);
  assert.equal(assembleChatSystemPrompt({}), CORE_SYSTEM_INSTRUCTION);
  assert.equal(buildChatSystemPrompt({ ...base, projectTitle: '' }), CORE_SYSTEM_INSTRUCTION);
  const normal = `${CORE_SYSTEM_INSTRUCTION}\n\n<project_context>\nProject: Workspace.\n</project_context>`;
  for (const mode of ['auto', 'fast', 'teacher']) {
    const prompt = buildChatSystemPrompt({ ...base, mode });
    assert.equal(prompt, normal);
    assert.equal(prompt.split(CORE_SYSTEM_INSTRUCTION).length, 2);
    assert.doesNotMatch(prompt, /<subject_skill>|<active_path>|<user_memory>|<turn_materials>/);
  }
  const prompt = assembleChatSystemPrompt({ materials: 'RAG', memory: 'USER', path: 'PATH', subject: 'SUBJECT', project: 'PROJECT', mode: 'LEGACY_STYLE', turn: 'TURN' });
  assert.doesNotMatch(prompt, /reply_style|LEGACY_STYLE/);
  const tags = ['project_context', 'subject_skill', 'active_path', 'user_memory', 'turn_context', 'turn_materials'];
  for (let i = 1; i < tags.length; i++) assert.ok(prompt.indexOf(`<${tags[i - 1]}>`) < prompt.indexOf(`<${tags[i]}>`));
});

test('general voice prefers concise simple answers without a fixed length cap', () => {
  const { CORE_SYSTEM_INSTRUCTION } = require('../lib/ai/core-instruction.ts');
  assert.match(CORE_SYSTEM_INSTRUCTION, /keep simple requests short/i);
  assert.match(CORE_SYSTEM_INSTRUCTION, /synthesize search findings.*instead of narrating sources one by one/i);
  assert.match(CORE_SYSTEM_INSTRUCTION, /no fixed word limit or template/i);
});

test('weak, repeated, and tied subject signals inject nothing', () => {
  for (const signals of [
    { prompt: 'How does this function?' },
    { projectTitle: 'Market', prompt: 'supply', materialNames: ['demand'] },
    { prompt: 'cell cell cell', projectTitle: 'cell' },
    { prompt: 'Compare physics and chemistry' },
    { prompt: 'Tell me about bankruptcy' },
    { prompt: "Summarize Matthew's email" },
    { prompt: 'Explain B12 deficiency' },
    { prompt: 'Tell me about an APIary' },
    { prompt: 'What is your physical address?' },
  ]) assert.equal(detectSubjectSkill(signals), null, JSON.stringify(signals));
});

test('clear title, question, material, or rich retrieved evidence enables a skill', () => {
  for (const [signals, id] of [
    [{ projectTitle: 'Mathematics' }, 'math'],
    [{ projectTitle: 'Programming' }, 'programming'],
    [{ projectTitle: 'Law' }, 'law'],
    [{ prompt: 'Explain photosynthesis' }, 'biology'],
    [{ prompt: 'What are differential equations?' }, 'math'],
    [{ materialNames: ['Python handbook'] }, 'programming'],
    [{ sourceText: 'chloroplast photosynthesis enzyme protein' }, 'biology'],
    [{ prompt: 'რა არის გრამატიკა?' }, 'language'],
  ]) assert.equal(detectSubjectSkill(signals)?.id, id, JSON.stringify(signals));
  assert.equal(detectSubjectSkill({ projectTitle: 'Mathematics algebra calculus', prompt: 'Explain Python syntax' })?.id, 'programming');
});

test('path metadata cannot activate instructions or block cards in parent chats', () => {
  const without = buildChatSystemPrompt(base);
  for (const extra of [
    { path: activePath, pathTopic: 'official letter' },
    { path: { ...activePath, inPathThread: true }, inPathThread: false, pathTopic: 'official letter' },
    { path: { ...activePath, started: false }, inPathThread: true },
  ]) assert.equal(buildChatSystemPrompt({ ...base, ...extra }), without);
  const prompt = buildChatSystemPrompt({ ...base, path: activePath, inPathThread: true });
  assert.match(prompt, /<active_path>[\s\S]*Present perfect/);
  assert.doesNotMatch(prompt, /short useful talk, a table|columns Form \/ Use \/ Example/);
});

test('memory is optional, relevant, and usable in Fast too; turn data comes last', () => {
  const prompt = buildChatSystemPrompt({ ...base, mode: 'fast', personalization: 'Unreviewed legacy preference', memories: [{ id: 'm', content: 'Name: Nino' }, { id: 'language', content: 'Prefers Georgian.' }], materials: [{ id: 'f', name: 'Notes', excerpt: 'Fallback material' }] });
  assert.match(prompt, /<user_memory>[\s\S]*Prefers Georgian/);
  assert.doesNotMatch(prompt, /Unreviewed legacy preference/);
  assert.doesNotMatch(prompt, /Name: Nino/);
  assert.ok(prompt.indexOf('<user_memory>') < prompt.indexOf('<turn_materials>'));
  assert.match(prompt, /Fallback material/);
});

test('legacy project maps, project memory and inferred profiles do not enter chat prompts', () => {
  const prompt = buildChatSystemPrompt({ ...base, prompt: 'Explain photosynthesis', projectMemory: ['Legacy photosynthesis project fact'], adaptiveContext: 'Legacy inferred photosynthesis behavior', personalization: 'Legacy inferred response style' });
  assert.doesNotMatch(prompt, /Legacy|Known about this subject|<user_memory>/);
  assert.match(prompt, /Project: Workspace/);
});

test('RAG takes precedence over excerpts and retains numbered source text', () => {
  const prompt = buildChatSystemPrompt({ ...base, materials: [{ id: 'f', name: 'Notes', excerpt: 'UNUSED_EXCERPT' }], sources: [{ n: 1, materialId: 'f', title: 'Notes', page: 2, pageEnd: 2, section: 'Intro', text: 'RETRIEVED_PASSAGE' }] });
  assert.match(prompt, /<turn_materials>[\s\S]*\[S1\][\s\S]*RETRIEVED_PASSAGE/);
  assert.doesNotMatch(prompt, /UNUSED_EXCERPT/);
});

test('native fences stay available and optional in every reply style', () => {
  const { parseTobyFence } = require('../lib/blocks/registry.ts');
  const { dialogueSchema } = require('../lib/blocks/kinds/dialogue.ts');
  const { CHAT_MODE_INSTRUCTIONS } = require('../lib/core/chat-modes.ts');
  for (const mode of ['auto', 'fast', 'teacher']) {
    const prompt = buildChatSystemPrompt({ ...base, mode, prompt: 'Explain a dialogue' });
    assert.match(prompt, /toby dialogue/);
    assert.match(prompt, /optional/i);
    assert.doesNotMatch(CHAT_MODE_INSTRUCTIONS[mode], /hint before|quiz|table|block/);
  }
  const body = { speakers: [{ id: 'a', name: 'Nino' }, { id: 'b', name: 'Toby' }], lines: [{ speaker: 'a', text: 'Hello' }, { speaker: 'b', text: 'Hi' }] };
  assert.equal(dialogueSchema.safeParse(body).success, true);
  const parsed = parseTobyFence('toby dialogue', JSON.stringify(body));
  assert.equal(parsed.type, 'dialogue');
  assert.equal(parsed.data.lines[0].text, 'Hello');
});

test('native blocks can be interleaved at the point they explain, without an opt-in question', () => {
  const { chatBlockDefs, formatTobyBlockCards, parseTobyFence } = require('../lib/blocks/registry.ts');
  const { matchChatBlocks, tobyCardsForTurn } = require('../lib/blocks/match.ts');
  const { CHAT_TOOL_DEFINITIONS } = require('../lib/ai/tools.ts');
  const cards = formatTobyBlockCards(chatBlockDefs().filter(({ id }) => ['sections', 'scene', 'image-list'].includes(id)));
  assert.match(cards, /optional/i);
  assert.match(cards, /Place each block where its explanation is being discussed/i);
  assert.match(cards, /interleave prose and blocks naturally/i);
  assert.match(cards, /do not collect them at the end/i);
  assert.match(cards, /do not ask for permission to use an available block/i);
  assert.match(cards, /Prefer concise prose around a block; retain useful reasoning and details, and expand when the request calls for it/i);
  assert.match(cards, /only when it helps/i);

  for (const prompt of [
    'Explain the stages of photosynthesis',
    'Compare two approaches to solving this equation',
    'Show me photos of these places in a useful list',
  ]) {
    const context = { ...base, prompt };
    assert.ok(matchChatBlocks(context).length > 0, prompt);
    assert.match(tobyCardsForTurn(context), /interleave prose and blocks naturally/i, prompt);
  }

  const { layoutImageGalleries } = require('../lib/images/galleries.ts');
  const mixed = [
    'First explanation.',
    '```toby scene\n{"id":"photosynthesis","locale":"ka"}\n```',
    'Explanation that connects the next idea.',
    '```toby sections\n{"items":[{"symbol":"idea","title":"Core idea","text":"Useful detail."}]}\n```',
    'Closing thought.',
  ].join('\n\n');
  const segments = layoutImageGalleries(mixed).segments;
  assert.deepEqual(segments.map((part) => part.kind === 'fence' ? part.lang : part.kind), [
    'md', 'toby', 'md', 'toby', 'md',
  ]);
  for (const part of segments.filter(({ kind }) => kind === 'fence')) {
    assert.ok(parseTobyFence(part.lang, part.text));
  }

  const sheet = CHAT_TOOL_DEFINITIONS.find(({ name }) => name === 'suggest_sheet');
  assert.ok(sheet);
  assert.match(sheet.description, /express(?:es|ed) interest/i);
  assert.doesNotMatch(sheet.description, /after a substantial explanation/i);
  assert.match(sheet.description, /Never offer it just because an explanation is substantial/i);
});

test('legacy voice wrappers use the same core without a second format contract', () => {
  const { CORE_SYSTEM_INSTRUCTION } = require('../lib/ai/core-instruction.ts');
  const { ASK_WRITING_CONTRACT, withAskWritingContract } = require('../lib/ai/voice.ts');
  assert.equal(ASK_WRITING_CONTRACT, CORE_SYSTEM_INSTRUCTION);
  assert.equal(withAskWritingContract(''), CORE_SYSTEM_INSTRUCTION);
  assert.equal(withAskWritingContract('Context'), CORE_SYSTEM_INSTRUCTION + '\n\nContext');
});

test('hidden path lead keeps the routing marker and cannot authorize a check', () => {
  const { leadPathPrompt } = require('../lib/paths/lead.ts');
  const { requestedChatExercise } = require('../lib/chat/prompt-ask.ts');
  for (const kind of ['course', 'review']) {
    const prompt = leadPathPrompt('Grammar', 'აქ გამომცადე', kind);
    assert.ok(prompt.startsWith('Tutor-lead (not a user request):'));
    assert.equal(requestedChatExercise(prompt), false);
  }
});

test('material excerpts can supply subject evidence when retrieval is unavailable', () => {
  const prompt = buildChatSystemPrompt({ ...base, materials: [{ id: 'f', name: 'Notes', excerpt: 'photosynthesis enzyme protein' }] });
  assert.match(prompt, /<subject_skill>[\s\S]*biology/);
});

test('a form-writing path or project does not impose a paper on an unrelated request', () => {
  for (const extra of [
    { projectTitle: 'Official letter' },
    { path: { ...activePath, nodeTitle: 'Official letter' }, pathTopic: 'official letter', inPathThread: true },
  ]) {
    const prompt = buildChatSystemPrompt({ ...base, ...extra, prompt: 'Give me an example of a Python function' });
    assert.doesNotMatch(prompt, /Form-writing this turn|a paper fence with sample/);
  }
  const prompt = buildChatSystemPrompt({ ...base, prompt: 'Show an official letter example' });
  assert.match(prompt, /If you choose a paper block/);
});

test('active path adds only the current node, brief context, and explicit tool consent', () => {
  const { formatPathBriefing } = require('../lib/paths/model.ts');
  const expected = 'Current node: "Present perfect".\nContext: Discuss usage\nUse tools only when explicitly requested or accepted.';
  const input = { ...activePath, inPathThread: true, nextTitle: 'Past perfect', why: 'For an exam', kind: 'review' };
  assert.equal(formatPathBriefing(input), expected);
  const prompt = buildChatSystemPrompt({ ...base, path: input, inPathThread: true });
  assert.equal(prompt.match(/<active_path>\n([\s\S]*?)\n<\/active_path>/)[1], expected);
});

test('materials contain one basis line and the supplied data without repeated policy', () => {
  const source = { n: 1, materialId: 'f', title: 'Notes', page: 2, pageEnd: 2, section: 'Intro', text: 'RETRIEVED_PASSAGE' };
  for (const extra of [
    { sources: [source] },
    { materials: [{ id: 'f', name: 'Notes', excerpt: 'FALLBACK_EXCERPT' }] },
    { figures: [{ name: 'Figure', path: '/slide.png', page: 2, mime: 'image/png', data: 'a' }] },
    { sources: [source], figures: [{ name: 'Figure', path: '/slide.png', page: 2, mime: 'image/png', data: 'a' }] },
  ]) {
    const prompt = buildChatSystemPrompt({ ...base, ...extra });
    const block = prompt.match(/<turn_materials>\n([\s\S]*?)\n<\/turn_materials>/)[1];
    assert.equal(block.split('User materials are the primary basis when relevant.').length, 2);
    assert.doesNotMatch(block, /Do not|Never|Ask about|general knowledge|one short line|guessing/);
  }
});

test('legacy mode instruction exports are inert without changing tool eligibility', () => {
  const { CHAT_MODE_INSTRUCTIONS, chatSystemInstruction, chatModeTools } = require('../lib/core/chat-modes.ts');
  for (const mode of ['auto', 'fast', 'teacher']) {
    assert.equal(CHAT_MODE_INSTRUCTIONS[mode], '');
    assert.equal(chatSystemInstruction(mode), '');
    assert.equal(chatSystemInstruction(mode, 'Context'), 'Context');
  }
  assert.ok(chatModeTools('teacher').includes('start_path'));
  assert.ok(!chatModeTools('auto').includes('start_path'));
  assert.ok(!chatModeTools('fast').includes('start_path'));
});
