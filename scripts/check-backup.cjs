const ts = require('typescript'), fs = require('node:fs'), assert = require('node:assert/strict');
function moduleFrom(path) {
  const out = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('exports', 'require', out)(exports, require);
  return exports;
}
const B = moduleFrom('lib/backup.ts');

// Server-side limits from app/api/records/route.ts: 500 items and 2,000,000 UTF-16 units per POST.
const MAX_ITEMS = 500, MAX_CHARS = 2000000;
const paper = (id, chars) => ({ id, kind: 'paper', title: '论文 ' + id, text: '中'.repeat(chars) });
const record = (id) => ({ id, kind: 'weekly', title: '周报 ' + id });

// --- parseBackup: the reported bug is that a self-exported backup is rejected ---
const baseline = [
  ...JSON.parse(fs.readFileSync('app/tree-seed.json', 'utf8')),
  ...JSON.parse(fs.readFileSync('app/literature-seed.json', 'utf8')),
  ...JSON.parse(fs.readFileSync('app/local-records.json', 'utf8')),
  ...JSON.parse(fs.readFileSync('app/local-catalog.json', 'utf8')),
];
const withUploads = [...baseline, paper('up-1', 250000), paper('up-2', 250000)];
const exported = B.serializeBackup(withUploads, {});
assert.ok(Buffer.byteLength(exported, 'utf8') > 2000000, 'fixture must exceed the old 2 MB import cap');
const parsed = B.parseBackup(exported);
assert.equal(parsed.records.length, withUploads.length, 'a backup larger than 2 MB must still import');
assert.equal(parsed.records.at(-1).id, 'up-2');

// --- version 1 backups (records only) must keep importing ---
const v1 = JSON.stringify({ version: 1, exportedAt: '2026-11-12T00:00:00.000Z', records: [record('a')] });
assert.equal(B.parseBackup(v1).records.length, 1);
assert.deepEqual(B.parseBackup(v1).scenes, {});

// --- validation must match the server, which rejects blank titles ---
assert.throws(() => B.parseBackup(JSON.stringify({ version: 2, records: [{ id: 'x', kind: 'weekly', title: '   ' }] })), /标题/);
assert.throws(() => B.parseBackup(JSON.stringify({ version: 2, records: [{ id: 'x', kind: 'nope', title: 't' }] })), /类型/);
assert.throws(() => B.parseBackup(JSON.stringify({ version: 2, records: [record('a'), record('a')] })), /重复/);
assert.throws(() => B.parseBackup(JSON.stringify({ version: 2, records: [{ id: 'x', kind: 'weekly', title: 't', nested: { a: 1 } }] })), /字段/);
assert.throws(() => B.parseBackup(JSON.stringify({ version: 9, records: [record('a')] })), /版本/);
assert.throws(() => B.parseBackup('{not json'), /解析/);
// A deleted record needs no title, exactly like the server's isRecord.
assert.equal(B.parseBackup(JSON.stringify({ version: 2, records: [{ id: 'x', kind: 'weekly', deleted: true }] })).records.length, 1);

// --- chunkRecords: every chunk must be a request the server accepts ---
const many = Array.from({ length: 1200 }, (_, i) => record('r' + i));
const chunks = B.chunkRecords(many);
assert.ok(chunks.length >= 3, '1200 records need at least 3 requests');
assert.deepEqual(chunks.flat(), many, 'chunking must preserve order and lose nothing');
for (const chunk of chunks) {
  assert.ok(chunk.length >= 1 && chunk.length <= MAX_ITEMS, 'chunk item count within server limit');
  assert.ok(JSON.stringify(chunk).length <= MAX_CHARS, 'chunk body within server limit');
}

// Chinese full text is what actually blows the byte budget.
const heavy = Array.from({ length: 12 }, (_, i) => paper('h' + i, 250000));
const heavyChunks = B.chunkRecords(heavy);
assert.ok(heavyChunks.length > 1, 'heavy records must split by size, not only by count');
assert.deepEqual(heavyChunks.flat(), heavy);
for (const chunk of heavyChunks) assert.ok(JSON.stringify(chunk).length <= MAX_CHARS);
assert.deepEqual(B.chunkRecords([]), []);

// A single record too large for one request must fail loudly, not be silently dropped.
assert.throws(() => B.chunkRecords([paper('huge', MAX_CHARS)]), /过大/);

// --- scenes travel with the backup ---
const scene = { elements: [{ id: 'e1', type: 'rectangle' }], files: {}, appState: {} };
const withScene = B.serializeBackup([{ id: 'm1', kind: 'mindmap', title: '导图', sceneKey: 'mindmaps/old.json' }], { 'mindmaps/old.json': scene });
const restored = B.parseBackup(withScene);
assert.deepEqual(restored.scenes['mindmaps/old.json'], scene, 'canvas body must survive the round trip');

// --- chunked import must not break the server's whole-tree validation ---
// app/api/records/route.ts validates treeSeed + saved + incoming on every node write,
// so a child arriving before its parent in an earlier chunk is rejected with 400.
const { validateTree } = moduleFrom('lib/tree-validation.ts');
const treeSeed = JSON.parse(fs.readFileSync('app/tree-seed.json', 'utf8'));
const root = treeSeed.find(n => n.kind === 'node' && !n.parent && n.idea === 'idea1');
assert.ok(root, 'fixture needs the idea1 root from tree-seed');
const chain = Array.from({ length: 1200 }, (_, i) => ({
  id: 'n' + i, kind: 'node', title: '节点 ' + i, idea: 'idea1', parent: i === 0 ? root.id : 'n' + (i - 1),
}));
const ordered = B.orderRecordsForImport([...chain].reverse());
assert.deepEqual(ordered.map(n => n.id), chain.map(n => n.id), 'parents must precede children');
let db = [...treeSeed];
const nodeChunks = B.chunkRecords(ordered);
assert.ok(nodeChunks.length >= 3, 'fixture must span several requests');
for (const chunk of nodeChunks) {
  const merged = new Map(db.map(x => [x.id, x]));
  chunk.forEach(x => merged.set(x.id, x));
  assert.equal(validateTree([...merged.values()]), '', 'each chunk must validate against already-imported records');
  db = [...merged.values()];
}
// A cycle must not hang the ordering pass; the server still rejects it.
const cyclic = [{ id: 'a', kind: 'node', title: 'A', idea: 'idea1', parent: 'b' }, { id: 'b', kind: 'node', title: 'B', idea: 'idea1', parent: 'a' }];
assert.equal(B.orderRecordsForImport(cyclic).length, 2);
// Non-node records are left alone.
const mixed = [record('w1'), { id: 'n1', kind: 'node', title: 'N', idea: 'idea1', parent: root.id }, record('w2')];
assert.deepEqual(B.orderRecordsForImport(mixed).map(r => r.id), ['w1', 'n1', 'w2']);

console.log('Backup verified: >2MB self-export reimports, version 1 compatibility, server-aligned validation, request chunking by count and bytes, parent-before-child ordering, canvas round trip.');