'use client';
import { useEffect, useRef, useState } from 'react';
import { GitBranch, CornerDownRight, Waypoints, Braces, SquareDashed, Plus, PanelRight, Bold, Italic, Undo2, Redo2, X, Image as ImageIcon, Link as LinkIcon, MessageSquare, StickyNote, Tag, Folder, ChevronDown, MoreHorizontal, Minus, Maximize2, Keyboard, ArrowLeft, ArrowRight, FilePlus2, ArrowUpRight } from 'lucide-react';
import type { MindmapTools, MapView } from './use-mindmap-tools';
import type { CanvasScene } from '../lib/mindmap-scene';
import type { MutableRefObject } from 'react';
import * as A from '../lib/mindmap-actions';
import * as M from '../lib/structured-mindmap';
import { researchNodeIdOf } from '../lib/evidence-link';
type Props = {
    tools: MindmapTools;
    view: MutableRefObject<MapView | null>;
    zoom: number;
    canUndo: boolean;
    canRedo: boolean;
    linked: boolean;
    sync: (direction: 'pull' | 'push') => void;
    importFile: () => void;
    exportFile: (svg?: boolean) => void;
    layout: (direction: 'right' | 'down' | 'balanced') => void;
};
export function MindmapToolbar({ tools: t, view, zoom, canUndo, canRedo, linked, sync, importFile, exportFile, layout }: Props) {
    const [menu, setMenu] = useState(false), root = useRef<HTMLDivElement>(null);
    useEffect(() => { if (!menu)
        return; const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node))
        setMenu(false); }; document.addEventListener('pointerdown', close); return () => document.removeEventListener('pointerdown', close); }, [menu]);
    const act = (fn: () => void) => { setMenu(false); fn(); };
    const main = [{ icon: GitBranch, label: '主题', keys: 'Enter', description: '为选中的主题新增一个同级主题。', command: 'after' }, { icon: CornerDownRight, label: '细分主题', keys: 'Tab', description: '为选中的主题添加次级主题。', command: 'child' }, { icon: Waypoints, label: '联系', keys: 'Ctrl Shift R', description: '在两个主题之间创建联系。', command: 'relation' }, { icon: Braces, label: '概要', keys: '', description: '为选中的主题添加概要。', command: 'summary' }, { icon: SquareDashed, label: '外框', keys: 'Ctrl Shift B', description: '通过外框将选中的主题分组。', command: 'boundary' }];
    return <><div className="map-main-toolbar" role="toolbar" aria-label="思维导图工具"><div className="map-selection-count">{t.selected.length > 1 ? `已选 ${t.selected.length} 个主题` : ''}</div><div className="map-primary-tools">{main.map(({ icon: Icon, label, keys, description, command }, i) => <button key={label} className={'map-tool' + (i === 2 ? ' divided' : '') + (t.relation && command === 'relation' ? ' active' : '')} aria-label={label} disabled={!t.selected.length && command !== 'after'} onClick={() => t.run(command)}><Icon size={20}/><span className="map-tooltip" role="tooltip"><strong>{label}<kbd>{keys}</kbd></strong><small>{description}</small></span></button>)}<div className="map-plus" ref={root}><button className={'map-tool map-add-tool' + (menu ? ' active' : '')} aria-label="添加" aria-expanded={menu} onClick={() => setMenu(!menu)}><Plus size={21}/><ChevronDown size={12}/><span className="map-tooltip"><strong>添加元素</strong><small>笔记、标签、图片与更多操作。</small></span></button>{menu && <div className="map-plus-menu" role="menu" aria-label="添加和画布操作">
  <div role="group" aria-label="内容"><small className="map-menu-heading">内容</small><MenuItem icon={StickyNote} title="笔记" onClick={() => act(() => t.run('notes'))}/><MenuItem icon={Tag} title="标签" keys="Ctrl Shift L" onClick={() => act(() => t.run('tags'))}/><MenuItem icon={MessageSquare} title="标注" onClick={() => act(() => t.run('annotation'))}/><MenuItem icon={MessageSquare} title="评论" keys="C" onClick={() => act(() => t.run('comment'))}/><MenuItem icon={ImageIcon} title="本地图片" keys="Ctrl Shift I" onClick={() => act(() => t.run('image'))}/>
  </div><hr /><div role="group" aria-label="关联"><small className="map-menu-heading">关联</small><MenuItem icon={LinkIcon} title="超链接" keys="Ctrl K" onClick={() => act(() => t.run('link'))}/><MenuItem icon={LinkIcon} title="导图链接" onClick={() => act(() => t.run('canvasLink'))}/><MenuItem icon={LinkIcon} title="主题链接" onClick={() => act(() => t.run('topicLink'))}/></div><hr /><div role="group" aria-label="画布操作"><small className="map-menu-heading">画布操作</small><MenuItem icon={Folder} title="专区" keys="Ctrl Alt Z" onClick={() => act(() => t.run('area'))}/><MenuItem icon={FilePlus2} title="新建画布" keys="Ctrl Alt N" onClick={() => act(() => t.run('new'))}/><div className="map-menu-pair"><button onClick={() => act(() => t.run('previous'))}><ArrowLeft size={14}/>上一张</button><button onClick={() => act(() => t.run('next'))}>下一张<ArrowRight size={14}/></button></div><details><summary><MoreHorizontal size={17}/>画布操作</summary><button onClick={() => act(importFile)}>导入 .excalidraw</button><button onClick={() => act(() => exportFile())}>导出完整导图</button><button onClick={() => act(() => exportFile(true))}>导出 SVG</button><button onClick={() => act(() => layout('balanced'))}>扩散布局（左右展开）</button><button onClick={() => act(() => layout('right'))}>向右自动布局</button><button onClick={() => act(() => layout('down'))}>向下自动布局</button>{linked && <><button onClick={() => act(() => sync('pull'))}>从实验记录同步</button><button onClick={() => act(() => sync('push'))}>写回实验记录</button></>}</details></div>
 </div>}</div></div><div className="map-toolbar-end"/></div>
 <div className="map-bottom-bar"><span>左键框选 · 右键拖拽</span><button aria-label="快捷键" title="查看全部快捷键" onClick={() => t.setHelp(true)}><Keyboard size={16}/></button><button aria-label="搜索导图" title="搜索 Ctrl F" onClick={() => t.setSearch(true)}>⌕</button><span className="map-bottom-spacer"/><button aria-label="撤销" title="撤销 Ctrl Z" disabled={!canUndo} onClick={() => t.run('undo')}><Undo2 size={16}/></button><button aria-label="重做" title="重做 Ctrl Shift Z" disabled={!canRedo} onClick={() => t.run('redo')}><Redo2 size={16}/></button><i /><button aria-label="缩小" title="Ctrl -" onClick={() => t.run('zoomOut')}><Minus size={15}/></button><button className="map-zoom-value" aria-label="实际尺寸" title="实际尺寸 Ctrl 0" onClick={() => t.run('actual')}>{Math.round(zoom * 100)}%</button><button aria-label="放大" title="Ctrl =" onClick={() => t.run('zoomIn')}><Plus size={15}/></button><button aria-label="适应画布" onClick={() => view.current?.fit()}><Maximize2 size={15}/></button><button aria-label="扩散布局" title="扩散布局：主节点向左右两侧展开" onClick={() => layout('balanced')}><GitBranch size={16}/></button><i /><button aria-label="格式面板" title="显示/隐藏格式面板 Ctrl ]" aria-pressed={t.format} onClick={() => t.run('format')}><PanelRight size={17}/></button></div></>;
}
function MenuItem({ icon: Icon, title, keys, onClick }: {
    icon: any;
    title: string;
    keys?: string;
    onClick: () => void;
}) { return <button role="menuitem" onClick={onClick}><Icon size={17}/><span>{title}</span>{keys && <kbd>{keys}</kbd>}</button>; }
export function MindmapFormat({ tools: t, scene }: {
    tools: MindmapTools;
    scene: CanvasScene;
}) { const id = t.selected.at(-1), n = M.topics(scene).find(n => n.id === id), style = id ? A.styleOf(scene, id) : A.DEFAULT_STYLE; return <aside className="map-format-panel" aria-label="主题格式面板"><header><strong>主题格式</strong><button aria-label="关闭格式面板" onClick={() => t.setFormat(false)}><X size={17}/></button></header>{!n ? <p>选择一个主题，调整文字与颜色。</p> : <><label>主题<input key={n.id + n.title} aria-label="主题标题" defaultValue={n.title} onBlur={e => t.rename(n.id, e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229)
    e.currentTarget.blur(); }}/></label><div className="map-font-controls"><input aria-label="字号" type="number" min="10" max="60" value={style.fontSize || 18} onChange={e => t.style({ fontSize: Math.max(10, Math.min(60, Number(e.target.value) || 18)) })}/><button aria-label="粗体" aria-pressed={!!style.bold} onClick={() => t.run('bold')}><Bold size={17}/></button><button aria-label="斜体" aria-pressed={!!style.italic} onClick={() => t.run('italic')}><Italic size={17}/></button></div><label>文字颜色</label><div className="map-color-row">{['#344b40', '#b3484c', '#ae7f30', '#4b7ca3', '#8872a3'].map(c => <button key={c} aria-label={'文字颜色 ' + c} style={{ background: c }} onClick={() => t.style({ color: c })}/>)}</div><label>背景</label><div className="map-color-row">{['#ffffff', '#e9f2ed', '#fff0ef', '#fff4dd', '#eaf2fa'].map(c => <button key={c} aria-label={'背景颜色 ' + c} style={{ background: c }} onClick={() => t.style({ fill: c })}/>)}</div><label>快捷样式</label><div className="map-preset-list"><button onClick={() => t.run('critical')}>极其重要 · 红色</button><button onClick={() => t.run('important')}>极其重要 · 橙色</button><button onClick={() => t.run('removed')}>删去</button><button onClick={() => t.run('resetStyle')}>默认</button><button onClick={() => t.run('textOnly')}>仅保留文本</button></div><details className="map-record-fields"><summary>主题记录</summary><label>状态<select value={n.status || ''} onChange={e => t.editMeta({ status: e.target.value })}><option value="">未设置</option>{['计划中', '进行中', '已完成', '暂停', '待确认', '阶段'].map(s => <option key={s}>{s}</option>)}</select></label>{(['notes', 'next', 'evidence'] as const).map((field, i) => <label key={n.id + field + n[field]}>{['笔记 / 结果', '下一步', '证据'][i]}<textarea defaultValue={n[field]} rows={3} onBlur={e => t.editMeta({ [field]: e.target.value })}/></label>)}{n.recordId && <small>已关联实验记录</small>}{t.canOpenEvidence && researchNodeIdOf(n.recordId) && <button type="button" className="map-evidence-link" onClick={() => t.run('openEvidence')}>在历史证据中查看 <ArrowUpRight size={13}/></button>}</details></>}</aside>; }
