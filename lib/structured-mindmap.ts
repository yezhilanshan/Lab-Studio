import type { CanvasScene } from './mindmap-scene';
import { covering, spatialIndex } from './mindmap-spatial';
type TopicStructure = {
    id: string;
    parentId: string | null;
    order: number;
    title: string;
    recordId?: string;
    status: string;
    notes: string;
    next: string;
    evidence: string;
    base?: Record<string, string>;
    missing?: boolean;
};
type TopicView = { x: number; y: number; width: number; height: number; collapsed: boolean; positionLocked?: boolean };
export type Topic = TopicStructure & TopicView;
export type SyncChange = {
    key: string;
    topicId: string;
    recordId: string;
    field: string;
    before: string;
    canvas: string;
    remote: string;
    conflict: boolean;
    direction: 'pull' | 'push';
};
const shapes = new Set(['rectangle', 'ellipse', 'diamond']);
const value = (x: unknown) => String(x ?? '');
function meta(e: any) { return e.customData?.mindmap || {}; }
function topicMetadata(e: any, topic: Partial<Topic>) {
    // Legacy scenes mirrored geometry and label text in customData. Geometry and the bound label
    // already round-trip through Excalidraw, so keep only their single persisted representation.
    const { id, title, x, y, width, height, ...metadata } = { ...meta(e), ...topic };
    return metadata;
}
function patch(e: any, props: any) { if (Object.keys(props).every(k => JSON.stringify(e[k]) === JSON.stringify(props[k])))
    return e; return { ...e, ...props, version: (e.version || 0) + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now() }; }
function labelGeometry(text: string, e: any, topic: Topic) {
    const font = e.fontSize || 18, maxWidth = topic.width - 24, lines: string[] = [];
    let line = '', width = 0;
    const measure = (c: string) => c.charCodeAt(0) > 255 ? font : font * .6;
    for (const c of text) {
        if (c === '\n') {
            lines.push(line);
            line = '';
            width = 0;
            continue;
        }
        const w = measure(c);
        if (width + w > maxWidth && line) {
            lines.push(line);
            line = '';
            width = 0;
        }
        line += c;
        width += w;
    }
    lines.push(line);
    const height = lines.length * font * (e.lineHeight || 1.25), labelWidth = Math.min(maxWidth, Math.max(...lines.map(l => [...l].reduce((sum, c) => sum + measure(c), 0)), 1));
    return { text: lines.join('\n'), originalText: text, height, width: labelWidth, x: topic.x + (topic.width - labelWidth) / 2, y: topic.y + (topic.height - height) / 2 };
}
/** 一级分支配色：珊瑚红、暖橙、琥珀金、靛紫、翡翠绿、湖蓝、玫粉、香芋紫。 */
export const BRANCH_COLORS = ['#e5483c', '#ee9c46', '#efcf1f', '#5b57c8', '#20a06b', '#4c70e8', '#c4668f', '#8b7bc7'];

/** 为每个主题返回所属一级分支的颜色；中心主题本身不参与。 */
export function branchPalette(ns: Topic[]): Map<string, string> {
    const children = new Map<string, Topic[]>();
    for (const n of ns)
        if (n.parentId) {
            const list = children.get(n.parentId);
            if (list)
                list.push(n);
            else
                children.set(n.parentId, [n]);
        }
    const colors = new Map<string, string>();
    for (const root of ns.filter(n => !n.parentId))
        (children.get(root.id) || []).forEach((main, i) => {
            const color = BRANCH_COLORS[i % BRANCH_COLORS.length], stack = [main.id];
            while (stack.length) {
                const id = stack.pop()!;
                if (colors.has(id))
                    continue;
                colors.set(id, color);
                for (const child of children.get(id) || [])
                    stack.push(child.id);
            }
        });
    return colors;
}
const topicCache = new WeakMap<CanvasScene, Topic[]>();

export function topics(scene: CanvasScene): Topic[] {
    const cached = topicCache.get(scene);
    if (cached)
        return cached;
    const elements = scene.elements.filter(e => !e.isDeleted);
    const cards = elements.filter(e => shapes.has(e.type) && !e.customData?.mindmapDecoration);
    const ids = new Set(cards.map(e => e.id));
    const labels = new Map<string, any>(), parents = new Map<string, string>();
    for (const e of elements) {
        if (e.type === 'text' && e.containerId && !labels.has(e.containerId))
            labels.set(e.containerId, e);
        if (e.type === 'arrow' && !e.customData?.mindmapRelation && ids.has(e.startBinding?.elementId) && !parents.has(e.endBinding?.elementId))
            parents.set(e.endBinding?.elementId, e.startBinding.elementId);
    }
    const result: Topic[] = cards.map((e, i) => {
        const m = meta(e), label = labels.get(e.id), status = value(m.status ?? e.customData?.status);
        let title = label?.originalText || label?.text || '未命名主题';
        if (status && title.endsWith('\n' + status))
            title = title.slice(0, -status.length - 1);
        const parent = m.parentId !== undefined ? m.parentId : parents.get(e.id);
        return { id: e.id, parentId: ids.has(parent) ? parent : null, order: Number(m.order ?? i), collapsed: Boolean(m.collapsed),
            title, x: e.x, y: e.y, width: e.width || 240, height: e.height || 90, recordId: m.recordId || e.customData?.researchNodeId,
            status, notes: value(m.notes ?? e.customData?.notes), next: value(m.next), evidence: value(m.evidence ?? e.customData?.evidence),
            base: m.base, missing: m.missing, positionLocked: Boolean(m.positionLocked) };
    });
    const byId = new Map(result.map(n => [n.id, n])), resolved = new Set<string>();
    for (const n of result) {
        const path = new Set<string>();
        for (let p: Topic | undefined = n; p && !resolved.has(p.id); p = byId.get(p.parentId || '')) {
            if (path.has(p.id)) {
                n.parentId = null;
                // The severed node can be upstream of the cycle. Keep walking its former path on later iterations.
                resolved.add(n.id);
                break;
            }
            path.add(p.id);
        }
        if (!resolved.has(n.id))
            path.forEach(id => resolved.add(id));
    }
    result.sort((a, b) => a.order - b.order);
    topicCache.set(scene, result);
    return result;
}

