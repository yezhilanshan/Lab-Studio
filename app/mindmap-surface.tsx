'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject, PointerEvent as ReactPointerEvent } from 'react';
import type { CanvasScene } from '../lib/mindmap-scene';
import type { MindmapTools, MapView } from './use-mindmap-tools';
import * as M from '../lib/structured-mindmap';
import * as A from '../lib/mindmap-actions';
import { covering, intersects, spatialIndex } from '../lib/mindmap-spatial';
import { gestureKind, opensContextMenu, pinchViewport, type PinchAnchor } from '../lib/mindmap-gesture';
import { TopicExtras } from './mindmap-extras-ui';
type Props = {
    scene: CanvasScene;
    tools: MindmapTools;
    view: MutableRefObject<MapView | null>;
    commit: (s: CanvasScene) => void;
    zoomChanged: (zoom: number) => void;
    svgRef: MutableRefObject<SVGSVGElement | null>;
    exporting: boolean;
    idea?: string;
};
type Point = {
    x: number;
    y: number;
};
type Gesture = {
    kind: 'pan' | 'marquee' | 'drag' | 'pinch';
    longPress: boolean;
    pointerType: string;
    pinch?: PinchAnchor;
    start: Point;
    world: Point;
    origin: Point;
    scene: CanvasScene;
    ids: string[];
    primary?: string;
    additive: boolean;
    startSelection: string[];
    moved: boolean;
    pointerId: number;
    moving: Set<string>;
    primaryRoot?: string;
    roots: M.Topic[];
};
/** 把颜色向白色混合，用于二级主题的浅色底。 */
function tint(hex: string, amount: number) {
    const value = parseInt(hex.slice(1), 16);
    return '#' + [value >> 16 & 255, value >> 8 & 255, value & 255].map(c => Math.round(c + (255 - c) * amount).toString(16).padStart(2, '0')).join('');
}
/** 把颜色向黑色混合，用于浅色底上的分支色文字。 */
function shade(hex: string, amount: number) {
    const value = parseInt(hex.slice(1), 16);
    return '#' + [value >> 16 & 255, value >> 8 & 255, value & 255].map(c => Math.round(c * (1 - amount)).toString(16).padStart(2, '0')).join('');
}
/** 直角分支线：父主题先水平出线，再沿兄弟节点共用的竖干上下，最后水平接入子主题。 */
function elbowPath(x1: number, y1: number, x2: number, y2: number, vertical: boolean) {
    if (vertical ? Math.abs(x2 - x1) < .5 : Math.abs(y2 - y1) < .5)
        return `M${x1},${y1} L${x2},${y2}`;
    const r = Math.min(12, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2);
    if (!vertical) {
        const mid = (x1 + x2) / 2, dx = Math.sign(x2 - x1), dy = Math.sign(y2 - y1);
        return `M${x1},${y1} H${mid - dx * r} Q${mid},${y1} ${mid},${y1 + dy * r} V${y2 - dy * r} Q${mid},${y2} ${mid + dx * r},${y2} H${x2}`;
    }
    const mid = (y1 + y2) / 2, dx = Math.sign(x2 - x1), dy = Math.sign(y2 - y1);
    return `M${x1},${y1} V${mid - dy * r} Q${x1},${mid} ${x1 + dx * r},${mid} H${x2 - dx * r} Q${x2},${mid} ${x2},${mid + dy * r} V${y2}`;
}
export function MindmapSurface({ scene, tools, view, commit, zoomChanged, svgRef, exporting, idea }: Props) {
    const host = useRef<HTMLDivElement>(null), [viewport, setViewport] = useState({ x: 90, y: 70, k: 1 }), [size, setSize] = useState({ width: 1000, height: 680 }), [preview, setPreview] = useState<{ offset: Point; ids: Set<string> } | null>(null), [marquee, setMarquee] = useState<{
        x: number;
        y: number;
        width: number;
        height: number;
    } | null>(null), [drop, setDrop] = useState<M.BranchDrop | null>(null), [editing, setEditing] = useState<string | null>(null), [draft, setDraft] = useState('');
    const text = useRef<HTMLTextAreaElement>(null), gesture = useRef<Gesture | null>(null), viewportRef = useRef(viewport);
    viewportRef.current = viewport;
    const current = useRef({ scene, tools, size, commit });
    current.current = { scene, tools, size, commit };
    const displayed = scene, all = M.topics(scene), children = M.topicChildren(all);
    const byId = useMemo(() => new Map(all.map(n => [n.id, n])), [all]);
    const branchColor = useMemo(() => M.branchPalette(all), [all]);
    const allowed = useMemo(() => {
        const isolation = tools.isolated ? new Set([tools.isolated, ...M.descendants(all, tools.isolated)]) : null;
        return M.visibleTopics(scene).filter(n => !isolation || isolation.has(n.id));
    }, [scene, all, tools.isolated]);
    const visibleIds = useMemo(() => new Set(allowed.map(n => n.id)), [allowed]);
    const lookup = useMemo(() => spatialIndex(allowed), [allowed]);
    const shapes = useMemo(() => new Map(scene.elements.map(e => [e.id, e])), [scene]);
    const overlays = useMemo(() => scene.elements.filter(e => !e.isDeleted && (e.customData?.mindmapDecoration || e.customData?.mindmapRelation)), [scene]);
    const candidate = useRef<M.BranchDrop | null>(null), dropTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const armed = useRef<M.BranchDrop | null>(null), frame = useRef(0), composition = useRef(false);
    const pointers = useRef(new Map<number, Point>()), pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const viewBox = { x: (-viewport.x - 110) / viewport.k, y: (-viewport.y - 110) / viewport.k, width: (size.width + 220) / viewport.k, height: (size.height + 220) / viewport.k };
    const offset = preview?.offset;
    const projected = (n: M.Topic) => preview?.ids.has(n.id) && offset ? { ...n, x: n.x + offset.x, y: n.y + offset.y } : n;
    const visible = exporting ? allowed : lookup(viewBox).filter(n => !preview?.ids.has(n.id));
    if (!exporting && offset) {
        const shiftedBox = { ...viewBox, x: viewBox.x - offset.x, y: viewBox.y - offset.y };
        visible.push(...lookup(shiftedBox).filter(n => preview.ids.has(n.id)).map(projected));
    }
    if (!exporting && editing && visibleIds.has(editing) && !visible.some(n => n.id === editing))
        visible.push(projected(byId.get(editing)!));
    const nodeAt = (id: string) => { const node = byId.get(id); return node && projected(node); };
    const selectedIds = useMemo(() => new Set(tools.selected), [tools.selected]);
    const [minimap, setMinimap] = useState(false);
    const lite = !exporting && viewport.k < .22;
    const edgeBounds = (a: M.Topic, b: M.Topic) => {
        const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
        return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
    };
    const edges = useMemo(() => allowed.flatMap(n => {
        const p = n.parentId && visibleIds.has(n.parentId) ? byId.get(n.parentId) : null;
        return p ? [{ ...edgeBounds(n, p), child: n, parent: p }] : [];
    }), [allowed, visibleIds, byId]);
    const edgeLookup = useMemo(() => spatialIndex(edges), [edges]);
    const renderedEdges = exporting ? edges : preview ? edges.flatMap(({ child, parent }) => {
        const c = projected(child), p = projected(parent), bounds = edgeBounds(c, p);
        return intersects(bounds, viewBox) ? [{ ...bounds, child: c, parent: p }] : [];
    }) : edgeLookup(viewBox);
    function fit(ids?: string[]) {
        const wanted = ids && new Set(ids);
        const ns = M.visibleTopics(current.current.scene).filter(n => !wanted || wanted.has(n.id));
        if (!ns.length)
            return;
        const b = A.topicBounds(ns), { width, height } = current.current.size, k = Math.max(.04, Math.min(1.25, (width - 150) / Math.max(1, b.width), (height - 150) / Math.max(1, b.height)));
        setViewport({ x: (width - b.width * k) / 2 - b.x * k, y: (height - b.height * k) / 2 - b.y * k, k });
    }
    function center(id: string, minimumZoom = 0) {
        const n = M.topics(current.current.scene).find(n => n.id === id);
        if (!n)
            return;
        setViewport(v => {
            const k = Math.max(v.k, minimumZoom);
            return { k, x: current.current.size.width / 2 - (n.x + n.width / 2) * k, y: current.current.size.height / 2 - (n.y + n.height / 2) * k };
        });
    }
    function zoom(factor: number, anchor?: Point) { setViewport(v => { const k = Math.max(.04, Math.min(4, v.k * factor)), p = anchor || { x: current.current.size.width / 2, y: current.current.size.height / 2 }; return { k, x: p.x - (p.x - v.x) * k / v.k, y: p.y - (p.y - v.y) * k / v.k }; }); }
    useEffect(() => {
        view.current = { fit, center, zoom, actual: () => { const v = viewportRef.current; zoom(1 / v.k); }, edit: id => {
                const n = M.topics(current.current.scene).find(n => n.id === id);
                if (n) {
                    setEditing(id);
                    setDraft(n.title);
                    center(id);
                }
            } };
        return () => { view.current = null; };
    }, []);
    useEffect(() => {
        const ro = new ResizeObserver(entries => { const r = entries[0].contentRect; setSize({ width: r.width, height: r.height }); });
        if (host.current)
            ro.observe(host.current);
        return () => ro.disconnect();
    }, []);
    useEffect(() => () => { if (dropTimer.current) clearTimeout(dropTimer.current); if (pressTimer.current) clearTimeout(pressTimer.current); cancelAnimationFrame(frame.current); }, []);
    useEffect(() => { zoomChanged(viewport.k); }, [viewport.k]);
    useEffect(() => {
        composition.current = false;
        if (editing) {
            text.current?.focus();
            text.current?.select();
        }
    }, [editing]);
    useEffect(() => { const t = setTimeout(() => fit(), 80); return () => clearTimeout(t); }, []);
    useEffect(() => {
        const el = host.current;
        if (!el)
            return;
        const wheel = (e: WheelEvent) => {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) {
                const r = el.getBoundingClientRect();
                zoom(Math.exp(-e.deltaY * .003), { x: e.clientX - r.left, y: e.clientY - r.top });
            }
            else
                setViewport(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
        };
        el.addEventListener('wheel', wheel, { passive: false });
        return () => el.removeEventListener('wheel', wheel);
    }, []);
    function point(e: {
        clientX: number;
        clientY: number;
    }) { const r = host.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function toWorld(p: Point) { const v = viewportRef.current; return { x: (p.x - v.x) / v.k, y: (p.y - v.y) / v.k }; }
    function finishText(cancel = false) {
        if (!editing)
            return;
        const id = editing;
        setEditing(null);
        if (!cancel && draft.trim() && M.topics(current.current.scene).find(n => n.id === id)?.title !== draft.trim())
            current.current.tools.rename(id, draft);
    }
    function down(e: ReactPointerEvent<SVGSVGElement>) {
        if ((e.target as Element).closest('textarea,input:not([type=checkbox])') || e.button !== 2 && (e.target as Element).closest('button,a'))
            return;
        const contact = point(e);
        pointers.current.set(e.pointerId, contact);
        const active = gesture.current;
        // A second contact turns whatever is in flight into a pinch, so touch users can zoom.
        if (active && pointers.current.size >= 2) {
            const [a, b] = [...pointers.current.values()];
            active.kind = 'pinch';
            active.moved = true;
            active.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, viewport: viewportRef.current };
            cancelPress();
            trackDrop(null);
            setPreview(null);
            setMarquee(null);
            e.preventDefault();
            return;
        }
        if (gesture.current || e.button !== 0 && e.button !== 2)
            return;
        e.preventDefault();
        host.current?.focus();
        const p = point(e), w = toWorld(p), id = (e.target as Element).closest('[data-topic-id]')?.getAttribute('data-topic-id') || undefined;
        if (e.button === 0 && id && tools.relation) {
            tools.connect(id);
            return;
        }
        let ids = [...tools.selected];
        tools.closeContext();
        if (e.button === 2 && id && !ids.includes(id)) {
            ids = [id];
            tools.select(ids);
        }
        if (e.button === 0 && id) {
            if (e.shiftKey) {
                ids = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
            }
            else if (!ids.includes(id))
                ids = [id];
            tools.select(ids);
        }
        else if (e.button === 0 && !e.shiftKey) {
            ids = [];
            tools.select([]);
        }
        const roots = id && e.button === 0 ? M.branchRoots(all, ids) : [];
        const moving = new Set(roots.flatMap(n => [n.id, ...M.descendants(all, n.id)]));
        let primaryRoot = id ? byId.get(id) : undefined;
        const rootIds = new Set(roots.map(n => n.id));
        while (primaryRoot && !rootIds.has(primaryRoot.id)) primaryRoot = byId.get(primaryRoot.parentId || '');
        gesture.current = { pointerId: e.pointerId, moving, roots, primaryRoot: primaryRoot?.id, kind: gestureKind({ pointerType: e.pointerType, button: e.button, hitTopic: Boolean(id), pointers: pointers.current.size }), longPress: false, pointerType: e.pointerType, start: p, world: w, origin: { x: viewport.x, y: viewport.y }, scene, ids, primary: id, additive: e.shiftKey, startSelection: tools.selected, moved: false };
        if (e.pointerType === 'touch' && id)
            pressTimer.current = setTimeout(() => { const g = gesture.current; if (g && !g.moved) g.longPress = true; }, 500);
        // Capture only once a drag starts; capturing here retargets both clicks
        // to the SVG and prevents the topic from ever receiving dblclick.
    }
    function dropAt(g: Gesture, point: Point): M.BranchDrop | null {
        const root = g.primaryRoot && byId.get(g.primaryRoot);
        if (!root) return null;
        const p = toWorld(point), radius = 12 / viewportRef.current.k;
        const roots = new Set(g.roots.map(n => n.id));
        const hit = lookup({ x: p.x - radius, y: p.y - radius, width: 2 * radius, height: 2 * radius })
            .filter(n => !roots.has(n.id) && (!g.moving.has(n.id) || intersects(n, { x: p.x, y: p.y, width: 0, height: 0 })))
            .sort((a, b) => Math.hypot(p.x - a.x - a.width / 2, p.y - a.y - a.height / 2)
                - Math.hypot(p.x - b.x - b.width / 2, p.y - b.y - b.height / 2))[0];
        if (!hit) return null;
        const vertical = scene.appState?.mindmapOrientation === 'vertical';
        const axis = vertical ? p.x - hit.x : p.y - hit.y;
        const extent = vertical ? hit.width : hit.height;
        const sameParent = g.roots.every(n => n.parentId === hit.parentId);
        if (sameParent && axis < extent * .24) return { targetId: hit.id, kind: 'before' };
        if (sameParent && axis > extent * .76) return { targetId: hit.id, kind: 'after' };
        return { targetId: hit.id, kind: 'child' };
    }
    function sameDrop(a: M.BranchDrop | null, b: M.BranchDrop | null) {
        return a?.targetId === b?.targetId && a?.kind === b?.kind;
    }
    function trackDrop(next: M.BranchDrop | null) {
        if (sameDrop(candidate.current, next)) return;
        if (dropTimer.current) clearTimeout(dropTimer.current);
        candidate.current = next;
        armed.current = null;
        setDrop(null);
        if (next) dropTimer.current = setTimeout(() => {
            armed.current = next;
            setDrop(next);
        }, 260);
    }
    function cancelPress() {
        if (pressTimer.current) clearTimeout(pressTimer.current);
        pressTimer.current = null;
    }
    function clearGesture() {
        cancelPress();
        pointers.current.clear();
        const g = gesture.current;
        gesture.current = null;
        if (g && svgRef.current?.hasPointerCapture(g.pointerId)) svgRef.current.releasePointerCapture(g.pointerId);
        cancelAnimationFrame(frame.current);
        trackDrop(null);
        setPreview(null);
        setMarquee(null);
        return g;
    }
    function move(e: ReactPointerEvent<SVGSVGElement>) {
        const g = gesture.current;
        if (!g) return;
        if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, point(e));
        if (g.kind === 'pinch') {
            if (pointers.current.size < 2 || !g.pinch) return;
            const [a, b] = [...pointers.current.values()];
            setViewport(pinchViewport(g.pinch, { distance: Math.hypot(a.x - b.x, a.y - b.y), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }));
            return;
        }
        if (g.pointerId !== e.pointerId) return;
        const p = point(e), dx = p.x - g.start.x, dy = p.y - g.start.y;
        if (!g.moved && Math.hypot(dx, dy) < 5) return;
        g.moved = true;
        cancelPress();
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId);
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
            if (g.kind === 'pan') {
                setViewport(v => ({ ...v, x: g.origin.x + dx, y: g.origin.y + dy }));
            } else if (g.kind === 'marquee') {
                const w = toWorld(p), box = { x: Math.min(g.world.x, w.x), y: Math.min(g.world.y, w.y), width: Math.abs(w.x - g.world.x), height: Math.abs(w.y - g.world.y) };
                setMarquee(box);
                const ids = lookup(box).map(n => n.id);
                tools.select(g.additive ? [...new Set([...g.startSelection, ...ids])] : ids);
            } else if (g.moving.size) {
                const w = toWorld(p);
                setPreview({ offset: { x: w.x - g.world.x, y: w.y - g.world.y }, ids: g.moving });
                trackDrop(dropAt(g, p));
            }
        });
    }
    function up(e: ReactPointerEvent<SVGSVGElement>) {
        pointers.current.delete(e.pointerId);
        const g = gesture.current;
        if (!g) return;
        if (g.kind === 'pinch') {
            if (pointers.current.size < 2) clearGesture();
            return;
        }
        if (g.pointerId !== e.pointerId) return;
        cancelPress();
        const p = point(e), destination = g.kind === 'drag' && g.moved ? dropAt(g, p) : null;
        const valid = sameDrop(destination, armed.current);
        clearGesture();
        if (g.kind === 'pan' && g.moved) {
            setViewport(v => ({ ...v, x: g.origin.x + p.x - g.start.x, y: g.origin.y + p.y - g.start.y }));
        } else if (g.kind === 'drag' && g.moved && g.moving.size) {
            if (current.current.scene !== g.scene) return;
            try {
                if (destination) {
                    if (valid) commit(M.dropBranches(g.scene, g.ids, destination));
                } else {
                    const w = toWorld(p);
                    commit(M.moveBranches(g.scene, g.ids, w.x - g.world.x, w.y - g.world.y, true));
                }
            } catch (error) {
                tools.say((error as Error).message);
            }
        } else if (g.primary && opensContextMenu({ kind: g.kind, moved: g.moved, primary: g.primary, longPress: g.longPress })) {
            tools.openContext(g.primary, e.clientX, e.clientY);
        } else if (g.kind === 'drag' && g.primary && !g.additive) {
            tools.select([g.primary]);
        }
    }
    function fold(id: string) {
        commit(M.setTopicFold(current.current.scene, [id]));
    }
    const target = drop && nodeAt(drop.targetId);
    const source = preview && gesture.current?.primaryRoot && nodeAt(gesture.current.primaryRoot);
    const invalidTarget = Boolean(drop && gesture.current?.moving.has(drop.targetId));
    const dropLabel = invalidTarget ? '不能移入自身后代' : drop?.kind === 'before' ? '移到前面' : drop?.kind === 'after' ? '移到后面' : '设为子主题';
    return <div className={'map-surface' + (tools.relation ? ' map-connecting' : '')} ref={host} tabIndex={0} aria-label="思维导图画布" onKeyDown={e => { if (e.key === 'Escape' && gesture.current) clearGesture(); }} onContextMenu={e => { if (!(e.target as Element).closest('textarea,input:not([type=checkbox])'))
        e.preventDefault(); }}>
  <svg ref={svgRef} className="map-svg" width="100%" height="100%" onPointerDownCapture={e => { if (e.button === 2)
        down(e); }} onPointerDown={e => { if (e.button !== 2)
        down(e); }} onPointerMove={move} onPointerUp={up} onPointerCancel={clearGesture} onLostPointerCapture={clearGesture} role="application" aria-label="左键框选，右键拖动画布">
   <defs><marker id="map-relation-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke="#879797"/></marker></defs>
   <g className="map-world" transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.k})`}>
    {overlays.filter(e => e.customData.mindmapDecoration).map(e => {
            const d = e.customData, ids = new Set<string>((d.topicIds || []).flatMap((id: string) => [id, ...M.descendants(all, id)])), members = allowed.filter(n => ids.has(n.id)).map(projected);
            if (!members.length)
                return null;
            const b = A.topicBounds(members);
            if (d.mindmapDecoration === 'summary') {
                const summary = nodeAt(d.summaryTopicId);
                if (!summary || !visibleIds.has(summary.id))
                    return null;
                return <g key={e.id} className="map-decoration"><path d={`M${b.x + b.width + 20},${b.y} q18,0 18,18 v${Math.max(0, b.height / 2 - 36)} q0,18 18,18 q-18,0 -18,18 v${Math.max(0, b.height / 2 - 36)} q0,18 -18,18`} fill="none" stroke="#a1b3a4" strokeWidth="2"/><path d={`M${b.x + b.width + 56},${b.y + b.height / 2} L${summary.x},${summary.y + summary.height / 2}`} stroke="#a1b3a4" fill="none"/></g>;
            }
            return <g key={e.id} className="map-decoration"><rect x={b.x - 24} y={b.y - 37} width={b.width + 48} height={b.height + 61} rx="14" fill={d.mindmapDecoration === 'area' ? '#edf3f0' : '#f8faf880'} stroke="#a5b8aa" strokeDasharray={d.mindmapDecoration === 'area' ? '0' : '6 5'}/><text x={b.x - 12} y={b.y - 17} fontSize="13" fill="#7a927f">{d.title}</text><g className="map-decoration-remove" role="button" aria-label={'删除' + d.title} onPointerDown={e => e.stopPropagation()} onClick={() => commit({ ...scene, elements: scene.elements.map(x => x.id === e.id ? A.patchElement(x, { isDeleted: true }) : x) })}><text x={b.x + b.width + 8} y={b.y - 17} fontSize="14" fill="#889b8e">×</text></g></g>;
        })}
    <g className="map-branches" opacity=".55">{renderedEdges.map(({ child: n, parent: p }) => { const vertical = displayed.appState?.mindmapOrientation === 'vertical' ? true : displayed.appState?.mindmapOrientation === 'horizontal' ? false : Math.abs(n.y - p.y) > Math.abs(n.x - p.x), right = n.x >= p.x, down = n.y >= p.y, x1 = vertical ? p.x + p.width / 2 : right ? p.x + p.width : p.x, y1 = vertical ? (down ? p.y + p.height : p.y) : p.y + p.height / 2, x2 = vertical ? n.x + n.width / 2 : right ? n.x : n.x + n.width, y2 = vertical ? (down ? n.y : n.y + n.height) : n.y + n.height / 2; return <path key={'branch-' + n.id} d={!p.parentId ? (vertical ? `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}` : `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`) : elbowPath(x1, y1, x2, y2, vertical)} fill="none" stroke={branchColor.get(n.id) || '#a8b8ad'} strokeWidth="2"/>; })}</g>
    {overlays.filter(e => e.type === 'arrow' && e.customData.mindmapRelation).map(e => {
            const a = nodeAt(e.startBinding?.elementId), b = nodeAt(e.endBinding?.elementId);
            if (!a || !b || !visibleIds.has(a.id) || !visibleIds.has(b.id))
                return null;
            const x1 = a.x + a.width / 2, y1 = a.y, x2 = b.x + b.width / 2, y2 = b.y, mid = (x1 + x2) / 2, top = Math.min(y1, y2) - 65;
            return <g key={e.id} className="map-relation"><path d={`M${x1},${y1} Q${mid},${top} ${x2},${y2}`} stroke="#879797" strokeDasharray="5 4" fill="none" markerEnd="url(#map-relation-arrow)"/><text x={mid} y={top + 22} textAnchor="middle" fontSize="12" fill="#879797">{e.customData.label || '联系'}</text><text className="map-decoration-remove" role="button" aria-label="删除联系" x={mid + 25} y={top + 22} onPointerDown={e => e.stopPropagation()} onClick={() => commit({ ...scene, elements: scene.elements.map(x => x.id === e.id ? A.patchElement(x, { isDeleted: true }) : x) })}>×</text></g>;
        })}
    {visible.map(n => {
            const shape = shapes.get(n.id), m = shape?.customData?.mindmap || {}, base = { ...A.DEFAULT_STYLE, ...m.style }, parent = n.parentId ? byId.get(n.parentId) : undefined, branch = branchColor.get(n.id), main = Boolean(branch && parent && !parent.parentId), sub = Boolean(branch && parent?.parentId && !byId.get(parent.parentId)?.parentId), custom = Boolean(m.style && ((m.style.fill && m.style.fill !== A.DEFAULT_STYLE.fill) || (m.style.color && m.style.color !== A.DEFAULT_STYLE.color))), s = main && branch && !custom ? { ...base, fill: tint(branch, .80), color: shade(branch, .32), border: tint(branch, .52), borderWidth: 1, bold: true } : sub && branch && !custom ? { ...base, fill: tint(branch, .87), color: shade(branch, .38), border: tint(branch, .62), borderWidth: 1 } : base, lightMain = Boolean(main && !custom && branch), chosen = selectedIds.has(n.id), childCount = children.get(n.id)?.length || 0, comments = m.comments || [], note = m.notesHidden ? '' : n.notes;
            const vertical = displayed.appState?.mindmapOrientation === 'vertical';
            const left = !vertical && (parent
                ? n.x + n.width / 2 < parent.x + parent.width / 2
                : (children.get(n.id) || []).every(c => c.x + c.width / 2 < n.x + n.width / 2));
            const foldX = vertical ? n.x + n.width / 2 : left ? n.x - 11 : n.x + n.width + 11;
            const foldY = vertical ? n.y + n.height + 11 : n.y + n.height / 2;
            return <g key={n.id} data-topic-id={n.id} className={'map-topic' + (chosen ? ' selected' : '') + (drop?.targetId === n.id ? ' drop-target' : '')} role="button" aria-label={'主题：' + n.title} aria-pressed={chosen} onDoubleClick={e => { if ((e.target as Element).closest('button,a,textarea,input,.map-fold-control,.map-todo'))
                return; gesture.current = null; tools.select([n.id]); setEditing(n.id); setDraft(n.title); }}>
     {lite && !chosen && editing !== n.id ? <rect x={n.x} y={n.y} width={n.width} height={n.height} rx="8" fill={s.fill} stroke={s.border}/> : <foreignObject x={n.x} y={n.y} width={n.width} height={n.height} style={{ overflow: 'visible' }}><div className={'map-topic-card' + (main && !custom ? ' map-topic-main' : '') + (lightMain ? ' map-topic-main-on-light' : '')} style={{ width: '100%', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '12px 18px', borderRadius: main && !custom ? 10 : 8, background: s.fill, border: `${s.borderWidth || 0}px solid ${s.border}`, color: s.color, fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif', fontSize: s.fontSize, fontWeight: s.bold ? 700 : 400, fontStyle: s.italic ? 'italic' : 'normal', textDecoration: s.strike ? 'line-through' : 'none', lineHeight: 1.5, position: 'relative', boxShadow: main && !custom && branch ? `0 3px 10px ${branch}2b` : undefined }}>
      {editing === n.id ? <textarea ref={text} className="map-inline-text" onCompositionStart={() => { composition.current = true; }} onCompositionEnd={() => { composition.current = false; }} aria-label="编辑主题文本" value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => finishText()} onPointerDown={e => e.stopPropagation()} onKeyDown={e => {
                        if (composition.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)
                            return;
                        if (e.key === 'Escape') {
                            e.preventDefault();
                            e.stopPropagation();
                            finishText(true);
                        }
                        else if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            e.stopPropagation();
                            finishText();
                        }
                    }}/> : <span className="map-topic-title" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', pointerEvents: 'none' }}>{!m.plain && m.marker && <span className="map-topic-marker">{m.marker} </span>}{n.title}</span>}
      {!m.plain && m.annotation && <button className="map-callout" aria-label="编辑标注" onPointerDown={e => e.stopPropagation()} onClick={() => { tools.select([n.id]); tools.run('annotation'); }}>{m.annotation}</button>}
      {!m.plain && m.imageId && displayed.files[m.imageId] && <img className="map-topic-image" alt="主题图片" loading={exporting ? 'eager' : 'lazy'} decoding="async" src={displayed.files[m.imageId].dataURL} style={{ maxWidth: '100%', height: 130, objectFit: 'contain', marginTop: 8, pointerEvents: 'none' }}/>}
      <TopicExtras scene={displayed} id={n.id} meta={m} tools={tools}/>
      {!m.plain && (m.tags?.length || shape?.link || comments.length || note) && <div className="map-topic-meta">{(m.tags || []).map((tag: string) => <span key={tag} className="map-tag">{tag}</span>)}{note && <button title={note} aria-label="查看笔记" onPointerDown={e => e.stopPropagation()} onClick={() => { tools.select([n.id]); tools.run('notes'); }}>▤</button>}{comments.length > 0 && <button title={comments.map((c: any) => c.text).join('\n')} aria-label="查看评论" onPointerDown={e => e.stopPropagation()} onClick={() => { tools.select([n.id]); tools.run('comment'); }}>☵ {comments.length}</button>}{shape?.link && <a href={/^(https?:|mailto:)/i.test(shape.link) ? shape.link : undefined} target="_blank" rel="noreferrer" aria-label="打开主题链接" onPointerDown={e => e.stopPropagation()}>↗</a>}</div>}
      {idea && <span className="map-topic-sync-state" title={M.topicSyncState(n, byId, idea)} aria-label={M.topicSyncState(n, byId, idea)} data-state={M.topicSyncState(n, byId, idea)}/> }
      {n.positionLocked && <span className="map-position-lock" title="分支位置已锁定，展开避让时随整条分支移动">⌖</span>}
      {!exporting && !editing && <button type="button" className="map-quick-child" aria-label={'为「' + n.title + '」添加子主题'} title="添加子主题" onPointerDown={e => { e.stopPropagation(); e.preventDefault(); }} onClick={() => { tools.select([n.id]); tools.run('child'); }}>+</button>}
     </div></foreignObject>}
     {childCount > 0 && !lite && <g role="button" aria-label={(n.collapsed ? '展开' : '折叠') + n.title} className="map-fold-control" onPointerDown={e => { e.stopPropagation(); e.preventDefault(); }} onClick={() => fold(n.id)}><circle cx={foldX} cy={foldY} r="9" fill="#fff" stroke="#c2d1c6"/><text x={foldX} y={foldY + 4} textAnchor="middle" fontSize="11" fill="#819b88">{n.collapsed ? childCount : '−'}</text></g>}
    </g>;
        })}
    {target && source && drop && !invalidTarget && <g className="map-drop-preview" pointerEvents="none" stroke="#356d64" strokeWidth={2 / viewport.k}>
        {drop.kind === 'child'
            ? <path d={elbowPath(source.x + source.width / 2, source.y + source.height / 2, target.x + target.width / 2, target.y + target.height / 2, scene.appState?.mindmapOrientation === 'vertical')} fill="none" strokeDasharray="6 5"/>
            : scene.appState?.mindmapOrientation === 'vertical'
                ? <line x1={drop.kind === 'before' ? target.x - 9 : target.x + target.width + 9} x2={drop.kind === 'before' ? target.x - 9 : target.x + target.width + 9} y1={target.y} y2={target.y + target.height}/>
                : <line x1={target.x} x2={target.x + target.width} y1={drop.kind === 'before' ? target.y - 9 : target.y + target.height + 9} y2={drop.kind === 'before' ? target.y - 9 : target.y + target.height + 9}/>}
    </g>}
    {marquee && <rect className="map-selection-rect" {...marquee} fill="#52b9e219" stroke="#47aedd" strokeWidth={1 / viewport.k} pointerEvents="none"/>}
   </g>
  </svg>
  {!all.length && <button className="map-empty-create" onClick={() => tools.run('after')}>＋ 添加中心主题</button>}
  {preview && <div className="map-drag-hint">{target ? `「${target.title}」 · ${dropLabel}` : '移动分支 · 停留在目标上可挂载或排序'}</div>}
  {allowed.length > 1 && <div className="map-minimap-wrap">
    {minimap && <MindmapMiniMap nodes={allowed} viewport={viewport} size={size} recenter={p => setViewport(v => ({ ...v, x: size.width / 2 - p.x * v.k, y: size.height / 2 - p.y * v.k }))}/>}
    <button type="button" className="map-minimap-toggle" aria-expanded={minimap} onClick={() => setMinimap(v => !v)}>{minimap ? '隐藏小地图' : '小地图'}</button>
  </div>}
  {tools.isolated && <button className="map-isolation-back" onClick={() => { tools.setIsolated(null); setTimeout(() => fit(), 0); }}>← 返回完整导图</button>}
 </div>;
}

function MindmapMiniMap({ nodes, viewport, size, recenter }: {
    nodes: M.Topic[];
    viewport: Point & { k: number };
    size: { width: number; height: number };
    recenter: (p: Point) => void;
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const width = 168, height = 102;
    const map = useMemo(() => {
        const bounds = covering(nodes), k = Math.min((width - 12) / Math.max(bounds.width, 1), (height - 12) / Math.max(bounds.height, 1));
        return { k, x: (width - bounds.width * k) / 2 - bounds.x * k, y: (height - bounds.height * k) / 2 - bounds.y * k };
    }, [nodes]);
    useEffect(() => {
        const context = canvas.current?.getContext('2d');
        if (!context) return;
        context.clearRect(0, 0, width, height);
        context.fillStyle = '#9bb7a8';
        for (const n of nodes) context.fillRect(map.x + n.x * map.k, map.y + n.y * map.k, Math.max(1, n.width * map.k), Math.max(1, n.height * map.k));
    }, [nodes, map]);
    const k = map.k / viewport.k;
    return <div className="map-minimap" style={{ width, height }}>
        <canvas ref={canvas} width={width} height={height} aria-hidden="true"/>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="小地图视口" onPointerDown={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            recenter({ x: ((e.clientX - rect.left) * width / rect.width - map.x) / map.k, y: ((e.clientY - rect.top) * height / rect.height - map.y) / map.k });
        }}>
            <rect x={map.x - viewport.x * k} y={map.y - viewport.y * k} width={size.width * k} height={size.height * k} fill="#65877b22" stroke="#4f776a"/>
        </svg>
    </div>;
}
