'use client';
import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { createMindmapFile, mergeMindmapFiles, type CanvasScene } from '../lib/mindmap-scene';
import type { useStructuredMindmap } from './use-structured-mindmap';
import * as M from '../lib/structured-mindmap';
import * as A from '../lib/mindmap-actions';
import * as C from '../lib/mindmap-clipboard';
import { researchNodeIdOf } from '../lib/evidence-link';
import { useMindmapExtras } from './use-mindmap-extras';
let copiedBranch: C.MapFragment | null = null;
export type MapView = {
    fit: (ids?: string[]) => void;
    center: (id: string, minimumZoom?: number) => void;
    zoom: (factor: number) => void;
    actual: () => void;
    edit: (id: string) => void;
};
type Options = {
    scene: MutableRefObject<CanvasScene | null>;
    controller: ReturnType<typeof useStructuredMindmap>;
    view: MutableRefObject<MapView | null>;
    newMap: () => void;
    adjacent: (delta: number) => void;
    maps?: {
        id: string;
        title: string;
    }[];
    openMap?: (id: string) => void;
    onOpenEvidence?: (nodeId: string) => void;
};
type Dialog = {
    kind: 'tags' | 'link' | 'comment' | 'notes' | 'annotation' | 'boundary' | 'area' | 'summary';
    ids: string[];
    value: string;
};
export function useMindmapTools(options: Options) {
    const latest = useRef(options);
    latest.current = options;
    const [selected, setSelected] = useState<string[]>([]), [format, setFormat] = useState(false), [isolated, setIsolated] = useState<string | null>(null), [relation, setRelation] = useState<string | null>(null), [dialog, setDialog] = useState<Dialog | null>(null), [message, setMessage] = useState(''), [help, setHelp] = useState(false), [context, setContext] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const [search, setSearch] = useState(false);
    const selection = useRef(selected);
    selection.current = selected;
    const composing = useRef(false);
    const imageInput = useRef<HTMLInputElement | null>(null), messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    function say(text: string) {
        setMessage(text);
        if (messageTimer.current)
            clearTimeout(messageTimer.current);
        messageTimer.current = setTimeout(() => setMessage(''), 4000);
    }
    useEffect(() => () => {
        if (messageTimer.current)
            clearTimeout(messageTimer.current);
    }, []);
    function select(ids: string[]) { setSelected(ids); selection.current = ids; latest.current.controller.select(ids); }
    useEffect(() => {
        const ns = new Set(M.topics(options.scene.current!).map(n => n.id)), valid = selection.current.filter(id => ns.has(id));
        if (valid.length !== selection.current.length)
            select(valid);
        if (isolated && !ns.has(isolated))
            setIsolated(null);
    }, [options.controller.revision]);
    function commit(scene: CanvasScene, id?: string) {
        latest.current.controller.commit(scene, true, id);
        if (id)
            select([id]);
    }
    function withScene(fn: (s: CanvasScene) => CanvasScene) {
        const s = latest.current.scene.current;
        if (s)
            commit(fn(s));
    }
    function jumpTo(id: string) {
        withScene(s => M.revealTopic(s, id));
        setIsolated(null);
        setSearch(false);
        select([id]);
        latest.current.view.current?.center(id, .7);
    }
    function current() { return selection.current.at(-1); }
    const extras = useMindmapExtras({ ...options, selected, getSelected: () => selection.current, select, commit, say, showAll: () => setIsolated(null) });
    function openContext(id: string, x: number, y: number) { if (!selection.current.includes(id))
        select([id]); setContext({ x, y }); }
    function pasteValue(value?: string, duplicate = false) {
        const s = latest.current.scene.current;
        if (!s)
            return;
        const id = current(), n = M.topics(s).find(n => n.id === id), fragment = value ? C.parseFragment(value) : copiedBranch;
        const result = fragment ? C.pasteBranches(s, fragment, duplicate ? n?.parentId || null : id || null, duplicate ? id : undefined) : value ? C.pasteText(s, value, id || null) : null;
        if (!result?.ids.length) {
            say('剪贴板中没有可粘贴的主题');
            return;
        }
        commit(result.scene);
        select(result.ids);
        requestAnimationFrame(() => latest.current.view.current?.center(result.ids[0]));
    }
    async function paste() { try {
        const value = await navigator.clipboard.readText();
        if (value) {
            pasteValue(value);
            return;
        }
    }
    catch { } if (copiedBranch)
        pasteValue();
    else
        say('请使用 Ctrl V 粘贴，或先在工作台中拷贝主题'); }
    function editMeta(changes: Record<string, unknown>) {
        withScene(s => {
            let next = s;
            for (const id of selection.current)
                next = M.updateTopic(next, id, changes as Partial<M.Topic>);
            return next;
        });
    }
    function style(style: A.TopicStyle, replace = false) { withScene(s => A.applyStyle(s, selection.current, style, replace)); }
    function rename(id: string, title: string) {
        if (!title.trim())
            return;
        withScene(s => M.reconnect(A.resizeTopic(M.updateTopic(s, id, { title: title.trim() }), id)));
    }
    function open(kind: Dialog['kind']) {
        const s = latest.current.scene.current, id = current();
        if (!s || !id) {
            say('请先选择主题');
            return;
        }
        const m = A.topicMeta(s, id), shape = s.elements.find(e => e.id === id);
        setDialog({ kind, ids: [...selection.current], value: kind === 'tags' ? (m.tags || []).join('，') : kind === 'link' ? shape?.link || '' : kind === 'notes' ? m.notes || '' : kind === 'annotation' ? m.annotation || '' : kind === 'boundary' ? '主题分组' : kind === 'area' ? '专区' : kind === 'summary' ? '概要' : '' });
    }
    function applyDialog(value: string) {
        if (!dialog)
            return;
        const { kind, ids } = dialog, s = latest.current.scene.current!;
        let next = s;
        const id = crypto.randomUUID();
        if (kind === 'tags')
            next = A.setMeta(s, ids, { tags: value.split(/[,，\n]/).map(v => v.trim()).filter(Boolean) });
        else if (kind === 'link') {
            let link = value.trim();
            if (link && !/^(https?:|mailto:)/i.test(link))
                link = 'https://' + link;
            if (link && !/^(https?:\/\/[^\s]+|mailto:[^\s]+)$/i.test(link)) {
                say('请输入有效的网址或邮箱链接');
                return;
            }
            next = { ...s, elements: s.elements.map(e => ids.includes(e.id) ? A.patchElement(e, { link: link || null }) : e) };
        }
        else if (kind === 'comment') {
            if (!value.trim())
                return;
            for (const topicId of ids)
                next = A.setMeta(next, [topicId], { comments: [...(A.topicMeta(next, topicId).comments || []), { id, text: value.trim(), createdAt: new Date().toISOString() }] });
        }
        else if (kind === 'notes')
            next = A.setMeta(s, ids, { notes: value, notesHidden: false });
        else if (kind === 'annotation')
            next = A.setMeta(s, ids, { annotation: value });
        else if (kind === 'summary') {
            const b = A.topicBounds(M.topics(s).filter(n => ids.includes(n.id))), result = A.insertTopic(s, id, null, value.trim() || '概要');
            next = result.scene;
            const created = M.topics(next).find(n => n.id === id)!;
            next = { ...next, elements: next.elements.map(e => e.id === id || e.containerId === id ? A.patchElement(e, { x: e.x + b.x + b.width + 130 - created.x, y: e.y + b.y + b.height / 2 - created.height / 2 - created.y }) : e) };
            next = A.addDecoration(next, crypto.randomUUID(), ids, 'summary', value, id);
        }
        else
            next = A.addDecoration(s, id, ids, kind, value.trim() || (kind === 'area' ? '专区' : '主题分组'));
        for (const id of ids)
            next = A.resizeTopic(next, id);
        commit(M.reconnect(next));
        setDialog(null);
    }
    function connect(to: string) {
        const from = relation;
        if (!from)
            return;
        try {
            withScene(s => A.addRelation(s, crypto.randomUUID(), from, to));
            setRelation(null);
            select([to]);
        }
        catch (e) {
            say((e as Error).message);
        }
    }
    function run(command: A.Command | string, code?: string) {
        setContext(null);
        const o = latest.current, s = o.scene.current, id = current(), ids = selection.current, ns = s ? M.topics(s) : [];
        if (!s)
            return;
        try {
            if (extras.run(command))
                return;
            if (command === 'new') {
                o.newMap();
                return;
            }
            if (command === 'previous' || command === 'next') {
                o.adjacent(command === 'previous' ? -1 : 1);
                return;
            }
            if (command === 'undo' || command === 'redo') {
                o.controller[command]();
                return;
            }
            if (command === 'format') {
                setFormat(v => !v);
                return;
            }
            if (command === 'zoomIn' || command === 'zoomOut') {
                o.view.current?.zoom(command === 'zoomIn' ? 1.15 : 1 / 1.15);
                return;
            }
            if (command === 'actual') {
                o.view.current?.actual();
                return;
            }
            if (command === 'center') {
                setIsolated(null);
                const root = ns.find(n => !n.parentId);
                if (root) {
                    select([root.id]);
                    o.view.current?.center(root.id);
                }
                return;
            }
            if (command === 'paste') {
                void paste();
                return;
            }
            if (!id) {
                if (!ns.length && ['child', 'after', 'before', 'parent'].includes(command)) {
                    const fresh = crypto.randomUUID();
                    commit(A.insertTopic(s, fresh, null, '中心主题').scene, fresh);
                    requestAnimationFrame(() => o.view.current?.center(fresh));
                    return;
                }
                say('请先选择一个主题');
                return;
            }
            if (command === 'openEvidence') {
                const nodeId = researchNodeIdOf(ns.find(n => n.id === id)?.recordId);
                if (!nodeId) {
                    say('该主题没有对应的历史证据节点');
                    return;
                }
                if (!o.onOpenEvidence) {
                    say('当前画布没有接入历史证据');
                    return;
                }
                o.onOpenEvidence(nodeId);
                return;
            }
            if (command === 'child' || command === 'after' || command === 'before' || command === 'parent') {
                const fresh = crypto.randomUUID(), result = command === 'child' ? A.insertTopic(s, fresh, id) : command === 'parent' ? A.insertParent(s, fresh, id) : A.insertSibling(s, fresh, id, command === 'before');
                commit(result.scene, fresh);
                requestAnimationFrame(() => o.view.current?.center(fresh));
                return;
            }
            if (command === 'deleteSingle') {
                commit(A.deleteSingle(s, ids));
                select([]);
                return;
            }
            if (command === 'delete') {
                commit(A.deleteBranches(s, ids));
                select([]);
                return;
            }
            if (command === 'copy' || command === 'cut') {
                copiedBranch = C.copyBranches(s, ids);
                void navigator.clipboard?.writeText(JSON.stringify(copiedBranch)).catch(() => { });
                if (command === 'cut') {
                    commit(A.deleteBranches(s, ids));
                    select([]);
                }
                else
                    say('已拷贝所选主题及其分支');
                return;
            }
            if (command === 'duplicate') {
                const fragment = C.copyBranches(s, ids), target = ns.find(n => n.id === id), result = C.pasteBranches(s, fragment, target?.parentId || null, id);
                commit(result.scene);
                select(result.ids);
                return;
            }
            if (command === 'edit' || command === 'textStart' || command === 'textEnd') {
                o.view.current?.edit(id);
                return;
            }
            if (command === 'navigate' || command === 'multiNavigate') {
                const allowed = isolated ? new Set([isolated, ...M.descendants(ns, isolated)]) : null, visible = M.visibleTopics(s).filter(n => !allowed || allowed.has(n.id)), next = A.neighbor(visible, id, code || 'ArrowRight');
                if (next) {
                    select(command === 'multiNavigate' ? [...new Set([...ids, next])] : [next]);
                    o.view.current?.center(next);
                }
                return;
            }
            if (['up', 'down', 'first', 'last'].includes(command)) {
                commit(A.reorderTopic(s, id, command as 'up'));
                o.view.current?.center(id);
                return;
            }
            if (command === 'fold') {
                commit(M.setTopicFold(s, ids));
                return;
            }
            if (command === 'togglePositionLock') {
                const roots = M.branchRoots(ns, ids), lock = roots.some(n => !n.positionLocked);
                commit(M.changeTopology(s, new Map(roots.map(n => [n.id, { positionLocked: lock }]))));
                say(lock ? '分支位置已锁定' : '分支位置已解锁');
                return;
            }
            if (command === 'foldBranches') {
                commit(A.foldBranches(s, id));
                return;
            }
            if (command === 'isolate') {
                setIsolated(v => v === id ? null : id);
                o.view.current?.fit(isolated === id ? undefined : [id, ...M.descendants(ns, id)]);
                return;
            }
            if (command === 'relation') {
                if (ids.length >= 2) {
                    commit(A.addRelation(s, crypto.randomUUID(), ids[0], ids[1]));
                }
                else {
                    setRelation(id);
                    say('点击另一个主题建立联系，Esc 取消');
                }
                return;
            }
            if (command === 'tags' || command === 'link' || command === 'comment' || command === 'area' || command === 'boundary' || command === 'notes' || command === 'annotation' || command === 'summary') {
                open(command);
                return;
            }
            if (command === 'image') {
                imageInput.current?.click();
                return;
            }
            if (command === 'copyStyle') {
                sessionStorage.setItem('seer-mindmap-style', JSON.stringify(A.styleOf(s, id)));
                say('已拷贝主题样式');
                return;
            }
            if (command === 'pasteStyle') {
                const copied = sessionStorage.getItem('seer-mindmap-style');
                if (copied)
                    style(JSON.parse(copied), true);
                else
                    say('请先拷贝一个主题的样式');
                return;
            }
            if (command === 'resetStyle' || command === 'default') {
                style(A.DEFAULT_STYLE, true);
                return;
            }
            if (command === 'critical' || command === 'important' || command === 'removed') {
                style(A.PRESETS[command], true);
                return;
            }
            if (command === 'textOnly') {
                let next = A.applyStyle(s, ids, { fill: 'transparent', border: 'transparent', borderWidth: 0 });
                next = A.setMeta(next, ids, { plain: true });
                for (const id of ids)
                    next = A.resizeTopic(next, id);
                commit(next);
                return;
            }
            if (command === 'bold' || command === 'italic') {
                style({ [command]: !A.styleOf(s, id)[command] });
                return;
            }
            if (command === 'fontUp' || command === 'fontDown') {
                style({ fontSize: Math.max(10, Math.min(60, (A.styleOf(s, id).fontSize || 18) + (command === 'fontUp' ? 2 : -2))) });
                return;
            }
            if (command === 'updateStyle') {
                const root = ns.find(n => !n.parentId);
                if (root)
                    commit(A.setMeta(s, [root.id], { defaultStyle: A.styleOf(s, id) }));
                say('已更新此画布的新主题默认样式');
                return;
            }
        }
        catch (e) {
            say((e as Error).message);
        }
    }
    async function image(file: File) {
        const o = latest.current, s = o.scene.current, id = current();
        if (!s || !id)
            return;
        try {
            if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type))
                throw Error('支持 PNG、JPEG、WebP 和 GIF 图片');
            if (file.size > 8 * 1024 * 1024)
                throw Error('图片不能超过 8MB');
            const dataURL = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(Error('图片读取失败')); r.readAsDataURL(file); });
            const resource = await createMindmapFile(dataURL, file.type);
            const currentScene = latest.current.scene.current!;
            if (!M.topics(currentScene).some(n => n.id === id))
                throw Error('目标主题已移除');
            const merged = mergeMindmapFiles(currentScene.files, { [resource.id]: resource });
            const next = A.resizeTopic(A.setMeta({ ...currentScene, files: merged.files }, [id], { imageId: merged.ids.get(resource.id) }), id);
            const parentId = M.topics(currentScene).find(n => n.id === id)!.parentId;
            commit(M.compactBranches(next, new Set([parentId]), currentScene));
            say('图片已添加到主题');
        }
        catch (e) {
            say((e as Error).message);
        }
    }
    useEffect(() => {
        const inputTarget = (active: Element | null) => Boolean(active?.closest('input,textarea,select,[contenteditable]:not([contenteditable=false])') && !active?.closest('.map-todo'));
        const outside = (active: Element | null) => Boolean(active && active !== document.body && !active.closest('.canvas-studio,.map-context-menu'));
        const modal = () => Boolean(dialog || help || extras.dialog || search || latest.current.controller.sync);
        const startComposition = () => { composing.current = true; };
        const endComposition = () => { composing.current = false; };
        const key = (e: KeyboardEvent) => {
            if (composing.current || e.isComposing || e.keyCode === 229)
                return;
            const active = document.activeElement;
            if (modal()) {
                if (e.code === 'Escape' && !latest.current.controller.sync) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    setDialog(null);
                    setHelp(false);
                    setSearch(false);
                    extras.close();
                }
                return;
            }
            if (outside(active)) return;
            const input = inputTarget(active);
            if (!input && e.code === 'KeyF' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
                e.preventDefault();
                setContext(null);
                setSearch(true);
                return;
            }
            if (context && !e.ctrlKey && !e.metaKey && !e.altKey && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', 'Space', 'Tab'].includes(e.code))
                return;
            if (input) {
                if (active?.classList.contains('map-inline-text') && (e.ctrlKey || e.metaKey) && ['ArrowLeft', 'ArrowRight'].includes(e.code)) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    const t = active as HTMLTextAreaElement;
                    t.setSelectionRange(e.code === 'ArrowLeft' ? 0 : t.value.length, e.code === 'ArrowLeft' ? 0 : t.value.length);
                }
                else if (active?.classList.contains('map-inline-text') && (e.ctrlKey || e.metaKey) && ['KeyB', 'KeyI', 'Period', 'Comma'].includes(e.code)) {
                    const command = A.shortcut(e);
                    if (command) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        run(command);
                    }
                }
                return;
            }

            if (e.code === 'Escape') {
                if (context) {
                    setContext(null);
                    document.querySelector<HTMLElement>('.map-surface')?.focus();
                    return;
                }
                setRelation(null);
                setIsolated(null);
                return;
            }
            const command = A.shortcut(e);
            if (!command)
                return;
            if (command === 'paste' || command === 'copy' || command === 'cut')
                return;
            e.preventDefault();
            e.stopImmediatePropagation();
            run(command, e.code);
        };
        const pasteEvent = (e: ClipboardEvent) => { const active = document.activeElement; if (composing.current || modal() || inputTarget(active) || outside(active))
            return; const value = e.clipboardData?.getData('text/plain'); if (value) {
            e.preventDefault();
            setContext(null);
            pasteValue(value);
        } };
        const copyEvent = (e: ClipboardEvent) => { const active = document.activeElement; if (composing.current || modal() || inputTarget(active) || outside(active))
            return; const s = latest.current.scene.current; if (!s || !selection.current.length || !e.clipboardData)
            return; copiedBranch = C.copyBranches(s, selection.current); e.clipboardData.setData('text/plain', JSON.stringify(copiedBranch)); e.preventDefault(); setContext(null); if (e.type === 'cut') {
            commit(A.deleteBranches(s, selection.current));
            select([]);
        }
        else
            say('已拷贝所选主题及其分支'); };
        document.addEventListener('compositionstart', startComposition, true);
        document.addEventListener('compositionend', endComposition, true);
        document.addEventListener('keydown', key, true);
        document.addEventListener('paste', pasteEvent, true);
        document.addEventListener('copy', copyEvent, true);
        document.addEventListener('cut', copyEvent, true);
        return () => { document.removeEventListener('compositionstart', startComposition, true); document.removeEventListener('compositionend', endComposition, true); document.removeEventListener('keydown', key, true); document.removeEventListener('paste', pasteEvent, true); document.removeEventListener('copy', copyEvent, true); document.removeEventListener('cut', copyEvent, true); };
    });
    return { selected, select, search, setSearch, jumpTo, format, setFormat, isolated, setIsolated, relation, setRelation, connect, dialog, setDialog, applyDialog, message, say, help, setHelp, run, rename, style, editMeta, image, imageInput, context, openContext, closeContext: () => setContext(null), extras, canOpenEvidence: Boolean(options.onOpenEvidence) };
}
export type MindmapTools = ReturnType<typeof useMindmapTools>;
