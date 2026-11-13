import treeSeed from '../../tree-seed.json';
import { env } from 'cloudflare:workers';
import { validateTree } from '../../../lib/tree-validation';
import { prepareRecordWrites } from '../../../lib/structured-mindmap';
import { getDb } from '../../../db';
import { records } from '../../../db/schema';
import { isOwnerRequest } from '../../../lib/api-auth';

export const dynamic = 'force-dynamic';
const kinds = ['paper', 'scheme', 'experiment', 'sync', 'weekly', 'method', 'node', 'document', 'mindmap'];
type IncomingRecord = { id: string; kind: string; title?: string; deleted?: boolean; [key: string]: unknown };

function isRecord(x: IncomingRecord) {
    return Boolean(x && typeof x === 'object' && typeof x.id === 'string' && x.id.length <= 150 && kinds.includes(x.kind) &&
        (x.deleted || (typeof x.title === 'string' && x.title.trim() && x.title.length <= 500)) &&
        Object.values(x).every(v => typeof v === 'string' || typeof v === 'boolean'));
}

export async function GET(req: Request) {
    if (!isOwnerRequest(req)) return Response.json({ error: '未授权访问，请登录后重试。' }, { status: 401 });
    try {
        const rows = await getDb().select().from(records);
        const data = rows.map(r => JSON.parse(r.data));
        const result = new URL(req.url).searchParams.has('mindmapSync')
            ? { records: data, revisions: Object.fromEntries(rows.filter(r => r.kind === 'node').map(r => [r.id, r.updated])) }
            : data;
        return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
        return Response.json({ error: '暂时无法读取记录，请稍后重试。' }, { status: 503 });
    }
}

export async function POST(req: Request) {
    if (!isOwnerRequest(req)) return Response.json({ error: '未授权访问，请登录后重试。' }, { status: 401 });
    try {
        const raw = await req.text();
        if (raw.length > 2000000) return Response.json({ error: '文件过大' }, { status: 413 });
        const input = JSON.parse(raw);
        const guarded = input?.mindmapSync === true;
        let items = (guarded ? input.items : Array.isArray(input) ? input : [input]) as IncomingRecord[];
        const expected = guarded ? input.expected as IncomingRecord[] : [];
        if (!Array.isArray(items) || items.length < 1 || items.length > 500 || items.some(x => !isRecord(x)) ||
            (guarded && (!Array.isArray(expected) || expected.length > items.length || expected.some(x => !isRecord(x) || x.kind !== 'node') ||
                items.some(x => x.kind !== 'node'))))
            return Response.json({ error: '记录格式不正确，请检查标题和字段。' }, { status: 400 });

        const db = getDb(), treeEdit = items.some(x => x.kind === 'node');
        const saved = treeEdit ? await db.select().from(records) : [];
        const previous = new Map(saved.map(x => [x.id, x]));
        if (treeEdit) {
            const merged = new Map<string, IncomingRecord>((treeSeed as IncomingRecord[]).map(x => [x.id, x]));
            saved.forEach(x => merged.set(x.id, JSON.parse(x.data)));
            if (guarded) {
                try {
                    items = prepareRecordWrites(items, expected, [...merged.values()]);
                } catch (error) {
                    return Response.json({ error: (error as Error).message }, { status: 409 });
                }
            }
            items.forEach(x => merged.set(x.id, x));
            const error = validateTree([...merged.values()]);
            if (error) return Response.json({ error }, { status: 400 });
        }
        const writes = guarded ? items.filter(x => previous.get(x.id)?.data !== JSON.stringify(x)) : items;
        if (writes.length) {
            // Every mutation gets its own revision, including simultaneous writes in the same millisecond.
            const updated = new Date().toISOString() + '/' + crypto.randomUUID();
            const statements = writes.map(x => db.insert(records)
                .values({ id: x.id, kind: x.kind, data: JSON.stringify(x), updated })
                .onConflictDoUpdate({ target: records.id, set: { kind: x.kind, data: JSON.stringify(x), updated } }));
            if (treeEdit) {
                const d1 = env.DB;
                if (!d1) throw Error('D1 is unavailable');
                const ledger = JSON.stringify(Object.fromEntries(saved.filter(x => x.kind === 'node').map(x => [x.id, x.updated])));
                const writeRevisions = JSON.stringify(Object.fromEntries(writes.map(x => [x.id, previous.get(x.id)?.updated ?? null])));
                // A failed assertion aborts the same D1 batch before any row can be written.
                const assertion = d1.prepare(`
                    INSERT INTO records (id, kind, data, updated)
                    SELECT '', 'node', NULL, ''
                    WHERE (SELECT count(*) FROM records WHERE kind = 'node') <> (SELECT count(*) FROM json_each(?1))
                       OR EXISTS (
                           SELECT 1 FROM json_each(?1) AS expected
                           LEFT JOIN records AS current ON current.id = expected.key AND current.kind = 'node'
                           WHERE current.updated IS NOT expected.value
                       )
                       OR EXISTS (
                           SELECT 1 FROM json_each(?2) AS expected
                           LEFT JOIN records AS current ON current.id = expected.key
                           WHERE current.updated IS NOT expected.value
                       )
                `).bind(ledger, writeRevisions);
                try {
                    await d1.batch([assertion, ...statements.map(q => { const { sql, params } = q.toSQL(); return d1.prepare(sql).bind(...params); })]);
                } catch (error) {
                    if (String(error).includes('NOT NULL constraint failed: records.data'))
                        return Response.json({ error: '实验记录在提交时发生修改，请重新预览。' }, { status: 409 });
                    throw error;
                }
            } else {
                await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
            }
        }
        return Response.json(guarded ? { ok: true, records: items } : { ok: true });
    } catch {
        return Response.json({ error: '保存失败，请检查连接后重试。' }, { status: 500 });
    }
}