const childCache = new WeakMap<Topic[], Map<string | null, Topic[]>>();
export function topicChildren(nodes: Topic[]) {
    const cached = childCache.get(nodes);
    if (cached)
        return cached;
    const children = new Map<string | null, Topic[]>();
    for (const n of nodes) {
        const list = children.get(n.parentId);
        if (list) list.push(n);
        else children.set(n.parentId, [n]);
    }
    childCache.set(nodes, children);
    return children;
}

export function descendants(nodes: Topic[], id: string) {
    const children = topicChildren(nodes), result: string[] = [], visited = new Set([id]), stack = [...(children.get(id) || [])].reverse();
    while (stack.length) {
        const n = stack.pop()!;
        if (visited.has(n.id)) continue;
        visited.add(n.id);
        result.push(n.id);
        const kids = children.get(n.id) || [];
        for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
    }
    return result;
}

export function branchRoots(nodes: Topic[], ids: string[]) {
    const byId = new Map(nodes.map(n => [n.id, n])), selected = new Set(ids);
    return nodes.filter(n => {
        if (!selected.has(n.id)) return false;
        for (let parent = n.parentId; parent; parent = byId.get(parent)?.parentId || null)
            if (selected.has(parent)) return false;
        return true;
    });
}

export function visibleTopics(scene: CanvasScene) {
    const nodes = topics(scene), children = topicChildren(nodes), hidden = new Set<string>();
    const stack = [...(children.get(null) || [])];
    while (stack.length) {
        const n = stack.pop()!;
        for (const c of children.get(n.id) || []) {
            if (n.collapsed || hidden.has(n.id)) hidden.add(c.id);
            stack.push(c);
        }
    }
    return hidden.size ? nodes.filter(n => !hidden.has(n.id)) : nodes;
}

export function changeTopology(scene: CanvasScene, changes: Map<string, Partial<Topic>>): CanvasScene {
    if (!changes.size) return scene;
    return { ...scene, elements: scene.elements.map(e => {
        const change = changes.get(e.id);
        return change ? patch(e, { customData: { ...e.customData, mindmap: topicMetadata(e, change) } }) : e;
    }) };
}

export function updateTopic(scene: CanvasScene, id: string, changes: Partial<Topic>): CanvasScene {
    const topic = topics(scene).find(n => n.id === id);
    if (!topic)
        return scene;
    const current = { ...topic, ...changes };
    let labelFound = false;
    const elements = scene.elements.map(e => { if (e.id === id)
        return patch(e, { customData: { ...e.customData, mindmap: topicMetadata(e, current) } }); if (e.type === 'text' && e.containerId === id && (changes.title !== undefined || changes.status !== undefined)) {
        labelFound = true;
        const text = current.title + (current.status ? '\n' + current.status : '');
        return patch(e, labelGeometry(text, e, current));
    } return e; });
    if ((changes.title !== undefined || changes.status !== undefined) && !labelFound) {
        const index = elements.findIndex(e => e.type === 'text' && e.containerId === id);
        const text = current.title + (current.status ? '\n' + current.status : '');
        if (index >= 0)
            elements[index] = patch(elements[index], { text, originalText: text });
        else {
            const textId = 'mm-label-' + id;
            elements.push({ id: textId, type: 'text', x: topic.x + 15, y: topic.y + 20, width: topic.width - 30, height: 50, text, originalText: text, containerId: id, fontSize: 18, fontFamily: 2, textAlign: 'center', verticalAlign: 'middle', lineHeight: 1.25, strokeColor: '#415e4f', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 1, strokeStyle: 'solid', roughness: 0, opacity: 100, angle: 0, seed: 1, version: 1, versionNonce: 1, isDeleted: false, groupIds: [], boundElements: null, updated: Date.now(), link: null, locked: false });
            const shape = elements.findIndex(e => e.id === id);
            elements[shape] = patch(elements[shape], { boundElements: [...(elements[shape].boundElements || []), { id: textId, type: 'text' }] });
        }
    }
    return { ...scene, elements };
}
export function upgradeScene(scene: CanvasScene, records: any[] = []) {
    const byId = new Map(records.map(r => [r.id, r]));
    return changeTopology(scene, new Map(topics(scene).map(n => {
        const r = byId.get(n.recordId || 'node-map-' + n.id);
        return [n.id, { ...n, ...(r ? { recordId: n.recordId || r.id } : {}), ...(!n.base && r ? { base: recordSnapshot(r), next: value(r.next) } : {}) }];
    })));
}
export function reparent(scene: CanvasScene, id: string, parentId: string | null, order?: number) { const ns = topics(scene); if (ns.find(n => n.id === id)?.recordId?.startsWith('root-') && parentId)
    throw Error('实验根主题必须保持为根节点'); if (parentId === id || descendants(ns, id).includes(parentId || ''))
    throw Error('不能把主题移入自身或后代，避免循环'); if (parentId && !ns.some(n => n.id === parentId))
    throw Error('父主题不存在'); return reconnect(updateTopic(scene, id, { parentId, order: order ?? Math.max(0, ...ns.filter(n => n.parentId === parentId).map(n => n.order)) + 1 })); }
export function translateBranch(scene: CanvasScene, id: string, dx: number, dy: number) { const ns = topics(scene), ids = new Set([id, ...descendants(ns, id)]); return reconnect({ ...scene, elements: scene.elements.map(e => ids.has(e.id) || ids.has(e.containerId) ? patch(e, { x: e.x + dx, y: e.y + dy }) : e) }); }
export function moveFromSnapshot(current: CanvasScene, base: CanvasScene, id: string, dx: number, dy: number, selected: Set<string>) { const ids = new Set(descendants(topics(base), id)); return reconnect({ ...current, elements: current.elements.map(e => { const old = base.elements.find(b => b.id === e.id); if (old && (ids.has(e.id) || ids.has(e.containerId)) && !selected.has(e.id) && !selected.has(e.containerId))
        return patch(e, { x: old.x + dx, y: old.y + dy }); return e; }) }); }
