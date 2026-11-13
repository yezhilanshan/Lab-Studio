'use client';
import { useRef, useState, useEffect, lazy, Suspense } from 'react';
import type { RecordItem } from './data';
const Canvas = lazy(() => import('./mindmap-canvas').then(m => ({ default: m.MindmapCanvas })));
type Props = {
    records: RecordItem[];
    persist: (items: RecordItem[]) => Promise<boolean>;
};
export function MindmapWorkspace({ records, persist }: Props) {
    const [selected, setSelected] = useState<string | null>(() => typeof window !== 'undefined' ? sessionStorage.getItem('seer-open-mindmap') : null), [query, setQuery] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
    const file = useRef<HTMLInputElement>(null), initial = useRef<any>(null);
    useEffect(() => { const open = (e: Event) => { const id = (e as CustomEvent<string>).detail; initial.current = null; setSelected(id); sessionStorage.removeItem('seer-open-mindmap'); }; window.addEventListener('seer-open-mindmap', open); sessionStorage.removeItem('seer-open-mindmap'); return () => window.removeEventListener('seer-open-mindmap', open); }, []);
    const maps = records.filter(r => r.kind === 'mindmap' && !r.deleted), record = maps.find(r => r.id === selected);
    async function create(title = '未命名主题', scene?: any) { setBusy(true); const r: RecordItem = { id: crypto.randomUUID(), kind: 'mindmap', title, updatedAt: new Date().toISOString() }; if (await persist([r])) {
        initial.current = scene;
        setSelected(r.id);
    }
    else
        setMessage('创建失败，请恢复连接后重试'); setBusy(false); }
    if (record)
        return <Suspense fallback={<p>加载思维导图编辑器…</p>}><Canvas key={record.id} record={record} persist={persist} maps={maps} nodes={record.sourceIdea ? records.filter(r => r.kind === 'node' && r.idea === record.sourceIdea && !r.deleted) : undefined} initial={initial.current} onBack={() => { initial.current = null; setSelected(null); }}/></Suspense>;
    return <div className="map-workspace"><div className="maps-heading"><div><span>IDEAS, CONNECTED</span><h2>把想法展开成一张图</h2><p>为一个主题建立独立画布，自由组织概念、证据和研究计划。</p></div><button className="primary" disabled={busy} onClick={() => create()}>＋ 新建思维导图</button></div><div className="maps-toolbar"><input aria-label="搜索思维导图" placeholder="搜索主题…" value={query} onChange={e => setQuery(e.target.value)}/><button onClick={() => file.current?.click()}>导入 .excalidraw</button><span>{maps.length} 张导图</span><input ref={file} hidden type="file" accept=".json,.excalidraw" onChange={async (e) => { try {
        const f = e.target.files?.[0];
        if (!f)
            return;
        if (f.size > 20 * 1024 * 1024)
            throw Error('文件不能超过20MB');
        const scene = JSON.parse(await f.text());
        const { validateScene } = await import('../lib/mindmap-scene');
        const error = validateScene(scene);
        if (error)
            throw Error(error);
        await create(f.name.replace(/\.(excalidraw|json)$/i, ''), scene);
    }
    catch (err) {
        setMessage((err as Error).message);
    }
    finally {
        if (file.current)
            file.current.value = '';
    } }}/></div>{message && <p role="alert">{message}</p>}<div className="maps-grid"><button className="new-map-tile" onClick={() => create()} disabled={busy}><strong>＋</strong><span>新建主题画布</span><small>主题 · 联系 · 分组 · 笔记</small></button>{maps.filter(r => !query || r.title.includes(query)).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))).map(r => <article key={r.id} className="map-tile"><button className="map-open" onClick={() => { initial.current = null; setSelected(r.id); }}><div className="map-thumbnail"><i /><i /><i /><i /><span>◎</span></div><small>{r.sourceIdea ? '研究推进 · 实验导图' : '独立主题'}</small><h3>{r.title}</h3><p>{String(r.updatedAt || '').slice(0, 16).replace('T', ' ') || '尚未保存画布'}</p></button><div className="map-tile-actions"><button onClick={async () => { const title = prompt('导图名称', r.title); if (title?.trim())
        await persist([{ ...r, title: title.trim() }]); }}>重命名</button><button onClick={async () => { const copy = { ...r, id: crypto.randomUUID(), title: r.title + ' · 副本', sourceIdea: '', updatedAt: new Date().toISOString() }; await persist([copy]); }}>复制</button><button onClick={async () => { if (confirm('从导图库移除这张图？实验原始记录不受影响。'))
        await persist([{ ...r, deleted: true }]); }}>移除</button></div></article>)}</div></div>;
}
export function ExperimentCanvas({ records, persist, idea, nodes, onOpenEvidence, focusRecordId }: {
    idea: {
        id: string;
        name: string;
    };
    nodes: RecordItem[];
    onOpenEvidence?: (nodeId: string) => void;
    focusRecordId?: string;
} & Props) {
    const id = 'research-map-' + idea.id, record = records.find(r => r.id === id && !r.deleted) || { id, kind: 'mindmap', title: idea.name + ' · 实验思维导图', sourceIdea: idea.id };
    return <Suspense fallback={<p>加载实验画布…</p>}><Canvas key={id} record={record} persist={persist} maps={records.filter(r => r.kind === 'mindmap' && !r.deleted)} nodes={nodes} onOpenEvidence={onOpenEvidence} focusRecordId={focusRecordId}/></Suspense>;
}
