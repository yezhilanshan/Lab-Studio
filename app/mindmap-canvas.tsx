'use client';
import { useEffect, useRef, useState } from 'react';
import type { RecordItem } from './data';
import { readMindmapDraft, sceneFingerprint, validateScene, type CanvasScene, type MindmapDraft } from '../lib/mindmap-scene';
import { useStructuredMindmap } from './use-structured-mindmap';
import { SyncPreview } from './structured-mindmap-panel';
import './structured-mindmap.css';
import { buildMindmap } from '../lib/mindmap-layout';
import { BRANCH_COLORS, layoutTopics, reconnect, topics } from '../lib/structured-mindmap';
import './mindmaps.css';
import { SimpleMindmapEditor } from './simple-mindmap-editor';
type Props = {
    record: RecordItem;
    persist: (r: RecordItem[], sync?: { expected: RecordItem[] }) => Promise<boolean>;
    nodes?: RecordItem[];
    onBack?: () => void;
    initial?: CanvasScene;
    maps?: RecordItem[];
    onOpenEvidence?: (nodeId: string) => void;
    focusRecordId?: string;
};
function skeletons(title: string, nodes?: RecordItem[]) {
    if (!nodes?.length)
        return [{ id: 'topic', type: 'rectangle', x: 200, y: 180, width: 280, height: 90, backgroundColor: '#e9f1eb', fillStyle: 'solid', roughness: 0, label: { text: title, fontSize: 24, fontFamily: 2 } }];
    const root = nodes.find(n => !n.parent)!.id, g = buildMindmap(nodes, root, new Set(), '全部状态');
    return [...g.nodes.map(n => { const r = nodes.find(r => r.id === n.id)!; return { id: n.id, type: 'rectangle', x: n.x, y: n.y, width: 290, height: 100, strokeColor: n.depth ? BRANCH_COLORS[n.branch % BRANCH_COLORS.length] : '#41586b', backgroundColor: n.depth ? '#ffffff' : '#e9f1eb', fillStyle: 'solid', roughness: 0, strokeWidth: 1.5, roundness: { type: 3 }, label: { text: (n.depth ? r.title : title) + '\n' + (r.status || ''), fontSize: n.depth ? 16 : 20, fontFamily: 2 }, customData: { researchNodeId: r.id, status: r.status, notes: r.notes, evidence: r.evidence } }; }), ...g.edges.map(e => ({ type: 'arrow', id: 'edge-' + e.to, x: 0, y: 0, strokeColor: BRANCH_COLORS[e.branch % BRANCH_COLORS.length], roughness: 0, start: { id: e.from }, end: { id: e.to }, endArrowhead: null }))];
}
function draftTransaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
    return new Promise<T>((resolve, reject) => {
        const open = indexedDB.open('seer-mindmap-drafts', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('drafts');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result, tx = db.transaction('drafts', mode), request = run(tx.objectStore('drafts'));
            tx.oncomplete = () => { db.close(); resolve(request.result); };
            tx.onabort = () => { db.close(); reject(tx.error || request.error); };
        };
    });
}
function clearDraft(id: string, revision: string) {
    void draftTransaction('readwrite', store => {
        const request = store.get(id);
        request.onsuccess = () => { if (request.result?.revision === revision) store.delete(id); };
        return request;
    }).catch(() => {});
}
function download(data: Blob, name: string) { const url = URL.createObjectURL(data), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function MindmapCanvas({ record, persist, nodes, onBack, initial, maps = [], onOpenEvidence, focusRecordId }: Props) {
    const [sdk, setSdk] = useState<any>(null), [title, setTitle] = useState(record.title), [status, setStatus] = useState('加载画布…'), [error, setError] = useState(''), [ready, setReady] = useState(false), [focus, setFocus] = useState(false);
    const api = useRef<any>(null), scene = useRef<CanvasScene | null>(null), saved = useRef(''), latest = useRef({ record, persist, title }), timer = useRef<ReturnType<typeof setTimeout> | null>(null), saving = useRef(false), pending = useRef(false), alive = useRef(true), file = useRef<HTMLInputElement>(null);
    const journal = useRef<{ draft: MindmapDraft | null; writing: boolean }>({ draft: null, writing: false });
    latest.current = { record, persist, title };
    const draftRevision = useRef('');
    function journalDraft(next: CanvasScene, currentTitle = latest.current.title) {
        const draft = { scene: next, title: currentTitle, revision: crypto.randomUUID() };
        draftRevision.current = draft.revision;
        journal.current.draft = draft;
        async function flush() {
            if (journal.current.writing || !journal.current.draft) return;
            journal.current.writing = true;
            try {
                while (journal.current.draft) {
                    const snapshot = journal.current.draft;
                    journal.current.draft = null;
                    await draftTransaction('readwrite', store => store.put(snapshot, record.id));
                    if (snapshot.revision === draftRevision.current && saved.current === sceneFingerprint(snapshot.scene) + '|' + snapshot.title)
                        clearDraft(record.id, snapshot.revision);
                }
            } catch {
                if (alive.current) setError('本机草稿空间不足，请导出备份');
            } finally {
                journal.current.writing = false;
                if (journal.current.draft) void flush();
            }
        }
        void flush();
    }
    function schedule(next: CanvasScene) {
        scene.current = next;
        setStatus('未保存');
        journalDraft(next);
        if (timer.current)
            clearTimeout(timer.current);
        timer.current = setTimeout(() => void saveRef.current(), 1400);
    }
    const mm = useStructuredMindmap({ keyboard: false, api, sdk, scene, onCommit: schedule, record, records: nodes, persist, error: setError });
    const saveRef = useRef<() => Promise<void>>(async () => { });
    saveRef.current = async () => {
        if (!scene.current)
            return;
        if (saving.current) {
            pending.current = true;
            return;
        }
        const snapshot = scene.current, snapshotTitle = latest.current.title, revision = draftRevision.current;
        const fp = sceneFingerprint(snapshot) + '|' + snapshotTitle;
        if (saved.current === fp) {
            setStatus('已保存');
            return;
        }
        saving.current = true;
        setStatus('保存中…');
        try {
            const res = await fetch('/api/mindmap-scenes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot) });
            const body = await res.json() as {
                key: string;
                error?: string;
            };
            if (!res.ok)
                throw Error(body.error);
            const current = latest.current;
            if (!await current.persist([{ ...current.record, title: snapshotTitle, sceneKey: body.key, updatedAt: new Date().toISOString() }]))
                throw Error('画布索引保存失败，草稿仍保留在此设备');
            saved.current = fp;
            const upToDate = scene.current === snapshot && latest.current.title === snapshotTitle;
            if (upToDate && revision) clearDraft(current.record.id, revision);
            if (alive.current) {
                setStatus(upToDate ? '已保存' : '未保存');
                setError('');
            }
        }
        catch (e) {
            if (alive.current) {
                setStatus('未同步');
                setError((e as Error).message);
            }
        }
        finally {
            saving.current = false;
            if (pending.current) {
                pending.current = false;
                void saveRef.current();
            }
        }
    };
    useEffect(() => {
        alive.current = true;
        let canceled = false;
        (async () => {
            try {
                (window as any).EXCALIDRAW_ASSET_PATH = '/excalidraw-assets/';
                const module = await import('@excalidraw/excalidraw');
                let loaded = initial;
                const local = readMindmapDraft(await draftTransaction('readonly', store => store.get(record.id)).catch(() => undefined), record.title);
                if (!loaded && !local && record.sceneKey) {
                    const res = await fetch('/api/mindmap-scenes?key=' + encodeURIComponent(String(record.sceneKey)));
                    if (!res.ok && !local)
                        throw Error('画布暂时无法读取，未覆盖原保存内容');
                    if (res.ok)
                        loaded = await res.json();
                }
                loaded = local?.scene || loaded;
                if (!loaded) {
                    const base = { elements: module.convertToExcalidrawElements(skeletons(record.title, nodes) as any, { regenerateIds: false }), files: {} };
                    // Large research trees read better as a two-sided map instead of one long right-hand column.
                    loaded = nodes && nodes.length > 8 ? layoutTopics(base, 'balanced') : base;
                }
                // Research trees connect every child from a left/right edge, never from the top or bottom.
                if (nodes && !loaded.appState?.mindmapOrientation)
                    loaded = reconnect({ ...loaded, appState: { ...loaded.appState, mindmapOrientation: 'horizontal' } });
                const err = validateScene(loaded, !local);
                if (err)
                    throw Error(err);
                if (canceled)
                    return;
                const original = loaded;
                loaded = mm.load(loaded);
                scene.current = loaded;
                if (local) {
                    draftRevision.current = local.revision;
                    latest.current.title = local.title;
                    setTitle(local.title);
                    if (!local.revision) journalDraft(loaded, local.title);
                }
                saved.current = record.sceneKey && !local ? sceneFingerprint(original) + '|' + record.title : '';
                setSdk(module);
                setReady(true);
                setTimeout(() => void saveRef.current(), 1800);
                setStatus(local ? '已恢复本机草稿' : record.sceneKey ? '已保存' : '自动保存已就绪');
            }
            catch (e) {
                if (!canceled)
                    setError((e as Error).message);
            }
        })();
        return () => {
            canceled = true;
            alive.current = false;
            if (timer.current)
                clearTimeout(timer.current);
            if (scene.current && sceneFingerprint(scene.current) + '|' + latest.current.title !== saved.current)
                void saveRef.current();
        };
    }, []);
    const skipFit = useRef(Boolean(focusRecordId)), framed = useRef(false);
    useEffect(() => {
        if (!api.current || framed.current)
            return;
        framed.current = true;
        // A reverse jump frames a single node itself; fitting the whole tree afterwards would undo it.
        if (skipFit.current) {
            skipFit.current = false;
            return;
        }
        const id = setTimeout(() => {
            // A linked experiment tree is far too large to read when fitted whole: open on the root at a
            // readable zoom and let the reader follow branches from there.
            const all = scene.current ? topics(scene.current) : [], root = nodes ? all.find(topic => !topic.parentId) : null;
            if (root)
                api.current?.focus(root.id, 0.6);
            else
                api.current?.scrollToContent(undefined, { fitToContent: true, viewportZoomFactor: 0.72 });
        }, 150);
        return () => clearTimeout(id);
    }, [focus, ready]);
    async function exportFile(svg = false) {
        try {
            if (!api.current || !sdk)
                return;
            const content = svg ? api.current.getSvg() : JSON.stringify({ type: 'excalidraw', version: 2, source: 'SEER mindmap', ...scene.current });
            download(new Blob([content], { type: svg ? 'image/svg+xml' : 'application/json' }), title + (svg ? '.svg' : '.excalidraw'));
        }
        catch (e) {
            setError('导出失败：' + (e as Error).message);
        }
    }
    async function importFile(f: File) {
        try {
            if (f.size > 20 * 1024 * 1024)
                throw Error('文件不能超过20MB');
            const next = JSON.parse(await f.text()), err = validateScene(next);
            if (err)
                throw Error(err);
            if (!confirm('用导入文件替换当前画布？当前内容可先导出备份。'))
                return;
            mm.commit(mm.upgrade({ ...next, files: next.files || {} }));
            api.current.scrollToContent(undefined, { fitToContent: true, viewportZoomFactor: 0.72 });
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            if (file.current)
                file.current.value = '';
        }
    }
    async function newMap() {
        const r: RecordItem = { id: crypto.randomUUID(), kind: 'mindmap', title: '未命名主题', updatedAt: new Date().toISOString() };
        await saveRef.current();
        if (await persist([r]))
            openMap(r.id);
    }
    function openMap(id: string) { sessionStorage.setItem('seer-open-mindmap', id); location.hash = 'mindmaps'; window.dispatchEvent(new CustomEvent('seer-open-mindmap', { detail: id })); }
    function adjacent(delta: number) {
        const ordered = maps.filter(r => !r.deleted);
        const index = ordered.findIndex(r => r.id === record.id), next = ordered[index + delta];
        if (next) {
            void saveRef.current().then(() => openMap(next.id));
        }
        else
            setError(delta < 0 ? '已经是第一张画布' : '已经是最后一张画布');
    }
    return <section className={'canvas-studio' + (focus ? ' canvas-focused' : '')}><header className="canvas-titlebar">{onBack && <button onClick={() => { void saveRef.current(); onBack(); }}>← 全部导图</button>}<input aria-label="思维导图标题" value={title} maxLength={500} onChange={e => {
            setTitle(e.target.value);
            latest.current.title = e.target.value;
            if (scene.current) journalDraft(scene.current, e.target.value);
            setStatus('未保存');
            if (timer.current)
                clearTimeout(timer.current);
            timer.current = setTimeout(() => void saveRef.current(), 1400);
        }}/><span role="status">{status}</span><button className="primary" disabled={!ready || !title.trim()} onClick={() => void saveRef.current()}>保存</button><button onClick={() => setFocus(!focus)}>{focus ? '退出专注' : '专注画布'}</button></header>{error && <p className="canvas-error" role="alert">{error}<button onClick={() => setError('')}>关闭</button></p>}{ready && scene.current ? <SimpleMindmapEditor key={record.id} scene={scene} controller={mm} api={api} newMap={() => void newMap()} adjacent={adjacent} linked={!!nodes} idea={nodes ? String(record.sourceIdea || '') : undefined} onOpenEvidence={onOpenEvidence} focusRecordId={focusRecordId} maps={maps} openMap={id => void saveRef.current().then(() => openMap(id))} importFile={() => file.current?.click()} exportFile={v => void exportFile(v)}/> : <p className="map-loading">{error ? '请恢复连接后重新打开画布。' : '正在加载思维导图…'}</p>}<input type="file" ref={file} hidden accept=".excalidraw,.json" onChange={e => {
            if (e.target.files?.[0])
                void importFile(e.target.files[0]);
        }}/>{mm.sync && <SyncPreview key={mm.sync.direction} controller={mm}/>}</section>;
}
