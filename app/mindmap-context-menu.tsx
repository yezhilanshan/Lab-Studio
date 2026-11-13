'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Copy, Scissors, Clipboard, Trash2, Plus, Lightbulb, ListTree, Image, MessageSquareText, Paintbrush, CopyPlus, Pin, FileSearch } from 'lucide-react';
import type { MindmapTools } from './use-mindmap-tools';
const INSERT = [['笔记', 'notes'], ['标签', 'tags'], ['待办事项', 'todo'], ['任务', 'task'], ['网页', 'web'], ['嵌入链接', 'embed'], ['导图链接', 'canvasLink'], ['主题链接', 'topicLink'], ['标注', 'annotation'], ['附件', 'attachment'], ['标记', 'marker'], ['贴纸', 'sticker'], ['插画', 'illustration'], ['图片', 'image']] as const;
const GROUPS = { insert: INSERT, ideas: [['发散研究想法', 'ideas:发散研究想法'], ['提出研究问题', 'ideas:提出可验证的研究问题'], ['补充验证实验', 'ideas:补充对照与消融实验']], breakdown: [['按步骤分解', 'breakdown:按执行步骤分解'], ['按任务分解', 'breakdown:按可验收任务分解'], ['按里程碑分解', 'breakdown:按阶段和里程碑分解']] } as const;
type Group = keyof typeof GROUPS;
export function MindmapContextMenu({ tools: t }: {
    tools: MindmapTools;
}) {
    const root = useRef<HTMLDivElement>(null), [group, setGroup] = useState<Group | null>(null), [position, setPosition] = useState({ x: 0, y: 0, left: false });
    useLayoutEffect(() => { if (!t.context)
        return; const width = 270, height = root.current?.offsetHeight || 470, x = Math.max(8, Math.min(t.context.x, innerWidth - width - 8)), y = Math.max(8, Math.min(t.context.y, innerHeight - height - 8)); setPosition({ x, y, left: innerWidth - x - width < 285 }); }, [t.context]);
    useEffect(() => { if (!t.context)
        return; setGroup(null); const timer = setTimeout(() => root.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }), 0); const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) {
        t.closeContext();
    } }; const scroll = () => t.closeContext(); document.addEventListener('pointerdown', close, true); window.addEventListener('resize', scroll); return () => { clearTimeout(timer); document.removeEventListener('pointerdown', close, true); window.removeEventListener('resize', scroll); }; }, [t.context]);
    if (!t.context || typeof document === 'undefined')
        return null;
    const run = (command: string) => { t.run(command); document.querySelector<HTMLElement>('.map-surface')?.focus({ preventScroll: true }); };
    const submenu = (id: Group, label: string, Icon: any) => <button role="menuitem" aria-haspopup="menu" aria-expanded={group === id} onPointerEnter={() => setGroup(id)} onClick={() => setGroup(id)}><Icon size={17}/><span>{label}</span><ChevronRight size={15}/></button>;
    const item = (label: string, command: string, keys: string, Icon: any) => <button role="menuitem" disabled={command === 'pasteStyle' && !sessionStorage.getItem('seer-mindmap-style')} onPointerEnter={() => setGroup(null)} onClick={() => run(command)}><Icon size={16}/><span>{label}</span><kbd>{keys}</kbd></button>;
    return createPortal(<div ref={root} className={'map-context-menu' + (position.left ? ' submenu-left' : '')} style={{ left: position.x, top: position.y }} onContextMenu={e => e.preventDefault()} onKeyDown={e => { if (e.key === 'Escape') {
        e.preventDefault();
        t.closeContext();
        document.querySelector<HTMLElement>('.map-surface')?.focus();
    } if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const column = (e.target as Element).closest('.map-context-column'), buttons = Array.from(column?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []), index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    } }}><div className="map-context-column" role="menu" aria-label="节点右键菜单">
 {submenu('insert', '插入', Plus)}<hr />{submenu('ideas', '生成想法', Lightbulb)}{submenu('breakdown', '工作分解', ListTree)}<button role="menuitem" aria-label="生成图片" onPointerEnter={() => setGroup(null)} onClick={() => run('generateImage')}><Image size={17}/><span>生成图片</span><small>API</small></button><button role="menuitem" onPointerEnter={() => setGroup(null)} onClick={() => run('explain')}><MessageSquareText size={17}/><span>生成解释</span></button>{t.canOpenEvidence && <><hr /><button role="menuitem" aria-label="在历史证据中查看" onPointerEnter={() => setGroup(null)} onClick={() => run('openEvidence')}><FileSearch size={17}/><span>在历史证据中查看</span><small>跳转</small></button></>}<hr />
 {item('拷贝', 'copy', 'Ctrl C', Copy)}{item('剪切', 'cut', 'Ctrl X', Scissors)}{item('粘贴', 'paste', 'Ctrl V', Clipboard)}{item('复制', 'duplicate', 'Ctrl D', CopyPlus)}<hr />{item('删除', 'delete', 'Backspace', Trash2)}{item('删除单个主题', 'deleteSingle', 'Ctrl Backspace', Trash2)}<hr />{item('锁定 / 解锁分支位置', 'togglePositionLock', '', Pin)}{item('拷贝样式', 'copyStyle', 'Ctrl Alt C', Paintbrush)}{item('粘贴样式', 'pasteStyle', 'Ctrl Alt V', Paintbrush)}
 </div>{group && <div className="map-context-submenu map-context-column" role="menu" aria-label={group === 'insert' ? '插入元素' : group === 'ideas' ? '生成想法选项' : '工作分解选项'}>{GROUPS[group].map(([label, command], i) => <button key={command} role="menuitem" onClick={() => run(command)} className={group === 'insert' && [2, 4, 9, 10, 13].includes(i) ? 'menu-section-start' : ''}><span>{label}</span></button>)}</div>}</div>, document.body);
}
