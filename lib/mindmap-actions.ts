import type { CanvasScene } from './mindmap-scene';
import * as M from './structured-mindmap';
export type TopicStyle = {
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    strike?: boolean;
    color?: string;
    fill?: string;
    border?: string;
    borderWidth?: number;
};
export const DEFAULT_STYLE: TopicStyle = { fontSize: 18, bold: false, italic: false, strike: false, color: '#344b40', fill: '#ffffff', border: '#dce5df', borderWidth: 1 };
export const PRESETS: Record<string, TopicStyle> = { critical: { ...DEFAULT_STYLE, color: '#a23b40', fill: '#fff0ef', border: '#eb9b96', bold: true }, important: { ...DEFAULT_STYLE, color: '#976124', fill: '#fff5de', border: '#e4bb74', bold: true }, removed: { ...DEFAULT_STYLE, color: '#9b9e9b', strike: true, fill: 'transparent', border: 'transparent' }, default: DEFAULT_STYLE };
export function topicMeta(scene: CanvasScene, id: string): any { return scene.elements.find(e => e.id === id)?.customData?.mindmap || {}; }
export function patchElement(e: any, props: any) { return { ...e, ...props, version: (e.version || 0) + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now() }; }
export function setMeta(scene: CanvasScene, ids: string[], changes: Record<string, unknown>): CanvasScene { return { ...scene, elements: scene.elements.map(e => ids.includes(e.id) ? patchElement(e, { customData: { ...e.customData, mindmap: { ...topicMeta(scene, e.id), ...changes } } }) : e) }; }
export function styleOf(scene: CanvasScene, id: string): TopicStyle { return { ...DEFAULT_STYLE, ...topicMeta(scene, id).style }; }

export function searchTopics(scene: CanvasScene, query: string) {
    const terms = query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const tags = new Map(scene.elements.map(e => [e.id, e.customData?.mindmap?.tags || []]));
    return M.topics(scene).filter(n => {
        const text = [n.title, n.notes, n.recordId, ...tags.get(n.id)].join(' ').normalize('NFKC').toLocaleLowerCase();
        return terms.every(term => text.includes(term));
    });
}
export function resizeTopic(scene: CanvasScene, id: string) { const n = M.topics(scene).find(n => n.id === id); if (!n)
    return scene; const m = topicMeta(scene, id), font = styleOf(scene, id).fontSize || 18, lines = n.title.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil([...line].reduce((w, c) => w + (c.charCodeAt(0) > 255 ? font : font * .6), 0) / Math.max(60, n.width - 36))), 0), height = Math.max(56, lines * font * 1.5 + 24 + (!m.plain? (m.sticker?48:0)+(m.illustration?82:0)+(m.todo?28:0)+(m.task?68:0)+([m.embed,m.canvasLink,m.topicLink].filter(Boolean).length*23)+((m.attachments||[]).length*25):0) + (!m.plain && m.annotation ? Math.max(35, Math.ceil(String(m.annotation).length * 12 / (n.width - 36)) * 18 + 14) : 0) + (!m.plain && m.imageId ? 140 : 0) + (!m.plain && (m.tags?.length || m.comments?.length || (!m.notesHidden && n.notes)) ? 23 : 0)); return { ...scene, elements: scene.elements.map(e => e.id === id ? patchElement(e, { height }) : e) }; }
