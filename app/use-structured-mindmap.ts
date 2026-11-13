/// <reference types="vite/client" />
'use client';
import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { CanvasScene } from '../lib/mindmap-scene';
import type { RecordItem } from './data';
import * as M from '../lib/structured-mindmap';
import MindmapLayoutWorker from '../lib/mindmap-layout-worker?worker';
type Options = {
    keyboard?: boolean;
    api: MutableRefObject<any>;
    sdk: any;
    scene: MutableRefObject<CanvasScene | null>;
    onCommit: (s: CanvasScene) => void;
    record: RecordItem;
    records?: RecordItem[];
    persist: (r: RecordItem[], sync?: { expected: RecordItem[] }) => Promise<boolean>;
    error: (s: string) => void;
};
// Editor commands replace modified elements and resource maps, so history can share unchanged data.
const snapshot = (s: CanvasScene): CanvasScene => ({ ...s });
const content = (s: CanvasScene) => JSON.stringify(s.elements.map(({ version, versionNonce, updated, ...e }) => e));
export function useStructuredMindmap(options: Options) {
    const latest = useRef(options);
    latest.current = options;
    const [model, setModel] = useState<M.Topic[]>([]), [selected, setSelected] = useState<string | null>(null), [dropTarget, setDropTarget] = useState<string | null>(null), [revision, setRevision] = useState(0), [sync, setSync] = useState<{
        direction: 'pull' | 'push';
        changes: M.SyncChange[];
        records: RecordItem[];
        snapshotId: string;
        revisions: Record<string, string>;
        scene: CanvasScene;
    } | null>(null), [syncBusy, setSyncBusy] = useState(false), [syncError, setSyncError] = useState('');
    const undoStack = useRef<CanvasScene[]>([]), redoStack = useRef<CanvasScene[]>([]), gesture = useRef<CanvasScene | null>(null), driver = useRef<string | null>(null), suppress = useRef(false), typing = useRef({ id: '', time: 0 });
    const refresh = (s: CanvasScene) => { setModel(M.topics(s)); setRevision(r => r + 1); };
    function remember(s: CanvasScene) { undoStack.current.push(snapshot(s)); if (undoStack.current.length > 60)
        undoStack.current.shift(); redoStack.current = []; setRevision(r => r + 1); }
    function render(s: CanvasScene, selection?: string | null) { const { api, sdk } = latest.current; if (!api.current || !sdk)
        return; if (latest.current.keyboard === false) {
        if (selection) api.current.updateScene({ appState: { selectedElementIds: { [selection]: true } } });
        return;
    } suppress.current = true; const visible = M.visibleScene(s); api.current.updateScene({ elements: sdk.restoreElements(visible.elements, null, { refreshDimensions: true }), ...(selection ? { appState: { selectedElementIds: { [selection]: true } } } : {}) }); }
    function commit(s: CanvasScene, history = true, selection?: string | null) { const o = latest.current; if (s === o.scene.current) return; if (history && o.scene.current)
        remember(o.scene.current); o.scene.current = s; refresh(s); o.onCommit(s); render(s, selection); if (selection)
        setSelected(selection); }
    const upgrade = (s: CanvasScene) => M.upgradeScene(s, latest.current.records || []);
    function load(s: CanvasScene) { const upgraded = upgrade(s); refresh(upgraded); undoStack.current = []; redoStack.current = []; return upgraded; }
    function choose(id: string) { setSelected(id); const o = latest.current, topic = M.topics(o.scene.current!).find(n => n.id === id); let s = o.scene.current!; let parent = topic?.parentId; while (parent) {
        s = M.updateTopic(s, parent, { collapsed: false });
        parent = M.topics(s).find(n => n.id === parent)?.parentId || null;
    } if (content(s) !== content(o.scene.current!))
        commit(M.compactLayout(s), true, id);
    else
        o.api.current?.updateScene({ appState: { selectedElementIds: { [id]: true } } }); setTimeout(() => o.api.current?.scrollToContent(o.api.current.getSceneElements().filter((e: any) => e.id === id), { fitToContent: false }), 0); }
    function edit(id: string, patch: Partial<M.Topic>) { try {
        const before = latest.current.scene.current!;
        let next = patch.parentId !== undefined ? M.reparent(before, id, patch.parentId, patch.order) : before;
        next = M.updateTopic(next, id, patch);
        commit(M.reconnect(next), true, id);
    }
    catch (e) {
        latest.current.error((e as Error).message);
    } }
    function add(mode: 'child' | 'sibling' | 'root', target = selected) {
        const o = latest.current;
        if (!o.sdk || !o.scene.current)
            return;
        const ns = M.topics(o.scene.current), current = ns.find(n => n.id === target), parent = mode === 'child' ? current : mode === 'sibling' ? ns.find(n => n.id === current?.parentId) : null;
        const id = crypto.randomUUID();
        const siblings = ns.filter(n => n.parentId === (parent?.id || null));
        const following = mode === 'sibling' && current ? siblings.filter(n => n.order > current.order) : [];
        const order = mode === 'sibling' && current ? (following.length ? (current.order + Math.min(...following.map(n => n.order))) / 2 : current.order + 1) : Math.max(0, ...siblings.map(n => n.order)) + 1;
        const elements = o.sdk.convertToExcalidrawElements([{ id, type: 'rectangle', x: parent ? parent.x + parent.width + 125 : current ? current.x + 25 : 160, y: mode === 'sibling' && current ? current.y + current.height + 40 : parent ? parent.y + siblings.length * 125 : 160 + siblings.length * 135, width: 260, height: 94, backgroundColor: '#edf3ee', fillStyle: 'solid', roughness: 0, label: { text: '新主题', fontSize: 18, fontFamily: 2 }, customData: { mindmap: { parentId: parent?.id || null, order, collapsed: false, status: '计划中', notes: '', next: '', evidence: '' } } }], { regenerateIds: false });
        let next = { ...o.scene.current, elements: [...o.scene.current.elements, ...elements] };
        if (parent)
            next = M.updateTopic(next, parent.id, { collapsed: false });
        commit(M.reconnect(next), true, id);
        setTimeout(() => o.api.current?.scrollToContent(elements, { fitToContent: false }), 0);
    }
    function fold(id: string) { const n = model.find(n => n.id === id), s = latest.current.scene.current; if (n && s)
        commit(M.compactLayout(M.updateTopic(s, id, { collapsed: !n.collapsed })), true, id); }
    function remove(id = selected) { if (id && latest.current.scene.current) {
        commit(M.deleteBranch(latest.current.scene.current, id));
        setSelected(null);
    } }
    const layoutWorker = useRef<Worker | null>(null);
    useEffect(() => () => layoutWorker.current?.terminate(), []);
    function layout(direction: M.LayoutDirection) {
        const before = latest.current.scene.current;
        if (!before) return;
        layoutWorker.current?.terminate();
        layoutWorker.current = null;
        const apply = (next: CanvasScene) => {
            if (latest.current.scene.current !== before) return;
            commit(next);
            setTimeout(() => latest.current.api.current?.scrollToContent(undefined, { fitToContent: true, viewportZoomFactor: 0.72 }), 0);
        };
        if (before.elements.length < 1500 || typeof Worker === 'undefined') {
            apply(M.layoutTopics(before, direction));
            return;
        }
        try {
            const worker = new MindmapLayoutWorker();
            layoutWorker.current = worker;
            const finish = () => { worker.terminate(); layoutWorker.current = null; };
            worker.onmessage = event => {
                finish();
                if (event.data.error) latest.current.error(event.data.error);
                else apply({ ...event.data.result, files: before.files });
            };
            worker.onerror = () => {
                finish();
                if (latest.current.scene.current === before) apply(M.layoutTopics(before, direction));
            };
            worker.postMessage({ scene: { ...before, files: {} }, direction });
        } catch {
            layoutWorker.current?.terminate();
            layoutWorker.current = null;
            apply(M.layoutTopics(before, direction));
        }
    }
    function undo() { const o = latest.current, next = undoStack.current.pop(); if (next && o.scene.current) {
        redoStack.current.push(snapshot(o.scene.current));
        commit({ ...next, appState: { ...next.appState, mindmapSyncHistory: o.scene.current.appState?.mindmapSyncHistory } }, false);
    } }
    function redo() { const o = latest.current, next = redoStack.current.pop(); if (next && o.scene.current) {
        undoStack.current.push(snapshot(o.scene.current));
        commit({ ...next, appState: { ...next.appState, mindmapSyncHistory: o.scene.current.appState?.mindmapSyncHistory } }, false);
    } }
    function pointerDown() { if (latest.current.scene.current) {
        gesture.current = snapshot(latest.current.scene.current);
        driver.current = null;
    } }
    function targetFor(s: CanvasScene, id: string) { const ns = M.topics(s), n = ns.find(n => n.id === id); if (!n)
        return null; const excluded = new Set([id, ...M.descendants(ns, id)]); const x = n.x + n.width / 2, y = n.y + n.height / 2; return ns.filter(t => !excluded.has(t.id) && x >= t.x - 55 && x <= t.x + t.width + 55 && y >= t.y - 55 && y <= t.y + t.height + 55).sort((a, b) => Math.hypot(x - a.x - a.width / 2, y - a.y - a.height / 2) - Math.hypot(x - b.x - b.width / 2, y - b.y - b.height / 2))[0]?.id || null; }
    function pointerUp() {
        const o = latest.current, base = gesture.current;
        gesture.current = null;
        if (!base || !o.scene.current)
            return;
        let next = o.scene.current;
        const id = driver.current;
        if (id) {
            const target = targetFor(next, id);
            if (target)
                try {
                    next = M.reparent(next, id, target);
                }
                catch (e) {
                    o.error((e as Error).message);
                }
        }
        driver.current = null;
        setDropTarget(null);
        // New or rewired bound arrows change the corresponding outline relationship.
        for (const edge of next.elements.filter(e => e.type === 'arrow' && !e.isDeleted && e.startBinding && e.endBinding)) {
            const old = base.elements.find(e => e.id === edge.id);
            if (!old || old.startBinding?.elementId !== edge.startBinding.elementId || old.endBinding?.elementId !== edge.endBinding.elementId) {
                const ns = M.topics(next);
                if (ns.some(n => n.id === edge.endBinding.elementId) && ns.some(n => n.id === edge.startBinding.elementId))
                    try {
                        next = M.reparent(next, edge.endBinding.elementId, edge.startBinding.elementId);
                    }
                    catch {
                        next = { ...next, elements: next.elements.filter(e => e.id !== edge.id) };
                    }
            }
        }
        if (content(base) !== content(next)) {
            remember(base);
            commit({ ...next, appState: { ...next.appState, mindmapSyncHistory: o.scene.current.appState?.mindmapSyncHistory } }, false);
        }
    }
    function canvasChange(elements: readonly any[], state: any, files: any): CanvasScene | null {
        const o = latest.current, previous = o.scene.current;
        if (!previous)
            return null;
        const selectedIds = Object.keys(state.selectedElementIds || {}), chosen = selectedIds.map(id => model.find(n => n.id === id) || model.find(n => elements.some(e => e.id === id && e.containerId === n.id))).find(Boolean);
        if (chosen?.id !== selected)
            setSelected(chosen?.id || null);
        const renderedIds = new Set(M.visibleScene(previous).elements.map(e => e.id));
        const hidden = new Set(previous.elements.filter(e => !renderedIds.has(e.id)).map(e => e.id));
        const incoming = new Map(elements.map(e => [e.id, e]));
        let next: CanvasScene = { ...previous, files, appState: { viewBackgroundColor: state.viewBackgroundColor || '#ffffff', gridSize: state.gridSize || null, theme: state.theme || 'light' }, elements: [...previous.elements.filter(e => hidden.has(e.id)), ...elements.filter(e => !hidden.has(e.id))] };
        // A deleted topic removes its entire branch, including hidden descendants.
        for (const n of M.topics(previous)) {
            const e = incoming.get(n.id);
            if (!hidden.has(n.id) && (!e || e.isDeleted)) {
                const deleted = M.deleteBranch(previous, n.id);
                const ids = new Set(deleted.elements.filter(e => e.isDeleted).map(e => e.id));
                next = { ...next, elements: next.elements.map(e => ids.has(e.id) ? { ...e, isDeleted: true, version: (e.version || 0) + 1 } : e) };
            }
        }
        for (const edge of previous.elements.filter(e => e.type === 'arrow' && !e.isDeleted && !hidden.has(e.id))) {
            const e = incoming.get(edge.id), child = M.topics(next).find(n => n.id === edge.endBinding?.elementId);
            if (child && e?.isDeleted && child.parentId === edge.startBinding?.elementId)
                next = M.updateTopic(next, child.id, { parentId: null });
        }
        if (gesture.current && !state.editingTextElement) {
            const base = M.topics(gesture.current), ns = M.topics(next);
            const candidates = ns.filter(n => selectedIds.includes(n.id) && base.some(b => b.id === n.id && (Math.abs(b.x - n.x) > 1 || Math.abs(b.y - n.y) > 1)));
            const moving = candidates.find(n => !candidates.some(p => M.descendants(base, p.id).includes(n.id)));
            if (moving) {
                driver.current = moving.id;
                const old = base.find(n => n.id === moving.id)!;
                next = M.moveFromSnapshot(next, gesture.current, moving.id, moving.x - old.x, moving.y - old.y, new Set(selectedIds));
                setDropTarget(targetFor(next, moving.id));
            }
        }
        const before = content(previous), after = content(next);
        if (before === after) {
            suppress.current = false;
            return null;
        }
        const internal = suppress.current;
        suppress.current = false;
        if (!internal && !gesture.current) {
            const textId = state.editingTextElement?.id || '';
            if (!textId || typing.current.id !== textId || Date.now() - typing.current.time > 1000)
                remember(previous);
            typing.current = { id: textId, time: Date.now() };
        }
        o.scene.current = next;
        refresh(next);
        if (gesture.current && driver.current)
            render(next);
        return next;
    }
    useEffect(() => { const key = (event: KeyboardEvent) => { const o = latest.current; if (o.keyboard === false || sync || document.querySelector('[role=dialog][aria-modal=true]') || !o.api.current || !o.scene.current)
        return; const active = document.activeElement; if (active?.closest('input,textarea,select,[contenteditable=true]') || o.api.current.getAppState().editingTextElement)
        return; if (!active?.closest('.canvas-studio') && !document.querySelector('.canvas-studio:hover'))
        return; const ns = M.topics(o.scene.current), s = o.api.current.getAppState(), id = ns.find(n => s.selectedElementIds[n.id])?.id; if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.shiftKey || event.key.toLowerCase() === 'y')
            redo();
        else
            undo();
        return;
    } if (!id)
        return; if (['Tab', 'Enter'].includes(event.key) && active?.closest('.canvas-titlebar,.canvas-actions,.topic-inspector'))
        return; if (['Tab', 'Enter'].includes(event.key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        add(event.key === 'Tab' ? 'child' : 'sibling', id);
    }
    else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        event.stopImmediatePropagation();
        remove(id);
    } }; document.addEventListener('keydown', key, true); return () => document.removeEventListener('keydown', key, true); });
    async function preview(direction: 'pull' | 'push') { setSyncBusy(true); setSyncError(''); try {
        const o = latest.current, res = await fetch('/api/records?mindmapSync=1');
        if (!res.ok)
            throw Error('无法读取最新实验记录，请恢复连接再同步');
        const { records: rows, revisions } = await res.json() as { records: RecordItem[]; revisions: Record<string, string> };
        const merged = new Map((o.records || []).map(r => [r.id, r]));
        for (const r of rows)
            if (r.kind === 'node' && r.idea === o.record.sourceIdea)
                merged.set(r.id, r);
        const records = [...merged.values()];
        const scene = o.scene.current!;
        setSync({ direction, records, revisions, scene, snapshotId: crypto.randomUUID(), changes: M.syncPlan(scene, records, direction, String(o.record.sourceIdea)) });
    }
    catch (e) {
        latest.current.error((e as Error).message);
    }
    finally {
        setSyncBusy(false);
    } }
    async function applySync(choices: Record<string, 'canvas' | 'record'>) {
        if (!sync)
            return;
        setSyncBusy(true);
        setSyncError('');
        try {
            if (sync.changes.some(c => c.conflict && !choices[c.key]))
                throw Error('请逐项选择冲突字段的处理方式');
            const o = latest.current;
            if (o.scene.current !== sync.scene) throw Error('画布在预览后发生修改，请重新预览');
            const res = await fetch('/api/records?mindmapSync=1');
            if (!res.ok) throw Error('无法核验最新实验记录，请恢复连接再同步');
            const { records: rows } = await res.json() as { records: RecordItem[] };
            const previewRows = new Map(sync.records.map(r => [r.id, r])), freshRows = new Map(rows.map(r => [r.id, r]));
            for (const c of sync.changes) {
                const before = previewRows.get(c.recordId), now = freshRows.get(c.recordId) || before;
                if (c.field === 'missing') {
                    if (now && !now.deleted) throw Error('关联记录已恢复，请重新预览');
                } else if (sync.direction === 'pull' && c.field === 'new') {
                    if (!now || now.deleted || Object.entries(M.recordSnapshot(now)).some(([f, v]) => v !== String(before?.[f] ?? '')))
                        throw Error('新实验记录在预览后发生修改，请重新预览');
                } else if (c.field !== 'new' && (choices[c.key] || (sync.direction === 'pull' ? 'record' : 'canvas')) === 'record') {
                    if (!now || now.deleted || String(now[c.field] ?? '') !== c.remote)
                        throw Error('实验记录在预览后发生修改，请重新预览');
                }
            }
            let next = sync.scene;
            const ns = M.topics(next), mapping = new Map(ns.filter(n => n.recordId).map(n => [n.id, n.recordId!]));
            for (const c of sync.changes)
                if (c.field === 'new' && sync.direction === 'push')
                    mapping.set(c.topicId, c.recordId);
            const writes = new Map<string, RecordItem>(), baseUpdates = new Map<string, Record<string, string>>();
            if (sync.direction === 'pull') {
                const newRows = sync.changes.filter(c => c.field === 'new');
                const mapped = new Map(ns.filter(n => n.recordId).map(n => [n.recordId!, n.id]));
                for (const c of newRows)
                    mapped.set(c.recordId, c.topicId);
                for (const c of newRows) {
                    const r = sync.records.find(r => r.id === c.recordId)!;
                    const placed = M.topics(next), parent = placed.find(n => n.recordId === r.parent);
                    const x = parent ? parent.x + parent.width + 120 : 100;
                    let y = parent ? parent.y + 140 : 100;
                    while (placed.some(n => x < n.x + n.width + 25 && x + 270 + 25 > n.x && y < n.y + n.height + 25 && y + 125 > n.y))
                        y += 140;
                    const elements = o.sdk.convertToExcalidrawElements([{ id: c.topicId, type: 'rectangle', x, y, width: 270, height: 100, roughness: 0, fillStyle: 'solid', backgroundColor: '#edf3ee', label: { text: r.title + '\n' + (r.status || ''), fontSize: 18, fontFamily: 2 }, customData: { mindmap: { recordId: r.id, parentId: mapped.get(String(r.parent)) || null, order: Date.now() + newRows.indexOf(c), status: r.status, notes: r.notes || '', next: r.next || '', evidence: r.evidence || '', base: M.recordSnapshot(r) } } }], { regenerateIds: false });
                    next = { ...next, elements: [...next.elements, ...elements] };
                }
            }
            for (const c of sync.changes) {
                if (c.field === 'missing') {
                    next = M.updateTopic(next, c.topicId, { missing: true });
                    continue;
                }
                if (c.field === 'new') {
                    if (sync.direction === 'push') {
                        const n = ns.find(n => n.id === c.topicId)!;
                        writes.set(c.recordId, { id: c.recordId, kind: 'node', idea: String(o.record.sourceIdea), title: n.title, parent: mapping.get(n.parentId || '') || 'root-' + o.record.sourceIdea, status: n.status || '计划中', notes: n.notes, next: n.next, evidence: n.evidence });
                        next = M.updateTopic(next, n.id, { recordId: c.recordId, missing: false });
                    }
                    continue;
                }
                const n = M.topics(next).find(n => n.id === c.topicId)!, remote = sync.records.find(r => r.id === c.recordId)!;
                const choice = choices[c.key] || (sync.direction === 'pull' ? 'record' : 'canvas');
                const takeRecord = choice === 'record';
                let base = baseUpdates.get(n.id) || { ...(n.base || M.recordSnapshot(remote)) };
                if (takeRecord) {
                    if (c.field === 'parent') {
                        const target = M.topics(next).find(t => t.recordId === c.remote);
                        next = M.reparent(next, n.id, target?.id || null);
                    }
                    else
                        next = M.updateTopic(next, n.id, { [c.field]: c.remote });
                    base[c.field] = c.remote;
                }
                else if (sync.direction === 'push') {
                    const row = writes.get(remote.id) || { ...remote };
                    row[c.field] = c.canvas;
                    writes.set(row.id, row);
                    base[c.field] = c.canvas;
                }
                else
                    base[c.field] = c.remote;
                baseUpdates.set(n.id, base);
            }
            if (o.scene.current !== sync.scene) throw Error('画布在预览后发生修改，请重新预览');
            if (writes.size) {
                const created = new Set(sync.changes.filter(c => c.field === 'new').map(c => c.recordId));
                const expected = sync.records.filter(r => writes.has(r.id) && !created.has(r.id));
                if (!await o.persist([...writes.values()], { expected }))
                    throw Error('实验写回未确认，画布关联未更新。可重试或重新预览');
            }
            if (o.scene.current !== sync.scene) throw Error('同步期间画布发生修改，请重新预览后更新关联');
            for (const [id, base] of baseUpdates)
                next = M.updateTopic(next, id, { base, missing: false });
            for (const row of writes.values()) {
                const n = M.topics(next).find(n => n.recordId === row.id);
                if (n && sync.changes.some(c => c.recordId === row.id && c.field === 'new'))
                    next = M.updateTopic(next, n.id, { base: M.recordSnapshot(row), missing: false });
            }
            const audit = {
                snapshotId: sync.snapshotId, at: new Date().toISOString(), direction: sync.direction,
                changes: sync.changes.map(c => ({
                    topicId: c.topicId, recordId: c.recordId, field: c.field,
                    sourceRevision: sync.revisions[c.recordId] || (previewRows.has(c.recordId) ? 'seed' : null),
                    result: c.field === 'missing' ? 'missing' : c.field === 'new' ? 'created' :
                        (choices[c.key] || (sync.direction === 'pull' ? 'record' : 'canvas')) === 'record' ? 'applied-to-map' :
                            sync.direction === 'push' ? 'applied-to-record' : 'kept-in-map',
                })),
            };
            const history = Array.isArray(next.appState?.mindmapSyncHistory) ? next.appState.mindmapSyncHistory : [];
            next = { ...next, appState: { ...next.appState, mindmapSyncHistory: [...history.slice(-19), audit] } };
            commit(M.reconnect(next));
            setSync(null);
            o.error('');
        }
        catch (e) {
            setSyncError((e as Error).message);
        }
        finally {
            setSyncBusy(false);
        }
    }
    return { model, selected, select: (ids:string[])=>setSelected(ids.at(-1)||null), dropTarget, revision, load, upgrade, canvasChange, pointerDown, pointerUp, edit, choose, add, fold, remove, layout, undo, redo, canUndo: undoStack.current.length > 0, canRedo: redoStack.current.length > 0, sync, syncBusy, syncError, preview, applySync, closeSync: () => setSync(null), commit };
}