export function MindmapDialogs({ tools: t, scene }: {
    tools: MindmapTools;
    scene: CanvasScene;
}) {
    const [value, setValue] = useState(t.dialog?.value || ''), input = useRef<HTMLInputElement | null>(null), textarea = useRef<HTMLTextAreaElement | null>(null);
    useEffect(() => { setValue(t.dialog?.value || ''); setTimeout(() => { (input.current || textarea.current)?.focus(); }, 0); }, [t.dialog]);
    const names = { tags: '标签', link: '超链接', comment: '评论', notes: '笔记', annotation: '标注', boundary: '外框', area: '专区', summary: '概要' };
    const d = t.dialog, comments = d?.kind === 'comment' ? A.topicMeta(scene, d.ids[0]).comments || [] : [];
    const shortcuts = A.SHORTCUTS.filter((s, i, a) => a.findIndex(k => k.command === s.command) === i);
    return <>{d && <div className="map-modal-backdrop" onPointerDown={e => { if (e.target === e.currentTarget)
        t.setDialog(null); }}><form className="map-modal" role="dialog" aria-modal="true" aria-label={names[d.kind]} onSubmit={e => { e.preventDefault(); t.applyDialog(value); }} onKeyDown={e => { if (e.key === 'Escape') {
        e.stopPropagation();
        t.setDialog(null);
    } }}><header><h3>{names[d.kind]}</h3><button type="button" aria-label="关闭" onClick={() => t.setDialog(null)}><X size={18}/></button></header>{comments.length > 0 && <div className="map-comment-list">{comments.map((c: any) => <article key={c.id}><small>{String(c.createdAt).slice(0, 16).replace('T', ' ')}</small><p>{c.text}</p></article>)}</div>}<div className="map-dialog-body">{d.kind === 'notes' || d.kind === 'comment' || d.kind === 'annotation' ? <textarea ref={textarea} aria-label={names[d.kind] + '内容'} value={value} onChange={e => setValue(e.target.value)} rows={6} placeholder={d.kind === 'comment' ? '记录讨论、疑问或补充…' : '记录这个主题的笔记…'}/> : <input ref={input} aria-label={names[d.kind] + '内容'} value={value} onChange={e => setValue(e.target.value)} placeholder={d.kind === 'tags' ? '用逗号分隔标签' : d.kind === 'link' ? 'https://…' : '名称'}/>}</div><footer><button type="button" onClick={() => t.setDialog(null)}>取消</button><button className="primary" type="submit">{d.kind === 'comment' ? '添加评论' : '确定'}</button></footer></form></div>}
 {t.help && <div className="map-modal-backdrop"><section className="map-modal map-keyboard-help" role="dialog" aria-modal="true" aria-label="全部快捷键"><header><h3>快捷键</h3><button aria-label="关闭快捷键" onClick={() => t.setHelp(false)}><X size={18}/></button></header><div className="map-shortcuts">{shortcuts.map(s => <div key={s.command}><span>{s.label}</span><kbd>{s.keys}</kbd></div>)}</div><footer>编辑文字时保留正常输入；Mac 可使用 Command 代替 Ctrl。</footer></section></div>}
 </>;
}