export type TopicContentKind = 'notes' | 'tags' | 'todo' | 'task' | 'web' | 'embed' | 'canvasLink' | 'topicLink' | 'annotation' | 'attachment' | 'marker' | 'sticker' | 'illustration' | 'image';
export function removeTopicContent(scene: CanvasScene, id: string, kind: TopicContentKind, value?: string): CanvasScene {
    const element = scene.elements.find(e => e.id === id && !e.isDeleted);
    if (!element)
        return scene;
    const meta = topicMeta(scene, id);
    let next = scene;
    if (kind === 'web')
        next = { ...scene, elements: scene.elements.map(e => e.id === id ? patchElement(e, { link: null }) : e) };
    else if (kind === 'notes')
        next = setMeta(scene, [id], { notesHidden: true });
    else if (kind === 'tags' || kind === 'attachment') {
        const field = kind === 'tags' ? 'tags' : 'attachments', items: string[] = meta[field] || [];
        const index = items.indexOf(String(value));
        if (index < 0)
            return scene;
        next = setMeta(scene, [id], { [field]: items.filter((_, i) => i !== index) });
    }
    else {
        const empty = ['todo', 'task', 'image'].includes(kind) ? null : '';
        next = setMeta(scene, [id], { [kind === 'image' ? 'imageId' : kind]: empty });
    }
    return M.reconnect(resizeTopic(next, id));
}
export function applyStyle(scene: CanvasScene, ids: string[], style: TopicStyle, replace = false): CanvasScene {
    let next = scene;
    for (const id of ids) {
        const s = { ...(replace ? DEFAULT_STYLE : styleOf(next, id)), ...style };
        next = setMeta(next, [id], { style: s, ...(replace ? { plain: false } : {}) });
        next = { ...next, elements: next.elements.map(e => e.id === id ? patchElement(e, { strokeColor: s.border, backgroundColor: s.fill, strokeWidth: s.borderWidth }) : e.containerId === id && e.type === 'text' ? patchElement(e, { fontSize: s.fontSize, strokeColor: s.color }) : e) };
        next = resizeTopic(next, id);
    }
    return M.reconnect(next);
}
function shape(id: string, x: number, y: number, width: number, height: number) { return { id, type: 'rectangle', x, y, width, height, angle: 0, strokeColor: '#dce5df', backgroundColor: '#ffffff', fillStyle: 'solid', strokeWidth: 1, strokeStyle: 'solid', roughness: 0, opacity: 100, seed: 1, version: 1, versionNonce: 1, isDeleted: false, groupIds: [], boundElements: [], updated: Date.now(), link: null, locked: false, roundness: { type: 3 } }; }
export function insertTopic(scene: CanvasScene, id: string, parentId: string | null, title = '新主题', order?: number, local = true, nearId?: string) {
    const ns = M.topics(scene), parent = ns.find(n => n.id === parentId), siblings = ns.filter(n => n.parentId === parentId);
    const root = ns.find(n => !n.parentId);
    const style = topicMeta(scene, root?.id || '').defaultStyle || DEFAULT_STYLE;
    const e = shape(id, parent ? parent.x + parent.width + 110 : 160, parent ? parent.y + siblings.length * 100 : 140 + siblings.length * 160, 200, 68);
    e.boundElements = [];
    let next = { ...scene, elements: [...scene.elements, e] };
    next = M.updateTopic(next, id, { parentId, order: order ?? Math.max(0, ...siblings.map(n => n.order)) + 1, title, status: '', collapsed: false });
    if (parent)
        next = M.updateTopic(next, parent.id, { collapsed: false });
    next = applyStyle(next, [id], style, true);
    return { scene: local ? M.compactBranches(M.placeNewBranches(next, [id], nearId), new Set([parentId]), scene) : next, id };
}
export function insertSibling(scene: CanvasScene, id: string, target: string, before = false) { const ns = M.topics(scene), n = ns.find(n => n.id === target); if (!n)
    return insertTopic(scene, id, null); const siblings = ns.filter(s => s.parentId === n.parentId).sort((a, b) => a.order - b.order), i = siblings.findIndex(s => s.id === n.id), adj = siblings[i + (before ? -1 : 1)], order = adj ? (n.order + adj.order) / 2 : n.order + (before ? -1 : 1); return insertTopic(scene, id, n.parentId, '新主题', order, true, n.id); }
export function insertParent(scene: CanvasScene, id: string, target: string) { const n = M.topics(scene).find(n => n.id === target); if (!n)
    return insertTopic(scene, id, null); if (n.recordId?.startsWith('root-'))
    throw Error('实验中心主题保持在根部，请先选择一个分支主题'); const result = insertTopic(scene, id, n.parentId, '上级主题', n.order, false);
    const nested = M.changeTopology(result.scene, new Map([[target, { parentId: id }]]));
    return { ...result, scene: M.compactBranches(M.placeNewBranches(M.placeNewBranches(nested, [id]), [target]), new Set([n.parentId, id]), scene) }; }
export function deleteSingle(scene: CanvasScene, ids: string[]) {
    const selected = new Set(ids), ns = M.topics(scene), byId = new Map(ns.map(n => [n.id, n]));
    const changes = new Map<string, Partial<M.Topic>>(), parents = new Set<string | null>(), promoted: string[] = [];
    for (const n of ns) {
        let parentId = n.parentId;
        if (selected.has(n.id)) parents.add(parentId);
        while (parentId && selected.has(parentId)) parentId = byId.get(parentId)?.parentId || null;
        if (!selected.has(n.id) && n.parentId !== parentId) {
            parents.add(parentId);
            changes.set(n.id, { parentId });
            promoted.push(n.id);
        }
    }
    const next = M.changeTopology({ ...scene, elements: scene.elements.map(e =>
        [e.id, e.containerId, e.startBinding?.elementId, e.endBinding?.elementId].some(id => selected.has(id))
            ? patchElement(e, { isDeleted: true }) : e) }, changes);
    return M.compactBranches(M.placeNewBranches(next, promoted), parents, scene);
}

