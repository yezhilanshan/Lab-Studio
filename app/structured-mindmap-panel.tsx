'use client';
import { useState } from 'react';
import type { Topic, SyncChange } from '../lib/structured-mindmap';
import type { useStructuredMindmap } from './use-structured-mindmap';
type Controller = ReturnType<typeof useStructuredMindmap>;
const fieldNames: Record<string, string> = { title: '标题', parent: '父节点', status: '状态', notes: '笔记 / 结果', next: '下一步', evidence: '证据', new: '新增节点', missing: '失效关联' };
export function StructuredPanel({ controller: c }: {
    controller: Controller;
}) {
    const [search, setSearch] = useState('');
    const current = c.model.find(n => n.id === c.selected), byId = new Map(c.model.map(n => [n.id, n]));
    const ancestors = new Set<string>();
    for (const n of c.model.filter(n => !search || n.title.toLowerCase().includes(search.toLowerCase()))) {
        let id: string | null = n.id;
        while (id && !ancestors.has(id)) {
            ancestors.add(id);
            id = byId.get(id)?.parentId || null;
        }
    }
    function branch(parent: string | null, depth = 0): React.ReactNode { return c.model.filter(n => n.parentId === parent && (!search || ancestors.has(n.id))).map(n => { const children = c.model.filter(x => x.parentId === n.id); return <li key={n.id} role="treeitem" aria-level={depth + 1} aria-expanded={children.length ? !n.collapsed : undefined} aria-selected={c.selected === n.id}><div className={'topic-row' + (c.selected === n.id ? ' selected' : '')} style={{ paddingLeft: 12 + depth * 14 }}><button className="topic-fold" aria-label={(n.collapsed ? '展开主题：' : '折叠主题：') + n.title} disabled={!children.length} onClick={() => c.fold(n.id)}>{children.length ? n.collapsed ? '▸' : '▾' : '·'}</button><button className="topic-title" onClick={() => c.choose(n.id)} title={n.title}>{n.title}</button>{n.recordId && <i title={n.missing ? '关联记录已移除' : '关联实验记录'}>{n.missing ? '!' : '↗'}</i>}</div>{children.length && (!n.collapsed || search) ? <ul role="group">{branch(n.id, depth + 1)}</ul> : null}</li>; }); }
    return <aside className="topic-panel"><div className="topic-panel-head"><strong>主题大纲</strong><span>{c.model.length} 个主题</span></div><input aria-label="搜索导图主题" placeholder="搜索主题…" value={search} onChange={e => setSearch(e.target.value)}/><div className="topic-outline"><ul role="tree" aria-label="思维导图大纲">{branch(null)}</ul>{!c.model.length && <p>添加一个主题开始整理想法。</p>}</div>{current && <TopicFields key={JSON.stringify([current.id, current.title, current.status, current.parentId, current.notes, current.next, current.evidence])} topic={current} model={c.model} edit={p => c.edit(current.id, p)} remove={() => c.remove(current.id)}/>}</aside>;
}
function TopicFields({ topic: n, model, edit, remove }: {
    topic: Topic;
    model: Topic[];
    edit: (p: Partial<Topic>) => void;
    remove: () => void;
}) {
    const descendants = new Set<string>([n.id]);
    let size = -1;
    while (size !== descendants.size) {
        size = descendants.size;
        model.forEach(x => { if (x.parentId && descendants.has(x.parentId))
            descendants.add(x.id); });
    }
    return <section className="topic-inspector"><h3>所选主题</h3><label>标题<input aria-label="所选主题标题" defaultValue={n.title} onBlur={e => { if (e.target.value.trim() && e.target.value !== n.title)
        edit({ title: e.target.value.trim() }); }} onKeyDown={e => { if (e.key === 'Enter')
        e.currentTarget.blur(); }}/></label><label>父主题<select aria-label="所选主题父级" value={n.parentId || ''} disabled={n.recordId?.startsWith('root-')} onChange={e => edit({ parentId: e.target.value || null })}><option value="">独立根主题</option>{model.filter(x => !descendants.has(x.id)).map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label><label>状态<select aria-label="所选主题状态" value={n.status || '计划中'} onChange={e => edit({ status: e.target.value })}>{[...new Set([n.status, '计划中', '进行中', '已实验', '已完成', '暂停', '待确认', '阶段'])].filter(Boolean).map(s => <option key={s}>{s}</option>)}</select></label>{(['notes', 'next', 'evidence'] as const).map(f => <label key={f}>{fieldNames[f]}<textarea aria-label={'主题' + fieldNames[f]} rows={2} defaultValue={n[f]} onBlur={e => { if (e.target.value !== n[f])
        edit({ [f]: e.target.value }); }}/></label>)}{n.recordId && <p className={n.missing ? 'topic-link missing' : 'topic-link'}>{n.missing ? '关联记录已移除，图中内容仍保留' : '已关联实验记录'}<code>{n.recordId}</code></p>}<button className="topic-delete" onClick={() => { if (confirm('删除此主题及其全部子主题？可用撤销恢复；不会删除实验记录。'))
        remove(); }}>删除整条分支</button></section>;
}
export function SyncPreview({ controller: c }: {
    controller: Controller;
}) {
    const sync = c.sync!;
    const [choices, setChoices] = useState<Record<string, 'canvas' | 'record'>>({});
    const counts = { added: 0, updated: 0, conflicts: 0, missing: 0 };
    for (const c of sync.changes) {
        if (c.field === 'new') counts.added++;
        else if (c.field === 'missing') counts.missing++;
        else if (c.conflict) counts.conflicts++;
        else counts.updated++;
    }
    return <div className="mindmap-sync-backdrop" role="presentation"><section className="mindmap-sync-dialog" role="dialog" aria-modal="true" aria-label="实验同步差异预览"><header><div><h2>{sync.direction === 'pull' ? '从实验记录同步到画布' : '将画布更新写入实验记录'}</h2><p>保留手工位置、样式和折叠状态。冲突字段逐项选择；图中删除不自动删除实验记录。</p><small title={sync.snapshotId}>预览快照 {sync.snapshotId.slice(0, 8)}</small></div><button aria-label="关闭同步预览" disabled={c.syncBusy} onClick={c.closeSync}>×</button></header><div className="sync-change-list">{!sync.changes.length ? <p>双方内容一致，无需同步。</p> : sync.changes.map(change => <ChangeRow key={change.key} change={change} title={c.model.find(n => n.id === change.topicId)?.title || change.remote} choice={choices[change.key] || (change.conflict ? '' : sync.direction === 'pull' ? 'record' : 'canvas')} onChange={value => setChoices(x => ({ ...x, [change.key]: value }))}/>)}</div>{c.syncError && <p className="sync-error" role="alert">{c.syncError}</p>}<footer><span>新增 {counts.added} · 更新 {counts.updated} · 冲突 {counts.conflicts} · 失效 {counts.missing}</span><button disabled={c.syncBusy} onClick={c.closeSync}>取消</button><button className="primary" disabled={c.syncBusy || !sync.changes.length || sync.changes.some(change => change.conflict && !choices[change.key])} onClick={() => void c.applySync(choices)}>{c.syncBusy ? '同步中…' : '应用所选变更'}</button></footer></section></div>;
}
function ChangeRow({ change: c, title, choice, onChange }: {
    change: SyncChange;
    title: string;
    choice: string;
    onChange: (s: 'canvas' | 'record') => void;
}) { return <article className={'sync-change' + (c.conflict ? ' conflict' : '')}><div><strong>{title}</strong><span>{fieldNames[c.field]} {c.conflict ? '· 双方均有修改' : ''}</span></div>{c.field === 'new' ? <p>{c.direction === 'pull' ? '补入新实验，保留已有布局' : '新建对应实验记录并建立关联'}</p> : c.field === 'missing' ? <p>保留画布内容并标记失效关联，不自动删除。</p> : <><dl><div><dt>画布</dt><dd>{c.canvas || '（空）'}</dd></div><div><dt>实验记录</dt><dd>{c.remote || '（空）'}</dd></div></dl><select aria-label={title + ' ' + fieldNames[c.field] + ' 同步选择'} value={choice} onChange={e => onChange(e.target.value as 'canvas' | 'record')}>{c.conflict && <option value="" disabled>请选择此冲突字段</option>}<option value="canvas">保留画布值{c.direction === 'push' ? '，写入记录' : ''}</option><option value="record">采用实验记录值</option></select></>}</article>; }