export function deleteBranch(scene: CanvasScene, id: string) { const ids = new Set([id, ...descendants(topics(scene), id)]); return { ...scene, elements: scene.elements.map(e => ids.has(e.id) || ids.has(e.containerId) || ids.has(e.startBinding?.elementId) || ids.has(e.endBinding?.elementId) ? patch(e, { isDeleted: true }) : e) }; }
export function visibleScene(scene: CanvasScene) {
    const visible = new Set(visibleTopics(scene).map(n => n.id));
    const hidden = new Set(topics(scene).filter(n => !visible.has(n.id)).map(n => n.id));
    return { ...scene, elements: scene.elements.filter(e => !hidden.has(e.id) && !hidden.has(e.containerId) && !hidden.has(e.startBinding?.elementId) && !hidden.has(e.endBinding?.elementId)) };
}
function positionSummaries(scene:CanvasScene):CanvasScene {
    let next=scene;
    for(const decoration of scene.elements.filter(e=>!e.isDeleted&&e.customData?.mindmapDecoration==='summary')){
        const d=decoration.customData,ns=topics(next),summary=ns.find(n=>n.id===d.summaryTopicId);
        if(!summary || summary.positionLocked)continue;
        const ids=new Set<string>((d.topicIds||[]).flatMap((id:string)=>[id,...descendants(ns,id)]));
        if(ids.has(summary.id))continue;
        const members=ns.filter(n=>ids.has(n.id));if(!members.length)continue;
        const x=Math.max(...members.map(n=>n.x+n.width))+130,y=(Math.min(...members.map(n=>n.y))+Math.max(...members.map(n=>n.y+n.height)))/2-summary.height/2,dx=x-summary.x,dy=y-summary.y;
        if(!dx&&!dy)continue;
        const branch=new Set([summary.id,...descendants(ns,summary.id)]);
        next={...next,elements:next.elements.map(e=>branch.has(e.id)||branch.has(e.containerId)?patch(e,{x:e.x+dx,y:e.y+dy}):e)};
    }
    return next;
}
export function reconnect(scene: CanvasScene): CanvasScene {
    scene=positionSummaries(scene);
    // Research trees always branch out of a side edge; "down" layouts explicitly opt into top/bottom edges.
    const orientation = scene.appState?.mindmapOrientation;
    const ns = topics(scene), byId = new Map(ns.map(n => [n.id, n])), pairs = new Map<string, string>();
    for (const n of ns)
        if (n.parentId)
            pairs.set(n.id, n.parentId);
    const elements = new Map(scene.elements.map(e => [e.id, e]));
    const edges = new Map<string, any>();
    for (const e of scene.elements) {
        if (e.type !== 'arrow' || e.customData?.mindmapRelation || e.isDeleted) continue;
        const parent = e.startBinding?.elementId, child = e.endBinding?.elementId;
        if (parent && pairs.get(child) === parent && !edges.has(child))
            edges.set(child, e);
        else if (e.customData?.mindmapEdge || e.id.startsWith('edge-'))
            elements.set(e.id, patch(e, { isDeleted: true }));
    }
    for (const [child, parent] of pairs) {
        const p = byId.get(parent)!, c = byId.get(child)!, old = edges.get(child);
        const baseId = 'mm-edge-' + child, existing = elements.get(baseId);
        const id = old?.id || (!existing || existing.customData?.mindmapEdge ? baseId : baseId + '-' + crypto.randomUUID());
        const vertical = orientation === 'vertical' ? true : orientation === 'horizontal' ? false : Math.abs(c.y + c.height / 2 - p.y - p.height / 2) > Math.abs(c.x + c.width / 2 - p.x - p.width / 2), right = c.x >= p.x, down = c.y >= p.y, x = vertical ? p.x + p.width / 2 : right ? p.x + p.width : p.x, y = vertical ? (down ? p.y + p.height : p.y) : p.y + p.height / 2, endX = vertical ? c.x + c.width / 2 : right ? c.x : c.x + c.width, endY = vertical ? (down ? c.y : c.y + c.height) : c.y + c.height / 2;
        const props = { x, y, width: Math.abs(endX - x), height: Math.abs(endY - y), points: [[0, 0], [endX - x, endY - y]], startBinding: { elementId: parent, focus: 0, gap: 1 }, endBinding: { elementId: child, focus: 0, gap: 1 }, customData: { ...old?.customData, mindmapEdge: true }, isDeleted: false };
        const edge = old ? patch(old, props) : { id, type: 'arrow', ...props, angle: 0, strokeColor: '#789486', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 1.5, strokeStyle: 'solid', roughness: 0, opacity: 100, seed: 1, version: 1, versionNonce: 1, updated: Date.now(), groupIds: [], boundElements: null, startArrowhead: null, endArrowhead: null, roundness: { type: 2 }, locked: false, link: null };
        elements.set(id, edge);
    }
    const refs = new Map<string, { id: string; type: string }[]>();
    for (const e of elements.values()) {
        if (e.type !== 'arrow' || e.isDeleted) continue;
        for (const id of new Set([e.startBinding?.elementId, e.endBinding?.elementId])) {
            if (!byId.has(id)) continue;
            const list = refs.get(id) || [];
            list.push({ id: e.id, type: 'arrow' });
            refs.set(id, list);
        }
    }
    return { ...scene, elements: [...elements.values()].map(e => byId.has(e.id)
        ? patch(e, { boundElements: [...(e.boundElements || []).filter((b: any) => b.type !== 'arrow'), ...(refs.get(e.id) || [])] })
        : e) };
}

export function moveBranches(scene: CanvasScene, ids: string[], dx: number, dy: number, lock = false) {
    const nodes = topics(scene), roots = branchRoots(nodes, ids);
    const moved = new Set(roots.flatMap(n => [n.id, ...descendants(nodes, n.id)]));
    const next = { ...scene, elements: scene.elements.map(e => moved.has(e.id) || moved.has(e.containerId)
        ? patch(e, { x: e.x + dx, y: e.y + dy }) : e) };
    return reconnect(lock ? changeTopology(next, new Map(roots.map(n => [n.id, { positionLocked: true }]))) : next);
}

export type BranchDrop = { targetId: string; kind: 'child' | 'before' | 'after' };