export function deleteBranches(scene: CanvasScene, ids: string[]) {
    const ns = M.topics(scene), roots = M.branchRoots(ns, ids);
    const removed = new Set(roots.flatMap(n => [n.id, ...M.descendants(ns, n.id)]));
    const next = { ...scene, elements: scene.elements.map(e =>
        [e.id, e.containerId, e.startBinding?.elementId, e.endBinding?.elementId].some(id => removed.has(id))
            ? patchElement(e, { isDeleted: true }) : e) };
    return M.compactBranches(next, new Set(roots.map(n => n.parentId)), scene);
}

export function reorderTopic(scene: CanvasScene, id: string, where: 'up' | 'down' | 'first' | 'last') {
    const ns = M.topics(scene), n = ns.find(n => n.id === id);
    if (!n) return scene;
    const siblings = M.topicChildren(ns).get(n.parentId) || [];
    const from = siblings.findIndex(s => s.id === id);
    const to = where === 'first' ? 0 : where === 'last' ? siblings.length - 1 : Math.max(0, Math.min(siblings.length - 1, from + (where === 'up' ? -1 : 1)));
    if (from === to) return scene;
    return M.dropBranches(scene, [id], { targetId: siblings[to].id, kind: from > to ? 'before' : 'after' });
}

export function foldBranches(scene: CanvasScene, id: string) {
    const ns = M.topics(scene), children = M.topicChildren(ns), branches = M.descendants(ns, id).filter(child => children.has(child));
    const ids = new Set(branches);
    return M.setTopicFold(scene, branches, ns.some(n => ids.has(n.id) && !n.collapsed));
}
export function addRelation(scene: CanvasScene, id: string, from: string, to: string) { if (from === to)
    throw Error('请选择两个不同的主题'); return { ...scene, elements: [...scene.elements, { ...shape(id, 0, 0, 1, 1), type: 'arrow', points: [[0, 0], [1, 1]], startBinding: { elementId: from, focus: 0, gap: 1 }, endBinding: { elementId: to, focus: 0, gap: 1 }, startArrowhead: null, endArrowhead: 'arrow', customData: { mindmapRelation: true, label: '联系' } }] }; }
export function addDecoration(scene: CanvasScene, id: string, ids: string[], kind: 'boundary' | 'area' | 'summary', title: string, summaryTopicId?: string) { return { ...scene, elements: [...scene.elements, { ...shape(id, 0, 0, 1, 1), customData: { mindmapDecoration: kind, topicIds: ids, title, summaryTopicId }, strokeStyle: 'dashed', backgroundColor: kind === 'area' ? '#edf2ee' : 'transparent' }] }; }
export function topicBounds(nodes: M.Topic[]) { if (!nodes.length)
    return { x: 0, y: 0, width: 100, height: 100 }; const x = Math.min(...nodes.map(n => n.x)), y = Math.min(...nodes.map(n => n.y)); return { x, y, width: Math.max(...nodes.map(n => n.x + n.width)) - x, height: Math.max(...nodes.map(n => n.y + n.height)) - y }; }
export function neighbor(nodes: M.Topic[], id: string, direction: string) { const n = nodes.find(n => n.id === id); if (!n)
    return nodes[0]?.id; const dx = direction === 'ArrowRight' ? 1 : direction === 'ArrowLeft' ? -1 : 0, dy = direction === 'ArrowDown' ? 1 : direction === 'ArrowUp' ? -1 : 0; return nodes.filter(t => t.id !== id && (dx ? (t.x + t.width / 2 - n.x - n.width / 2) * dx > 2 : (t.y + t.height / 2 - n.y - n.height / 2) * dy > 2)).sort((a, b) => { const score = (t: M.Topic) => { const x = t.x + t.width / 2 - n.x - n.width / 2, y = t.y + t.height / 2 - n.y - n.height / 2; return Math.abs(dx ? x : y) + 2 * Math.abs(dx ? y : x); }; return score(a) - score(b); })[0]?.id || id; }
