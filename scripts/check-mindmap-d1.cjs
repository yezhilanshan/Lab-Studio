const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { Miniflare } = require('miniflare');

async function main() {
    const mf = new Miniflare({ modules: true, script: 'export default { fetch: () => new Response() }', d1Databases: ['DB'] });
    try {
        const db = await mf.getD1Database('DB');
        await db.exec('CREATE TABLE records (id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, updated TEXT NOT NULL);');
        const env = { DB: db };
        const modules = new Map();
        function load(file) {
            let source = path.resolve(file);
            if (fs.existsSync(source) && fs.statSync(source).isDirectory()) source = path.join(source, 'index.ts');
            if (!fs.existsSync(source)) source += '.ts';
            if (source.endsWith('.json')) return source.endsWith('tree-seed.json') ? [] : JSON.parse(fs.readFileSync(source, 'utf8'));
            if (modules.has(source)) return modules.get(source);
            const exports = {};
            modules.set(source, exports);
            const code = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
                compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
            }).outputText;
            new Function('exports', 'require', code)(exports, name =>
                name === 'cloudflare:workers' ? { env } : name.startsWith('.') ? load(path.resolve(path.dirname(source), name)) : require(name));
            return exports;
        }
        const { POST, GET } = load('app/api/records/route.ts');
        const url = 'http://qa.local/api/records';
        const post = body => POST(new Request(url, { method: 'POST', body: JSON.stringify(body) }));
        const sync = (items, expected) => post({ mindmapSync: true, items, expected });
        const node = (id, parent) => ({ id, parent, title: id, kind: 'node', idea: 'idea1', notes: '' });
        const root = node('root', ''), a = node('a', 'root'), b = node('b', 'root');
        const initial = await post([root, a, b]);
        assert.equal(initial.status, 200, await initial.text());
        const read = async () => (await GET(new Request(url + '?mindmapSync=1'))).json();
        const readRecord = async id => (await read()).records.find(r => r.id === id);
        const changed = { ...a, title: 'local title' };
        assert.equal((await post([{ ...a, notes: 'remote note' }])).status, 200);
        assert.equal((await sync([changed], [a])).status, 200);
        assert.equal((await readRecord('a')).notes, 'remote note');
        const revision = (await read()).revisions.a;
        assert.equal((await sync([changed], [a])).status, 200);
        assert.equal((await read()).revisions.a, revision);
        assert.equal((await sync([{ ...a, title: 'stale overwrite' }], [a])).status, 409);

        // Inject a competing write after validation and before D1 starts its atomic batch.
        const beforeA = await readRecord('a');
        const beforeB = await readRecord('b');
        env.DB = {
            prepare: db.prepare.bind(db),
            batch: async statements => {
                await db.prepare('UPDATE records SET updated = ? WHERE id = ?').bind('raced', 'b').run();
                return db.batch(statements);
            },
        };
        const raced = await sync([{ ...beforeA, title: 'must rollback A' }, { ...beforeB, title: 'must rollback B' }], [beforeA, beforeB]);
        assert.equal(raced.status, 409, await raced.text());
        assert.deepEqual(await readRecord('a'), beforeA);
        assert.deepEqual(await readRecord('b'), beforeB);

        // A new node must not replace an unrelated record that acquired its ID during validation.
        env.DB = {
            prepare: db.prepare.bind(db),
            batch: async statements => {
                const paper = { id: 'new-id', kind: 'paper', title: 'Keep this paper' };
                await db.prepare('INSERT INTO records (id, kind, data, updated) VALUES (?, ?, ?, ?)').bind(paper.id, paper.kind, JSON.stringify(paper), 'raced-paper').run();
                return db.batch(statements);
            },
        };
        assert.equal((await sync([node('new-id', 'root')], [])).status, 409);
        assert.equal((await readRecord('new-id')).kind, 'paper');
        console.log('D1 sync passed: idempotent retry, concurrent field preservation, stale revision rejection and atomic rollback.');
    } finally {
        await mf.dispose();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
