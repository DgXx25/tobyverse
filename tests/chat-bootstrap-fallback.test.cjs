const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
let owner = 'owner';
let indexOwner = 'owner';
let messageReads = 0;
const snap = (id, data) => ({id, exists: Boolean(data), data: () => data});
function ref(parts) {
  return {
    doc(id) { return ref([...parts, id]); },
    collection(id) { return ref([...parts, id]); },
    async get() {
      if (parts[0] === 'chats') return snap(parts[1], parts[1] === 'nested' ? {projectId:'project', nestedId:'nested', userId:indexOwner} : null);
      if (parts.length === 2) return snap(parts[1], {userId:owner, title:'Project'});
      if (parts.length === 4) return snap(parts[3], {userId:owner});
      messageReads++;
      return {docs:[]};
    },
    orderBy() { return this; }, limit(n) { assert.equal(n, 40); return this; },
  };
}
const load = Module._load;
Module._load = function(request, parent, ...rest) {
  if (request === '@/lib/server/firestore-admin') return {
    verifyAdminIdToken: async (token) => {if (token !== 'valid') throw new Error('invalid'); return {uid:'owner'};},
    getAdminFirestore: () => ({collection: id => ref([id])}),
  };
  return load.call(this, request.startsWith('@/') ? path.join(root,request.slice(2)) : request, parent, ...rest);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,filename);
const { GET } = require('../app/api/projects/bootstrap/route.ts');
function request(query, authenticated=true) {return new Request(`http://localhost/api/projects/bootstrap?${query}`, {headers:authenticated?{Authorization:'Bearer valid'}:{}});}

test('same-origin fallback resolves a canonical project and returns a bounded message page', async () => {
  const response = await GET(request('chatId=project'));
  assert.equal(response.status,200);
  const data = await response.json();
  assert.equal(data.projectId,'project'); assert.equal(data.threadId,'main');
});
test('same-origin fallback resolves an owned nested chat', async () => {
  const data = await (await GET(request('chatId=nested'))).json();
  assert.equal(data.projectId,'project'); assert.equal(data.threadId,'nested');
});
test('fallback denies foreign projects before reading messages', async () => {
  const before = messageReads; owner = 'other';
  try {assert.equal((await GET(request('chatId=project'))).status,403);}
  finally {owner='owner';}
  assert.equal(messageReads,before);
});
test('fallback denies foreign chat indexes and missing authentication', async () => {
  indexOwner='other';
  try {assert.equal((await GET(request('chatId=nested'))).status,404);}
  finally {indexOwner='owner';}
  assert.equal((await GET(request('chatId=project',false))).status,401);
});
test('fallback rejects path traversal', async () => {
  assert.equal((await GET(request('chatId=..'))).status,400);
  assert.equal((await GET(request('chatId=foo%2Fbar'))).status,400);
});