export function dropBranches(scene: CanvasScene, ids: string[], drop: BranchDrop) {
    const nodes = topics(scene), roots = branchRoots(nodes, ids), target = nodes.find(n => n.id === drop.targetId);
    if (!target || !roots.length) throw Error('拖放目标不存在');
    const excluded = new Set(roots.flatMap(n => [n.id, ...descendants(nodes, n.id)]));
    const parentId = drop.kind === 'child' ? target.id : target.parentId;
    if (excluded.has(target.id)) throw Error('不能把主题移入自身或后代，避免循环');
    if (parentId && roots.some(n => n.recordId?.startsWith('root-'))) throw Error('实验根主题必须保持为根节点');
    const siblings = (topicChildren(nodes).get(parentId) || []).filter(n => !excluded.has(n.id));
    const index = drop.kind === 'child' ? siblings.length : siblings.findIndex(n => n.id === target.id) + (drop.kind === 'after' ? 1 : 0);
    siblings.splice(index, 0, ...roots);
    const changes = new Map<string, Partial<Topic>>(siblings.map((n, order) => [n.id, { parentId, order }]));
    if (parentId) changes.set(parentId, { collapsed: false });
    const changed = changeTopology(scene, changes);
    const placed = placeNewBranches(changed, roots.filter(n => n.parentId !== parentId).map(n => n.id), drop.kind === 'child' ? undefined : target.id);
    return compactBranches(placed, new Set([parentId, ...roots.map(n => n.parentId)]), scene);
}

export function setTopicFold(scene: CanvasScene, ids: string[], collapsed?: boolean) {
    const byId = new Map(topics(scene).map(n => [n.id, n]));
    const changes = new Map<string, Partial<Topic>>(), parents = new Set<string | null>(), opened: string[] = [], closed: string[] = [];
    for (const id of ids) {
        const n = byId.get(id);
        if (!n) continue;
        const fold = collapsed ?? !n.collapsed;
        if (fold === n.collapsed) continue;
        changes.set(id, { collapsed: fold });
        if (!fold) opened.push(id);
        else {
            closed.push(id);
            if (n.parentId && byId.get(n.parentId)?.parentId) parents.add(n.parentId);
        }
    }
    if (!changes.size) return scene;
    const next = changeTopology(scene, changes);
    const compacted = parents.size ? compactBranches(next, parents, scene) : next;
    return layoutFoldChanges(compacted, scene, opened, closed);
}

export function revealTopic(scene: CanvasScene, id: string) {
    const byId = new Map(topics(scene).map(n => [n.id, n])), folded: string[] = [];
    for (let parent = byId.get(id)?.parentId; parent; parent = byId.get(parent)?.parentId)
        if (byId.get(parent)?.collapsed) folded.push(parent);
    return folded.length ? setTopicFold(scene, folded, false) : scene;
}
function movePositions(scene: CanvasScene, positions: Map<string, { x: number; y: number }>) {
    return { ...scene, elements: scene.elements.map(e => {
        const delta = positions.get(e.containerId || e.id);
        return delta ? patch(e, { x: e.x + delta.x, y: e.y + delta.y }) : e;
    }) };
}

// New or reparented branches take their parent's layout axis and their nearest sibling's column.
export function placeNewBranches(scene: CanvasScene, ids: string[], nearId?: string) {
    const ns = topics(scene), byId = new Map(ns.map(n => [n.id, n])), children = topicChildren(ns), added = new Set(ids);
    const vertical = scene.appState?.mindmapOrientation === 'vertical', shifts = new Map<string, { x: number; y: number }>();
    for (const id of ids) {
        const n = byId.get(id), parent = n?.parentId ? byId.get(n.parentId) : undefined;
        if (!n || !parent || n.positionLocked) continue;
        const siblings = (children.get(parent.id) || []).filter(s => !added.has(s.id));
        const order = siblings.findIndex(s => s.order >= n.order);
        const neighbor = (nearId && siblings.find(s => s.id === nearId)) || siblings[order < 0 ? siblings.length - 1 : order];
        const outward = parent.parentId && parent.x < (byId.get(parent.parentId)?.x ?? parent.x) ? -1 : 1;
        const x = vertical ? neighbor?.x ?? parent.x + (parent.width - n.width) / 2
            : neighbor ? (neighbor.x < parent.x ? neighbor.x + neighbor.width - n.width : neighbor.x)
            : outward < 0 ? parent.x - n.width - branchGap(parent, false) : parent.x + parent.width + branchGap(parent, false);
        const y = vertical ? neighbor?.y ?? parent.y + parent.height + branchGap(parent, true) : neighbor?.y ?? parent.y + (parent.height - n.height) / 2;
        const delta = { x: x - n.x, y: y - n.y };
        const branch = [id, ...descendants(ns, id)];
        if (!branch.some(child => byId.get(child)?.positionLocked))
            branch.forEach(child => shifts.set(child, delta));
    }
    return movePositions(scene, shifts);
}