export type Command = 'copy'|'cut'|'paste'|'duplicate'|'delete'|'new' | 'previous' | 'next' | 'undo' | 'redo' | 'copyStyle' | 'pasteStyle' | 'resetStyle' | 'deleteSingle' | 'child' | 'after' | 'before' | 'parent' | 'relation' | 'boundary' | 'tags' | 'image' | 'link' | 'comment' | 'area' | 'textOnly' | 'edit' | 'textStart' | 'textEnd' | 'bold' | 'italic' | 'fontUp' | 'fontDown' | 'critical' | 'important' | 'removed' | 'default' | 'updateStyle' | 'center' | 'navigate' | 'multiNavigate' | 'up' | 'down' | 'first' | 'last' | 'fold' | 'foldBranches' | 'isolate' | 'zoomIn' | 'zoomOut' | 'actual' | 'format';
type Key = {
    code: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
};
type Shortcut = {
    command: Command;
    label: string;
    keys: string;
    code: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
};
const K = (command: Command, label: string, keys: string, code: string, ctrl = false, alt = false, shift = false): Shortcut => ({ command, label, keys, code, ctrl, alt, shift });
export const SHORTCUTS: Shortcut[] = [
    K('delete','删除主题及分支','Backspace','Backspace'),K('delete','删除主题及分支','Delete','Delete'),K('copy','拷贝','Ctrl C','KeyC',true),K('cut','剪切','Ctrl X','KeyX',true),K('paste','粘贴','Ctrl V','KeyV',true),K('duplicate','复制主题','Ctrl D','KeyD',true),
    K('new', '新建画布', 'Ctrl Alt N', 'KeyN', true, true), K('previous', '上一张画布', 'Ctrl Alt [', 'BracketLeft', true, true), K('next', '下一张画布', 'Ctrl Alt ]', 'BracketRight', true, true), K('undo', '撤销', 'Ctrl Z', 'KeyZ', true), K('redo', '重做', 'Ctrl Shift Z', 'KeyZ', true, false, true), K('copyStyle', '拷贝样式', 'Ctrl Alt C', 'KeyC', true, true), K('pasteStyle', '粘贴样式', 'Ctrl Alt V', 'KeyV', true, true), K('resetStyle', '重设样式', 'Ctrl Alt 0', 'Digit0', true, true), K('deleteSingle', '删除单个主题', 'Ctrl Backspace', 'Backspace', true),
    K('child', '细分主题', 'Tab', 'Tab'), K('after', '主题（之后）', 'Enter', 'Enter'), K('before', '主题（之前）', 'Shift Enter', 'Enter', false, false, true), K('parent', '上级主题', 'Ctrl Enter', 'Enter', true), K('relation', '联系', 'Ctrl Shift R', 'KeyR', true, false, true), K('boundary', '外框', 'Ctrl Shift B', 'KeyB', true, false, true), K('tags', '标签', 'Ctrl Shift L', 'KeyL', true, false, true), K('image', '图片', 'Ctrl Shift I', 'KeyI', true, false, true), K('link', '超链接', 'Ctrl K', 'KeyK', true), K('comment', '评论', 'C', 'KeyC'), K('area', '专区', 'Ctrl Alt Z', 'KeyZ', true, true), K('textOnly', '仅保留文本', 'Ctrl Shift -', 'Minus', true, false, true),
    K('edit', '编辑主题文本', 'Space', 'Space'), K('textStart', '移动到文本起始', 'Ctrl Left', 'ArrowLeft', true), K('textEnd', '移动到文本末尾', 'Ctrl Right', 'ArrowRight', true), K('bold', '粗体', 'Ctrl B', 'KeyB', true), K('italic', '斜体', 'Ctrl I', 'KeyI', true), K('fontUp', '加大字体', 'Ctrl Shift .', 'Period', true, false, true), K('fontDown', '减小字体', 'Ctrl Shift ,', 'Comma', true, false, true), K('critical', '极其重要 · 红色', 'Shift Alt 1', 'Digit1', false, true, true), K('important', '极其重要 · 橙色', 'Shift Alt 2', 'Digit2', false, true, true), K('removed', '删去', 'Shift Alt 3', 'Digit3', false, true, true), K('default', '默认', 'Shift Alt 0', 'Digit0', false, true, true), K('updateStyle', '更新默认样式', 'Ctrl Alt U', 'KeyU', true, true), K('center', '前往中心主题', 'Ctrl R', 'KeyR', true),
    ...['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].map(code => K('navigate', '移动选择框', 'Arrow', code)), ...['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].map(code => K('multiNavigate', '多选主题', 'Shift Arrow', code, false, false, true)),
    K('up', '主题上移', 'Alt Up', 'ArrowUp', false, true), K('down', '主题下移', 'Alt Down', 'ArrowDown', false, true), K('first', '移动主题到顶部', 'Ctrl Alt Up', 'ArrowUp', true, true), K('last', '移动主题到底部', 'Ctrl Alt Down', 'ArrowDown', true, true), K('fold', '折叠/展开细分主题', 'Ctrl /', 'Slash', true), K('foldBranches', '折叠/展开子分支', 'Ctrl Alt /', 'Slash', true, true), K('isolate', '仅显示该分支', 'Ctrl ;', 'Semicolon', true), K('zoomIn', '放大', 'Ctrl =', 'Equal', true), K('zoomOut', '缩小', 'Ctrl -', 'Minus', true), K('actual', '实际尺寸', 'Ctrl 0', 'Digit0', true), K('format', '显示/隐藏格式面板', 'Ctrl ]', 'BracketRight', true)
];
export function shortcut(e: Key): Command | undefined { return SHORTCUTS.find(k => k.code === e.code && !!k.ctrl === !!(e.ctrlKey || e.metaKey) && !!k.alt === !!e.altKey && !!k.shift === !!e.shiftKey)?.command; }
