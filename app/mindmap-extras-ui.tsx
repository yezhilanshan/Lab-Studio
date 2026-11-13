'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Paperclip, ExternalLink, GitBranch, ArrowUpRight } from 'lucide-react';
import type { MindmapTools } from './use-mindmap-tools';
import type { CanvasScene } from '../lib/mindmap-scene';
import * as M from '../lib/structured-mindmap';
import * as A from '../lib/mindmap-actions';
const MARKERS = ['⭐', '❗', '✅', '❓', '🔬', '📌', '🔴', '🟡', '🟢', '1️⃣', '2️⃣', '3️⃣'];
const STICKERS = ['💡', '🚀', '🎯', '🧪', '📚', '🌱', '🧠', '🛰️', '🧩', '🏁', '📡', '✨'];
export function TopicIllustration({ kind }: {
    kind: string;
}) { return <svg className="map-topic-illustration" viewBox="0 0 220 76" aria-label="主题插画"><rect x="1" y="1" width="218" height="74" rx="10" fill="#f4f8f5"/>{kind === 'target' ? <><circle cx="110" cy="38" r="27" fill="#e0eee5"/><circle cx="110" cy="38" r="17" fill="#b4d2c0"/><circle cx="110" cy="38" r="6" fill="#6f9d85"/><path d="M112 36 L145 12 M135 13 L145 12 L145 22" stroke="#be9c6d" strokeWidth="3" fill="none"/></> : kind === 'comparison' ? <><rect x="37" y="29" width="32" height="30" rx="4" fill="#a8c7b6"/><rect x="93" y="16" width="32" height="43" rx="4" fill="#96b7c6"/><rect x="149" y="38" width="32" height="21" rx="4" fill="#d5b990"/><path d="M27 61 H192" stroke="#b9c9bc"/></> : kind === 'network' ? <><path d="M50 38 L105 17 L168 36 L110 60 Z M50 38 L168 36 M105 17 L110 60" stroke="#afc9bc" strokeWidth="2"/>{[[50, 38], [105, 17], [168, 36], [110, 60]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i ? 8 : 12} fill={i % 2 ? '#a5b9ca' : '#93b9a4'}/>)}</> : <><path d="M45 38 H180" stroke="#a7c5b5" strokeWidth="2"/>{[30, 94, 158].map((x, i) => <g key={i}><rect x={x} y="23" width="36" height="30" rx="6" fill={['#b4cebd', '#b4c8d5', '#d9c5a5'][i]}/><text x={x + 18} y="43" textAnchor="middle" fontSize="12" fill="#fff">{i + 1}</text></g>)}</>}</svg>; }
export function TopicExtras({ scene, id, meta: m, tools: t }: {
    scene: CanvasScene;
    id: string;
    meta: any;
    tools: MindmapTools;
}) {
    if (m.plain)
        return null;
    return <>
 {m.sticker && <span className="map-topic-sticker" aria-label="主题贴纸">{m.sticker}</span>}{m.illustration && <TopicIllustration kind={m.illustration}/>} 
 {m.todo && <label className="map-todo" onPointerDown={e => e.stopPropagation()}><input type="checkbox" aria-label="完成待办事项" checked={!!m.todo.done} onChange={() => t.extras.toggleTodo(id)}/><span>{m.todo.done ? '已完成' : '待办事项'}</span></label>}
 {m.task && <button className="map-task-badge" onPointerDown={e => e.stopPropagation()} onClick={() => { t.select([id]); t.run('task'); }}><span>{m.task.priority === '高' ? '! ' : ''}任务 {m.task.progress || 0}% {m.task.owner}</span><i><b style={{ width: (m.task.progress || 0) + '%' }}/></i>{m.task.due && <small>截止 {m.task.due}</small>}</button>}
 {m.embed && <button className="map-extra-link" onPointerDown={e => e.stopPropagation()} onClick={() => { t.select([id]); t.run('embed'); }}><ExternalLink size={12}/>嵌入链接</button>}{m.canvasLink && <button className="map-extra-link" onPointerDown={e => e.stopPropagation()} onClick={() => t.extras.openMap(m.canvasLink)}><GitBranch size={12}/>打开关联导图</button>}{m.topicLink && <button className="map-extra-link" onPointerDown={e => e.stopPropagation()} onClick={() => t.extras.jump(m.topicLink)}><ArrowUpRight size={12}/>跳转关联主题</button>}
 {(m.attachments || []).map((fileId: string) => { const f = scene.files[fileId]; return f ? <div key={fileId} className="map-attachment"><a href={typeof f.dataURL === 'string' && f.dataURL.startsWith('data:') ? f.dataURL : undefined} download={f.name || '附件'} onPointerDown={e => e.stopPropagation()}><Paperclip size={11}/>{f.name || '附件'}</a><button aria-label={'移除附件 ' + f.name} onPointerDown={e => e.stopPropagation()} onClick={() => t.extras.removeAttachment(id, fileId)}>×</button></div> : null; })}
 </>;
}
export function MindmapExtrasDialogs({ tools: t, scene, maps }: {
    tools: MindmapTools;
    scene: CanvasScene;
    maps: {
        id: string;
        title: string;
    }[];
}) {
    const form = useRef<HTMLFormElement | null>(null), x = t.extras, d = x.dialog, [value, setValue] = useState(''), [task, setTask] = useState({ owner: '', start: '', due: '', progress: 0, priority: '普通' }), [preview, setPreview] = useState('');
    useEffect(() => { setValue(d?.value || ''); setPreview(''); if (d?.kind === 'task') {
        try {
            setTask(JSON.parse(d.value));
        }
        catch { }
    } const timer = setTimeout(() => form.current?.querySelector<HTMLInputElement>('input,textarea,select')?.focus(), 0); return () => clearTimeout(timer); }, [d]);
    if (!d || typeof document === 'undefined')
        return null;
    const names = { task: '任务', web: '网页', embed: '嵌入链接', canvasLink: '导图链接', topicLink: '主题链接', marker: '标记', sticker: '贴纸', illustration: '插画', attachment: '附件', ai: d.mode === 'ideas' ? '生成想法' : d.mode === 'breakdown' ? '工作分解' : d.mode === 'image' ? '生成图片' : '生成解释' }, picker = d.kind === 'marker' ? MARKERS : d.kind === 'sticker' ? STICKERS : null;
    const renderNodes = (nodes: any[]): React.ReactNode => <ul>{nodes.map((n, i) => <li key={i}>{n.title}{n.children?.length ? renderNodes(n.children) : null}</li>)}</ul>;
    return createPortal(<div className="map-modal-backdrop"><form ref={form} className={'map-modal map-extras-dialog' + (d.kind === 'ai' ? ' map-ai-dialog' : '')} role="dialog" aria-modal="true" aria-label={names[d.kind]} onSubmit={e => { e.preventDefault(); if (d.kind === 'ai')
        void x.generate(value);
    else
        x.save(d.kind === 'task' ? JSON.stringify(task) : value); }}><header><h3>{names[d.kind]}</h3><button type="button" aria-label="关闭节点插入窗口" onClick={x.close}><X size={18}/></button></header><div className="map-extra-dialog-body">
 {d.kind === 'task' ? <div className="map-task-form"><label>负责人<input aria-label="任务负责人" value={task.owner} onChange={e => setTask({ ...task, owner: e.target.value })}/></label><label>优先级<select value={task.priority} onChange={e => setTask({ ...task, priority: e.target.value })}>{['普通', '高', '低'].map(p => <option key={p}>{p}</option>)}</select></label><label>开始日期<input type="date" value={task.start} onChange={e => setTask({ ...task, start: e.target.value })}/></label><label>截止日期<input aria-label="任务截止日期" type="date" value={task.due} onChange={e => setTask({ ...task, due: e.target.value })}/></label><label className="full">进度 {task.progress}%<input aria-label="任务进度数值" type="number" min="0" max="100" value={task.progress} onChange={e => setTask({ ...task, progress: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}/><input aria-label="任务进度" type="range" min="0" max="100" value={task.progress} onChange={e => setTask({ ...task, progress: Number(e.target.value) })}/></label></div>
            : picker ? <><div className="map-symbol-picker">{picker.map(symbol => <button type="button" key={symbol} aria-label={symbol} onClick={() => x.save(symbol)}>{symbol}</button>)}</div><button type="button" className="map-clear-extra" onClick={() => x.save('')}>移除{names[d.kind]}</button></>
                : d.kind === 'illustration' ? <><div className="map-illustration-picker">{[['process', '研究流程'], ['comparison', '实验对比'], ['target', '目标与里程碑'], ['network', '关联网络']].map(([id, label]) => <button type="button" key={id} onClick={() => x.save(id)}><TopicIllustration kind={id}/><span>{label}</span></button>)}</div><button type="button" className="map-clear-extra" onClick={() => x.save('')}>移除插画</button></>
                    : d.kind === 'canvasLink' ? <label>目标导图<select aria-label="目标导图" value={value} onChange={e => setValue(e.target.value)}><option value="">不关联</option>{maps.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select></label>
                        : d.kind === 'topicLink' ? <label>目标主题<select aria-label="目标主题" value={value} onChange={e => setValue(e.target.value)}><option value="">不关联</option>{M.topics(scene).filter(n => !d.ids.includes(n.id)).map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label>
                            : d.kind === 'ai' ? <>
 <label>生成要求<textarea aria-label="AI 生成要求" value={value} onChange={e => setValue(e.target.value)} rows={3}/></label><div className="map-ai-settings"><label>接口类型<select aria-label="导图 API 类型" value={x.config.apiType} onChange={e => x.setConfig({ ...x.config, apiType: e.target.value })}><option value="openai">OpenAI 兼容</option><option value="anthropic">Anthropic 兼容</option></select></label><label>服务地址<input aria-label="导图 API 地址" placeholder="https://provider.example/v1" value={x.config.baseUrl} onChange={e => x.setConfig({ ...x.config, baseUrl: e.target.value })}/></label><label>{d.mode === 'image' ? '图片模型' : '文本模型'}<input aria-label="导图 API 模型" value={d.mode === 'image' ? x.config.imageModel : x.config.model} onChange={e => x.setConfig({ ...x.config, [d.mode === 'image' ? 'imageModel' : 'model']: e.target.value })}/></label><label>API Key<input aria-label="导图 API 密钥" type="password" autoComplete="off" value={x.config.apiKey} onChange={e => x.setConfig({ ...x.config, apiKey: e.target.value })}/></label></div><p className="map-ai-note">只发送所选主题及其直接子主题。密钥仅保留在当前编辑器内存中；结果预览后再插入。</p>
 {x.result && <section className="map-ai-result" aria-label="生成结果预览">{x.result.image ? <img src={x.result.image} alt="生成图片预览"/> : x.result.explanation ? <p>{x.result.explanation}</p> : renderNodes(x.result.nodes || [])}</section>}
 </>
                                : <><label>{names[d.kind]}地址<input aria-label={names[d.kind] + '地址'} value={value} onChange={e => setValue(e.target.value)} placeholder="https://…"/></label>{d.kind === 'embed' && <><button type="button" className="map-preview-link" onClick={() => { try {
                                    const u = new URL(value);
                                    if (['https:', 'http:'].includes(u.protocol))
                                        setPreview(u.href);
                                }
                                catch { } }}>预览链接</button>{preview && <><iframe title="嵌入链接预览" src={preview} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer"/><a className="map-embed-fallback" href={preview} target="_blank" rel="noreferrer">网页不允许嵌入时，打开原网页 ↗</a></>}</>}</>}
 {x.error && <p className="map-extra-error" role="alert">{x.error}</p>}</div><footer><button type="button" onClick={x.close}>取消</button>{d.kind === 'ai' ? <><button className="primary" disabled={x.busy || !value.trim()} type="submit">{x.busy ? '生成中…' : x.result ? '重新生成' : '生成'}</button>{x.result && <button type="button" className="primary" disabled={x.busy} onClick={x.apply}>{d.mode === 'explain' ? '添加到笔记' : '插入到导图'}</button>}</> : !picker && d.kind !== 'illustration' && <button className="primary" type="submit">确定</button>}</footer></form></div>, document.body);
}