export function compactBranches(scene: CanvasScene, parents: Set<string | null>, previous: CanvasScene = scene, centerGroups = false): CanvasScene {
    const vertical = scene.appState?.mindmapOrientation === 'vertical', gap = centerGroups ? 34 : BRANCH_GAP;
    const cross = (n: Topic) => vertical ? n.x : n.y;
    const extent = (n: Topic) => vertical ? n.width : n.height;
    const side = (n: Topic, p: Topic) => !vertical && !p.parentId && n.x + n.width / 2 < p.x + p.width / 2 ? -1 : 1;
    const ns = topics(scene), byId = new Map(ns.map(n => [n.id, n])), children = topicChildren(ns);
    const old = topics(previous), oldChildren = topicChildren(old), oldById = new Map(old.map(n => [n.id, n]));
    const summaries = new Set(scene.elements.filter(e => !e.isDeleted && e.customData?.mindmapDecoration === 'summary').map(e => e.customData.summaryTopicId));
    const bounds = (n: Topic, index: ReturnType<typeof topicChildren>, shifts?: Map<string, { x: number; y: number }>) => {
        let low = Infinity, high = -Infinity;
        const stack = [n];
        while (stack.length) {
            const t = stack.pop()!, d = shifts?.get(t.id), start = cross(t) + ((vertical ? d?.x : d?.y) || 0);
            low = Math.min(low, start);
            high = Math.max(high, start + extent(t));
            if (!t.collapsed) for (const child of index.get(t.id) || []) stack.push(child);
        }
        return { low, high };
    };
    const shifts = new Map<string, { x: number; y: number }>();
    const legacyVisible = centerGroups ? new Set(visibleTopics(scene).map(n => n.id)) : null;
    // Start at the deepest affected parent so an enclosing group sees the final child bounds.
    const depths = new Map<string, number>(), pending = (children.get(null) || []).map(n => ({ n, depth: 1 }));
    while (pending.length) {
        const { n, depth } = pending.pop()!;
        depths.set(n.id, depth);
        for (const c of children.get(n.id) || []) pending.push({ n: c, depth: depth + 1 });
    }
    const depth = (id: string | null) => id ? depths.get(id) || 0 : 0;
    const scopes = new Set(parents), visitedAncestors = new Set<string>();
    if (!centerGroups) {
        for (const id of parents) {
            for (let ancestor = id && byId.get(id)?.parentId; ancestor && !visitedAncestors.has(ancestor); ancestor = byId.get(ancestor)?.parentId) {
                visitedAncestors.add(ancestor);
                if ((children.get(ancestor)?.length || 0) > 1) scopes.add(ancestor);
            }
        }
    }
    const visibleParents = scopes.size > 1 ? new Set(visibleTopics(scene).map(n => n.id)) : null;
    for (const id of [...scopes].filter(id => !id || !visibleParents || visibleParents.has(id)).sort((a, b) => depth(b) - depth(a))) {
        const parent = id ? byId.get(id) : undefined;
        if (id && (!parent || parent.collapsed)) continue;
        const priorParent = id ? oldById.get(id) : undefined;
        const siblings = (children.get(id) || []).filter(n => !summaries.has(n.id));
        if (!siblings.length || !centerGroups && siblings.length === 1) continue;
        for (const sign of parent && !parent.parentId && !vertical ? [-1, 1] : [1]) {
            const list = siblings.filter(n => !parent || side(n, parent) === sign);
            if (!list.length) continue;
            const prior = (oldChildren.get(id) || []).filter(n => !summaries.has(n.id) && (!priorParent || side(n, priorParent) === sign));
            // Independent roots are freeform objects.
            if (!parent && prior.length) continue;
            const ranges = list.map(n => {
                const ids = [n.id, ...descendants(ns, n.id)];
                return { ...bounds(n, children, shifts), id: n.id, ids, fixed: ids.some(k => byId.get(k)?.positionLocked) };
            });
            const oldRanges = prior.map(n => ({ ...bounds(n, oldChildren), id: n.id }));
            const equal = (a: typeof oldRanges[number], b?: typeof oldRanges[number]) => b && a.id === b.id && a.low === b.low && a.high === b.high;
            const shift = (range: typeof ranges[number], delta: number) => {
                if (!delta) return;
                for (const k of range.ids) {
                    if (centerGroups && !legacyVisible?.has(k)) continue;
                    const prior = shifts.get(k) || { x: 0, y: 0 };
                    shifts.set(k, vertical ? { x: prior.x + delta, y: prior.y } : { x: prior.x, y: prior.y + delta });
                }
            };
            if (!centerGroups && !parents.has(id)) {
                // Ancestor groups only resolve new collisions. Keep neighboring branches stationary
                // and use the nearest free space for the branch whose footprint changed.
                const before = new Map(oldRanges.map(r => [r.id, r]));
                const changed = ranges.filter(r => !r.fixed && !equal(r, before.get(r.id)));
                const dirty = new Set(changed.map(r => r.id));
                const occupied = ranges.filter(r => !dirty.has(r.id)).map(r => ({ low: r.low, high: r.high }));
                for (const range of changed) {
                    let low = range.low;
                    if (occupied.some(r => r.low < range.high && r.high > range.low)) {
                        const span = range.high - range.low;
                        const sorted = [...occupied].sort((a, b) => a.low - b.low);
                        let start = -Infinity, distance = Infinity;
                        for (const r of [...sorted, { low: Infinity, high: Infinity }]) {
                            const end = r.low - gap - span;
                            if (end >= start) {
                                const candidate = Math.max(start, Math.min(range.low, end));
                                if (Math.abs(candidate - range.low) < distance) {
                                    distance = Math.abs(candidate - range.low);
                                    low = candidate;
                                }
                            }
                            start = Math.max(start, r.high + gap);
                        }
                        shift(range, low - range.low);
                    }
                    occupied.push({ low, high: low + range.high - range.low });
                }
                continue;
            }
            let first = 0;
            if (!centerGroups) {
                while (first < ranges.length && equal(ranges[first], oldRanges[first])) first++;
                if (first === ranges.length) continue;
            }
            const total = ranges.reduce((sum, range) => sum + range.high - range.low, 0) + (ranges.length - 1) * gap;
            let cursor = centerGroups && parent ? cross(parent) + (extent(parent) - total) / 2
                : first ? ranges[first - 1].high + gap
                : oldRanges.length ? Math.min(...oldRanges.map(r => r.low)) : Math.min(...ranges.map(r => r.low));
            const obstacles = ranges.filter(r => r.fixed).sort((a, b) => a.low - b.low);
            let obstacle = 0;
            for (const range of ranges.slice(first)) {
                if (range.fixed) continue;
                const span = range.high - range.low;
                while (obstacle < obstacles.length && obstacles[obstacle].low < cursor + span + gap) {
                    cursor = Math.max(cursor, obstacles[obstacle].high + gap);
                    obstacle++;
                }
                shift(range, cursor - range.low);
                cursor += span + gap;
            }
        }
    }
    return reconnect(movePositions(scene, shifts));
}

export type LayoutDirection = 'right' | 'down' | 'balanced';
const BRANCH_GAP = 22;
type BranchSide = -1 | 1;
type TopicChildren = (node: Topic) => Topic[];

function branchGap(parent: Topic, vertical: boolean) {
    if (vertical) return parent.parentId ? 56 : 72;
    return parent.parentId ? 60 : 82;
}

function visibleChildren(scene: CanvasScene): TopicChildren {
    const children = topicChildren(topics(scene));
    return n => n.collapsed ? [] : children.get(n.id) || [];
}

