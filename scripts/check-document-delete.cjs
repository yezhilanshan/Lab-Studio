const ts = require('typescript'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');

function resolveTs(base) {
  if (fs.existsSync(base + '.ts')) return base + '.ts';
  if (fs.existsSync(path.join(base, 'index.ts'))) return path.join(base, 'index.ts');
  return base;
}

// env bindings and D1 are Worker runtime surfaces; everything else loads for real.
function loadRoute(mocks) {
  const file = path.resolve('app/api/documents/[id]/route.ts');
  const cache = new Map();
  function load(target) {
    if (cache.has(target)) return cache.get(target);
    const out = ts.transpileModule(fs.readFileSync(target, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const exports = {};
    cache.set(target, exports);
    const req = (name) => {
      if (name.startsWith('.')) {
        const resolved = resolveTs(path.resolve(path.dirname(target), name));
        if (resolved in mocks) return mocks[resolved];
        return load(resolved);
      }
      if (name in mocks) return mocks[name];
      return require(name);
    };
    new Function('exports', 'require', out)(exports, req);
    return exports;
  }
  return load(file);
}

function harness(rows) {
  const ops = [], store = new Map(rows.map(r => [r.id, r]));
  const env = { BUCKET: { async delete(key) { ops.push('r2:' + key); }, async get(key) { ops.push('get:' + key); return null; } } };
  const db = {
    select: () => ({ from: () => ({ where: (cond) => Promise.resolve(store.has(cond.val) ? [store.get(cond.val)] : []) }) }),
    insert: () => ({ values: (v) => ({ onConflictDoUpdate: () => { ops.push('db:' + v.id); store.set(v.id, v); return Promise.resolve(); } }) }),
  };
  const route = loadRoute({
    'cloudflare:workers': { env },
    'drizzle-orm': { eq: (col, val) => ({ col, val }) },
    [resolveTs(path.resolve('db'))]: { getDb: () => db },
    [resolveTs(path.resolve('db/schema'))]: { records: { id: 'id', kind: 'kind', data: 'data', updated: 'updated' } },
  });
  return { route, ops, store };
}

const doc = { id: 'd1', kind: 'document', title: 'paper.pdf', key: 'papers/d1', size: '10', date: '2026-11-12' };
const row = (data) => ({ id: data.id, kind: data.kind, data: JSON.stringify(data), updated: '2026-11-12' });
const call = (route, id, owner = true) => route.DELETE(
  new Request('https://workbench.example/api/documents/' + id, { method: 'DELETE', headers: owner ? { 'oai-authenticated-user-id': 'user-1' } : {} }),
  { params: Promise.resolve({ id }) },
);

(async () => {
  const anon = harness([row(doc)]);
  assert.equal((await call(anon.route, 'd1', false)).status, 401, '非 owner 不得删除');
  assert.deepEqual(anon.ops, [], '未授权时不得触碰存储或数据库');

  const missing = harness([]);
  assert.equal((await call(missing.route, 'nope')).status, 404);
  assert.deepEqual(missing.ops, []);

  const wrongKind = harness([row({ id: 'p1', kind: 'paper', title: '卡片' })]);
  assert.equal((await call(wrongKind.route, 'p1')).status, 404, '只能删除 document 记录');
  assert.deepEqual(wrongKind.ops, []);

  const ok = harness([row(doc)]);
  const res = await call(ok.route, 'd1');
  assert.equal(res.status, 200);
  assert.deepEqual(ok.ops, ['db:d1', 'r2:papers/d1'], '必须先软删记录再清存储，避免留下悬空引用');
  assert.equal(JSON.parse(ok.store.get('d1').data).deleted, true);

  // A record whose key escapes the papers/ prefix must never reach the bucket.
  const evil = harness([row({ ...doc, key: 'mindmaps/secret.json' })]);
  assert.equal((await call(evil.route, 'd1')).status, 200);
  assert.deepEqual(evil.ops, ['db:d1'], '越界 key 不得调用 R2 删除');
  assert.equal(JSON.parse(evil.store.get('d1').data).deleted, true);

  console.log('Document delete verified: owner guard, 404 for missing/non-document, soft-delete before storage cleanup, papers/ prefix enforced.');
})().catch(e => { console.error(e); process.exitCode = 1; });