type BranchExtent = { before: number; after: number };
type BranchExtentOf = (n: Topic) => BranchExtent;
const halfCard = (n: Topic, vertical: boolean) => (vertical ? n.width : n.height) / 2;

function packForest(nodes: Topic[], extentOf: BranchExtentOf, vertical: boolean) {
    const centers: number[] = [];
    let end = 0;
    for (const n of nodes) {
        const { before, after } = extentOf(n);
        centers.push(end + before);
        end += before + after + BRANCH_GAP;
    }
    if (!nodes.length) return { centers, before: 0, after: 0 };
    // Center the visible first and last child cards on their parent. The entire
    // subtree can extend farther on either side, so reserve that space separately.
    const center = (centers[0] - halfCard(nodes[0], vertical) + centers.at(-1)! + halfCard(nodes.at(-1)!, vertical)) / 2;
    return { centers: centers.map(p => p - center), before: center, after: end - BRANCH_GAP - center };
}

function layoutExtents(roots: Topic[], kids: TopicChildren, vertical: boolean): BranchExtentOf {
    const extents = new Map<string, BranchExtent>();
    const stack = roots.map(n => ({ n, visited: false }));
    while (stack.length) {
        const { n, visited } = stack.pop()!, children = kids(n);
        if (!visited && children.length) {
            stack.push({ n, visited: true });
            for (const c of children) stack.push({ n: c, visited: false });
        } else {
            const { before, after } = packForest(children, c => extents.get(c.id)!, vertical);
            const half = halfCard(n, vertical);
            extents.set(n.id, { before: Math.max(half, before), after: Math.max(half, after) });
        }
    }
    return n => extents.get(n.id)!;
}

function splitBalanced(branches: Topic[], extentOf: BranchExtentOf) {
    const span = (n: Topic) => { const extent = extentOf(n); return extent.before + extent.after; };
    const left: Topic[] = [], right: Topic[] = [];
    let leftSpan = 0, rightSpan = 0;
    for (const branch of [...branches].sort((a, b) => span(b) - span(a))) {
        if (leftSpan < rightSpan) {
            left.push(branch);
            leftSpan += span(branch) + BRANCH_GAP;
        } else {
            right.push(branch);
            rightSpan += span(branch) + BRANCH_GAP;
        }
    }
    return [left.sort((a, b) => a.order - b.order), right.sort((a, b) => a.order - b.order)];
}

function arrangeForest(roots: Topic[], anchor: Topic | undefined, side: BranchSide, vertical: boolean, kids: TopicChildren, extentOf: BranchExtentOf, keepBranchColumns = false) {
    const stack: { n: Topic; entry: number; center: number }[] = [], placed: Topic[] = [];
    function queue(nodes: Topic[], parent?: Topic, keepColumn = false) {
        const center = !parent ? 0 : vertical ? parent.x + parent.width / 2 : parent.y + parent.height / 2;
        const gap = parent ? branchGap(parent, vertical) : 0;
        const entry = !parent ? 0 : vertical ? parent.y + parent.height + gap
            : side === 1 ? parent.x + parent.width + gap : parent.x - gap;
        const { centers } = packForest(nodes, extentOf, vertical);
        nodes.forEach((n, i) => {
            const previousEntry = vertical ? n.y : side === 1 ? n.x : n.x + n.width;
            const clearance = gap + (previousEntry - entry) * side;
            stack.push({ n, entry: keepColumn && clearance >= 32 ? previousEntry : entry, center: center + centers[i] });
        });
    }
    queue(roots, anchor, keepBranchColumns);
    while (stack.length) {
        const { n, entry, center } = stack.pop()!;
        const centered = center - halfCard(n, vertical);
        const positioned = vertical ? { ...n, x: centered, y: entry }
            : { ...n, x: side === 1 ? entry : entry - n.width, y: centered };
        placed.push(positioned);
        queue(kids(n), positioned);
    }
    return placed;
}

function layoutFoldChanges(scene: CanvasScene, previous: CanvasScene, opened: string[], closed: string[]) {
    const nodes = topics(scene), byId = new Map(nodes.map(n => [n.id, n])), kids = visibleChildren(scene);
    const vertical = scene.appState?.mindmapOrientation === 'vertical', mode = scene.appState?.mindmapLayoutDirection;
    const visible = visibleTopics(scene), visibleIds = new Set(visible.map(n => n.id));
    const anchors = branchRoots(nodes, opened.filter(id => visibleIds.has(id)));
    if (!anchors.length && !closed.some(id => visibleIds.has(id))) return reconnect(scene);
    const centerX = (n: Topic) => n.x + n.width / 2;
    const sideOf = (n: Topic, parent: Topic): BranchSide => !vertical && mode !== 'right' && centerX(n) < centerX(parent) ? -1 : 1;
    const roots = topicChildren(nodes).get(null) || [];
    const extentOf = layoutExtents(roots, kids, vertical);
    const placed = new Map<string, Topic>();
    const addForest = (branches: Topic[], anchor: Topic, side: BranchSide, keepColumns = false) => {
        for (const n of arrangeForest(branches, anchor, side, vertical, kids, extentOf, keepColumns)) placed.set(n.id, n);
    };
    for (const anchor of anchors) {
        const branches = kids(anchor);
        if (anchor.parentId) {
            addForest(branches, anchor, sideOf(anchor, byId.get(anchor.parentId)!));
        } else {
            let left = branches.filter(n => sideOf(n, anchor) < 0);
            let right = branches.filter(n => sideOf(n, anchor) > 0);
            if (!vertical && mode === 'balanced' && (!left.length || !right.length))
                [left, right] = splitBalanced(branches, extentOf);
            addForest(left, anchor, -1);
            addForest(right, anchor, 1);
        }
    }

    // A collision between two child groups is solved at their owning branch level.
    // Arrange that side together so every parent and its children move as a unit.
    const projected = (n: Topic) => placed.get(n.id) || n;
    const owners = new Map<string, { root: Topic; side: BranchSide }>();
    const affected = new Map<string, Set<BranchSide>>();
    const independent = new Set<string>();
    for (const root of roots) {
        const pending = kids(root).map(n => ({ n, side: sideOf(projected(n), root) }));
        while (pending.length) {
            const { n, side } = pending.pop()!;
            owners.set(n.id, { root, side });
            for (const c of kids(n)) pending.push({ n: c, side });
        }
    }
    const lookup = spatialIndex(visible.map(projected));
    const mark = ({ root, side }: { root: Topic; side: BranchSide }) => {
        const sides = affected.get(root.id) || new Set<BranchSide>();
        sides.add(side);
        affected.set(root.id, sides);
    };
    if (closed.length) {
        const old = topics(previous), oldById = new Map(old.map(n => [n.id, n]));
        const oldExtent = layoutExtents(topicChildren(old).get(null) || [], visibleChildren(previous), vertical);
        const checked = new Set<string>();
        const crossCenter = (n: Topic) => vertical ? centerX(n) : n.y + n.height / 2;
        for (const id of closed) {
            const owner = owners.get(id);
            if (!owner) continue;
            const key = owner.root.id + ':' + owner.side;
            if (checked.has(key)) continue;
            checked.add(key);
            const siblings = kids(owner.root).filter(n => owners.get(n.id)?.side === owner.side);
            if (siblings.length < 2) continue;
            const center = crossCenter(owner.root), before = packForest(siblings, oldExtent, vertical).centers;
            // Release space that a previous automatic layout reserved. Keep
            // freeform groups in place when they were never packed this way.
            const wasPacked = siblings.every((n, i) => Math.abs(crossCenter(oldById.get(n.id)!) - center - before[i]) < .01);
            const after = packForest(siblings, extentOf, vertical).centers;
            if (wasPacked && after.some((p, i) => p !== before[i])) mark(owner);
        }
    }
    for (const n of placed.values()) {
        const owner = owners.get(n.id);
        if (!owner) continue;
        const area = vertical ? { ...n, x: n.x - BRANCH_GAP, width: n.width + BRANCH_GAP * 2 }
            : { ...n, y: n.y - BRANCH_GAP, height: n.height + BRANCH_GAP * 2 };
        for (const other of lookup(area)) {
            if (other.id === n.id) continue;
            const overlapsMain = vertical ? n.y < other.y + other.height && other.y < n.y + n.height
                : n.x < other.x + other.width && other.x < n.x + n.width;
            const crossGap = vertical ? Math.max(n.x - other.x - other.width, other.x - n.x - n.width)
                : Math.max(n.y - other.y - other.height, other.y - n.y - n.height);
            if (!overlapsMain || crossGap >= BRANCH_GAP) continue;
            const neighbor = owners.get(other.id);
            if (neighbor?.root.id === owner.root.id) {
                mark(owner);
                mark(neighbor);
            } else if (other.id === owner.root.id) {
                mark(owner);
            } else {
                independent.add(owner.root.id);
            }
        }
    }
    for (const [id, sides] of affected) {
        const root = byId.get(id)!;
        for (const side of sides) addForest(kids(root).filter(n => owners.get(n.id)?.side === side), root, side, true);
    }

    // Separate freeform maps can overlap as a tree grows. Shift the whole tree,
    // including its center topic, to preserve the geometry of every branch.
    if (roots.length > 1) {
        for (const id of independent) {
            const group = visible.filter(n => n.id === id || owners.get(n.id)?.root.id === id).map(projected);
            const obstacles = visible.filter(n => n.id !== id && owners.get(n.id)?.root.id !== id).map(projected);
            const delta = clearSpace(group, obstacles, vertical);
            for (const n of group) {
                placed.set(n.id, { ...n, x: n.x + (vertical ? delta : 0), y: n.y + (vertical ? 0 : delta) });
            }
        }
    }
    const shifts = new Map([...placed].map(([id, n]) => {
        const before = byId.get(id)!;
        return [id, { x: n.x - before.x, y: n.y - before.y }];
    }));
    return reconnect(movePositions(scene, shifts));
}

/** Find the closest clear cross-axis position for an independent tree. */
function clearSpace(group: Topic[], obstacles: Topic[], vertical: boolean) {
    const mainStart = (n: Topic) => vertical ? n.y : n.x;
    const mainEnd = (n: Topic) => vertical ? n.y + n.height : n.x + n.width;
    const crossStart = (n: Topic) => vertical ? n.x : n.y;
    const crossEnd = (n: Topic) => vertical ? n.x + n.width : n.y + n.height;
    if (!obstacles.length) return 0;
    const lanes = new Map<string, { start: number; end: number; low: number; high: number }>();
    for (const n of group) {
        const start = mainStart(n), end = mainEnd(n), key = start + ':' + end;
        const lane = lanes.get(key);
        if (lane) {
            lane.low = Math.min(lane.low, crossStart(n));
            lane.high = Math.max(lane.high, crossEnd(n));
        } else {
            lanes.set(key, { start, end, low: crossStart(n), high: crossEnd(n) });
        }
    }
    const bounds = covering(obstacles), lookup = spatialIndex(obstacles);
    const gaps: { low: number; high: number }[] = [];
    for (const { start, end, low, high } of lanes.values()) {
        const stripe = vertical ? { ...bounds, y: start, height: end - start } : { ...bounds, x: start, width: end - start };
        for (const n of lookup(stripe)) {
            if (mainStart(n) < end && mainEnd(n) > start)
                gaps.push({ low: crossStart(n) - high - BRANCH_GAP, high: crossEnd(n) - low + BRANCH_GAP });
        }
    }
    gaps.sort((a, b) => a.low - b.low);
    // Each interval describes a forbidden translation. Only the merged interval
    // that contains zero matters, since its two ends are the nearest free slots.
    let blocked = { low: -Infinity, high: -Infinity };
    for (const range of gaps) {
        if (range.low > blocked.high) {
            if (blocked.low < 0 && blocked.high > 0) break;
            if (range.low >= 0) return 0;
            blocked = range;
        } else {
            blocked.high = Math.max(blocked.high, range.high);
        }
    }
    if (blocked.low >= 0 || blocked.high <= 0) return 0;
    return Math.abs(blocked.low) < blocked.high ? blocked.low : blocked.high;
}

export function layoutTopics(scene: CanvasScene, direction: LayoutDirection = 'right') {
    const ns = topics(scene), children = topicChildren(ns), vertical = direction === 'down', kids = visibleChildren(scene);
    const summaries = new Set(scene.elements.filter(e => !e.isDeleted && e.customData?.mindmapDecoration === 'summary').map(e => e.customData.summaryTopicId));
    const roots = (children.get(null) || []).filter(n => !summaries.has(n.id));
    const extentOf = layoutExtents(roots, kids, vertical), byId = new Map(ns.map(n => [n.id, n]));
    const shifts = new Map<string, { x: number; y: number }>();
    let top = 70;
    for (const root of roots) {
        let placed: Topic[];
        if (direction === 'balanced') {
            const anchor = { ...root, x: 0, y: -root.height / 2 };
            const [left, right] = splitBalanced(kids(root), extentOf);
            placed = [anchor, ...arrangeForest(left, anchor, -1, false, kids, extentOf), ...arrangeForest(right, anchor, 1, false, kids, extentOf)];
        } else {
            placed = arrangeForest([root], undefined, 1, vertical, kids, extentOf);
        }
        const minX = Math.min(...placed.map(n => n.x)), minY = Math.min(...placed.map(n => n.y));
        for (const n of placed) {
            const old = byId.get(n.id)!;
            shifts.set(n.id, { x: n.x + 70 - minX - old.x, y: n.y + top - minY - old.y });
        }
        top += Math.max(...placed.map(n => n.y + n.height)) - minY + 108;
    }
    const next = movePositions(scene, shifts);
    return reconnect({ ...next, appState: { ...scene.appState, mindmapOrientation: vertical ? 'vertical' : 'horizontal', mindmapLayoutDirection: direction } });
}
export function compactLayout(scene: CanvasScene): CanvasScene {
    return compactBranches(scene, new Set(topics(scene).filter(n => !n.parentId).map(n => n.id)), scene, true);
}
export function recordSnapshot(r: any) { return Object.fromEntries(['title', 'parent', 'status', 'notes', 'next', 'evidence'].map(f => [f, value(r[f])])); }
export function prepareRecordWrites<T extends { id: string }>(planned: T[], preview: T[], fresh: T[]): T[] {
    const baseline = new Map(preview.map(r => [r.id, r])), latest = new Map(fresh.map(r => [r.id, r]));
    return planned.map(row => {
        const before: any = baseline.get(row.id), now: any = latest.get(row.id);
        if (!before) {
            if (!now) return row;
            if (!now.deleted && now.kind === (row as any).kind && now.idea === (row as any).idea &&
                Object.entries(recordSnapshot(row)).every(([f, v]) => v === value(now[f])))
                return now;
            throw Error('新节点已被其他操作创建或移除，请重新预览');
        }
        if (!now || now.deleted || now.kind !== before.kind || now.idea !== before.idea)
            throw Error('实验记录已被移除或移动，请重新预览');
        const changed = Object.entries(row).filter(([f, v]) => value(v) !== value(before[f]));
        for (const [f, v] of changed)
            if (value(now[f]) !== value(before[f]) && value(now[f]) !== value(v))
                throw Error('实验记录在预览后发生修改，请重新预览');
        return { ...now, ...Object.fromEntries(changed) };
    });
}

function topicFields(n: Topic, byId: Map<string, Topic>, idea: string) { const parent = byId.get(n.parentId || ''); return { title: n.title, parent: parent ? (parent.recordId || 'node-map-' + parent.id) : (n.recordId === 'root-' + idea ? '' : 'root-' + idea), status: n.status || '计划中', notes: n.notes, next: n.next, evidence: n.evidence }; }
export function topicSyncState(n: Topic, byId: Map<string, Topic>, idea: string) {
    if (n.missing) return '关联失效';
    if (!n.recordId || !n.base) return '待同步';
    const fields = topicFields(n, byId, idea);
    return Object.entries(fields).some(([f, v]) => !(n.recordId?.startsWith('root-') && (f === 'parent' || f === 'title')) && value(v) !== value(n.base?.[f]))
        ? '待同步' : '已同步';
}

export function syncPlan(scene: CanvasScene, records: any[], direction: 'pull' | 'push', idea: string): SyncChange[] {
    records = records.filter(r => r.kind === 'node' && r.idea === idea);
    const ns = topics(scene), byId = new Map(ns.map(n => [n.id, n])), active = new Map(records.filter(r => !r.deleted).map(r => [r.id, r]));
    const linked = new Set(ns.map(n => n.recordId)), changes: SyncChange[] = [];
    for (const n of ns) {
        const local = topicFields(n, byId, idea), remote = active.get(n.recordId);
        if (!n.recordId) {
            if (direction === 'push')
                changes.push({ key: n.id + ':new', topicId: n.id, recordId: 'node-map-' + n.id, field: 'new', before: '', canvas: n.title, remote: '', conflict: false, direction });
            continue;
        }
        if (!remote) {
            changes.push({ key: n.id + ':missing', topicId: n.id, recordId: n.recordId, field: 'missing', before: '', canvas: n.title, remote: '记录不存在 / 已移除', conflict: false, direction });
            continue;
        }
        const base = n.base || recordSnapshot(remote);
        for (const f of ['title', 'parent', 'status', 'notes', 'next', 'evidence'] as const) {
            if (n.recordId === 'root-' + idea && (f === 'parent' || f === 'title'))
                continue;
            const a = value(local[f]), b = value(remote[f]), old = value(base[f]);
            if (a === b)
                continue;
            const changedLocal = a !== old, changedRemote = b !== old;
            if (direction === 'pull' ? !changedRemote : !changedLocal)
                continue;
            changes.push({ key: n.id + ':' + f, topicId: n.id, recordId: n.recordId, field: f, before: old, canvas: a, remote: b, conflict: changedLocal && changedRemote, direction });
        }
    }
    if (direction === 'pull')
        for (const r of records.filter(r => !r.deleted)) {
            if (!linked.has(r.id))
                changes.push({ key: r.id + ':new', topicId: r.id, recordId: r.id, field: 'new', before: '', canvas: '', remote: r.title, conflict: false, direction });
        }
    return changes;
}
