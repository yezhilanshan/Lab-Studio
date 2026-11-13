'use client';
import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { createMindmapFile, mergeMindmapFiles, type CanvasScene } from '../lib/mindmap-scene';
import type { MapView } from './use-mindmap-tools';
import * as M from '../lib/structured-mindmap';
import * as A from '../lib/mindmap-actions';
export type ExtraKind = 'task' | 'web' | 'embed' | 'canvasLink' | 'topicLink' | 'marker' | 'sticker' | 'illustration' | 'attachment' | 'ai';
export type AssistMode = 'ideas' | 'breakdown' | 'explain' | 'image';
export type ExtraDialog = {
    kind: ExtraKind;
    ids: string[];
    value: string;
    mode?: AssistMode;
    instruction?: string;
};
type Options = {
    scene: MutableRefObject<CanvasScene | null>;
    selected: string[];
    getSelected: () => string[];
    select: (ids: string[]) => void;
    commit: (scene: CanvasScene, id?: string) => void;
    say: (message: string) => void;
    view: MutableRefObject<MapView | null>;
    maps?: {
        id: string;
        title: string;
    }[];
    openMap?: (id: string) => void;
    showAll?: () => void;
};
export function useMindmapExtras(options: Options) {
    const latest = useRef(options);
    latest.current = options;
    const [dialog, setDialog] = useState<ExtraDialog | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<any>(null), [config, setConfig] = useState({ baseUrl: '', model: '', imageModel: '', apiKey: '', apiType: 'openai' });
    const attachmentInput = useRef<HTMLInputElement | null>(null), abort = useRef<AbortController | null>(null), request = useRef(0), pendingAttachment = useRef<string[]>([]);
    useEffect(() => () => { abort.current?.abort(); request.current++; }, []);
    function close() { abort.current?.abort(); request.current++; setDialog(null); setBusy(false); setError(''); setResult(null); }
    function update(ids: string[], changes: Record<string, unknown>) { const o = latest.current; let next = A.setMeta(o.scene.current!, ids, changes); for (const id of ids)
        next = A.resizeTopic(next, id); o.commit(M.reconnect(next)); }
    function run(command: string) {
        if (!['todo', 'task', 'web', 'embed', 'canvasLink', 'topicLink', 'attachment', 'marker', 'sticker', 'illustration', 'generateImage', 'explain'].includes(command) && !command.startsWith('ideas:') && !command.startsWith('breakdown:'))
            return false;
        const o = latest.current, id = o.getSelected().at(-1), s = o.scene.current;
        if (!id || !s) {
            o.say('请先选择主题');
            return true;
        }
        const ids = [...o.getSelected()], m = A.topicMeta(s, id);
        setError('');
        setResult(null);
        if (command === 'todo') {
            update(ids, { todo: m.todo ? null : { done: false } });
            return true;
        }
        if (command === 'attachment') {
            pendingAttachment.current = ids;
            attachmentInput.current?.click();
            return true;
        }
        const mode: AssistMode | undefined = command.startsWith('ideas:') ? 'ideas' : command.startsWith('breakdown:') ? 'breakdown' : command === 'generateImage' ? 'image' : command === 'explain' ? 'explain' : undefined;
        if (mode) {
            const n = M.topics(s).find(n => n.id === id)!;
            setDialog({ kind: 'ai', ids, mode, instruction: command.split(':')[1] || '', value: mode === 'image' ? '为“' + n.title + '”生成一张简洁的研究示意图。' : n.title });
            return true;
        }
        setDialog({ kind: command as ExtraKind, ids, value: command === 'task' ? JSON.stringify(m.task || { owner: '', start: '', due: '', progress: 0, priority: '普通' }) : command === 'embed' ? m.embed || '' : command === 'web' ? s.elements.find(e => e.id === id)?.link || '' : command === 'canvasLink' ? m.canvasLink || '' : command === 'topicLink' ? m.topicLink || '' : m[command] || '' });
        return true;
    }
    function save(value: string) {
        if (!dialog)
            return;
        const { kind, ids } = dialog;
        let changes: Record<string, unknown> = {};
        if (kind === 'task') {
            try {
                const task = JSON.parse(value);
                if (task.start && task.due && task.start > task.due) {
                    setError('截止日期不能早于开始日期');
                    return;
                }
                changes = { task: { owner: String(task.owner || '').slice(0, 100), start: String(task.start || ''), due: String(task.due || ''), progress: Math.max(0, Math.min(100, Number(task.progress) || 0)), priority: String(task.priority || '普通') } };
            }
            catch {
                setError('任务格式不正确');
                return;
            }
        }
        else if (kind === 'web' || kind === 'embed') {
            let url = value.trim();
            if (url && !/^https?:\/\//i.test(url))
                url = 'https://' + url;
            try {
                const parsed = new URL(url);
                if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password)
                    throw Error();
                url = parsed.href;
            }
            catch {
                setError('请填写有效的网页地址');
                return;
            }
            if (kind === 'web') {
                const o = latest.current, s = o.scene.current!;
                o.commit({ ...s, elements: s.elements.map(e => ids.includes(e.id) ? A.patchElement(e, { link: url }) : e) });
                close();
                return;
            }
            changes = { embed: url };
        }
        else if (kind === 'canvasLink')
            changes = { canvasLink: value };
        else if (kind === 'topicLink')
            changes = { topicLink: value };
        else if (kind === 'marker' || kind === 'sticker' || kind === 'illustration')
            changes = { [kind]: value };
        else
            return;
        update(ids, changes);
        close();
    }
    function toggleTodo(id: string) { const s = latest.current.scene.current!, m = A.topicMeta(s, id); update([id], { todo: { done: !m.todo?.done } }); }
    function openMap(id: string) { if (!latest.current.maps?.some(m => m.id === id)) {
        latest.current.say('目标导图已移除');
        return;
    } latest.current.openMap?.(id); }
    function jump(id: string) {
        const o = latest.current, s = o.scene.current!;
        if (!M.topics(s).some(n => n.id === id)) {
            o.say('目标主题已移除');
            return;
        }
        o.showAll?.();
        o.commit(M.revealTopic(s, id));
        o.select([id]);
        o.view.current?.center(id, .7);
    }
    async function attach(files: FileList | File[]) {
        const o = latest.current, ids = [...(pendingAttachment.current.length ? pendingAttachment.current : o.getSelected())];
        if (!ids.length)
            return;
        try {
            const loaded = [];
            for (const file of Array.from(files)) {
                if (file.size > 8 * 1024 * 1024)
                    throw Error('每个附件不能超过 8MB');
                const dataURL = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(Error('附件读取失败')); reader.readAsDataURL(file); });
                loaded.push(await createMindmapFile(dataURL, file.type || 'application/octet-stream', file.name));
            }
            let next = latest.current.scene.current!;
            const valid = ids.filter(id => M.topics(next).some(n => n.id === id));
            if (!valid.length)
                throw Error('目标主题已移除');
            const merged = mergeMindmapFiles(next.files, Object.fromEntries(loaded.map(f => [f.id, f])));
            next = { ...next, files: merged.files };
            for (const topicId of valid) {
                next = A.setMeta(next, [topicId], { attachments: [...new Set([...(A.topicMeta(next, topicId).attachments || []), ...merged.ids.values()])] });
                next = A.resizeTopic(next, topicId);
            }
            o.commit(M.reconnect(next));
            o.say('附件已保存到主题');
        }
        catch (e) {
            o.say((e as Error).message);
        }
        finally {
            pendingAttachment.current = [];
        }
    }
    function removeAttachment(topicId: string, fileId: string) { update([topicId], { attachments: (A.topicMeta(latest.current.scene.current!, topicId).attachments || []).filter((id: string) => id !== fileId) }); }
    async function generate(prompt: string) {
        if (!dialog?.mode)
            return;
        const o = latest.current, ns = M.topics(o.scene.current!), n = ns.find(n => n.id === dialog.ids[0]);
        if (!n)
            return;
        setBusy(true);
        setError('');
        setResult(null);
        abort.current?.abort();
        const controller = new AbortController();
        abort.current = controller;
        const token = ++request.current;
        try {
            const context = [n.title, n.notes, ...ns.filter(c => c.parentId === n.id).map(c => c.title)].filter(Boolean).join('\n').slice(0, 30000);
            const response = await fetch('/api/mindmap-assist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...config, model: dialog.mode === 'image' ? config.imageModel : config.model, mode: dialog.mode, instruction: dialog.instruction, prompt, context }), signal: controller.signal }), body = await response.json() as {
                error?: string;
                image?: string;
                nodes?: any[];
                explanation?: string;
            };
            if (!response.ok)
                throw Error(body.error || '生成失败');
            if (request.current === token)
                setResult(body);
        }
        catch (e) {
            if (request.current === token && !(e instanceof DOMException && e.name === 'AbortError'))
                setError((e as Error).message);
        }
        finally {
            if (request.current === token)
                setBusy(false);
        }
    }
    async function apply() {
        if (!dialog || !result)
            return;
        const o = latest.current, id = dialog.ids[0];
        let next = o.scene.current!;
        if (!M.topics(next).some(n => n.id === id)) {
            setError('生成期间目标主题已移除');
            return;
        }
        if (result.image) {
            const token = request.current;
            let resource;
            try { resource = await createMindmapFile(result.image, 'image/png'); }
            catch (error) { setError((error as Error).message); return; }
            if (token !== request.current) return;
            next = latest.current.scene.current!;
            if (!M.topics(next).some(n => n.id === id)) { setError('生成期间目标主题已移除'); return; }
            const merged = mergeMindmapFiles(next.files, { [resource.id]: resource });
            next = A.setMeta({ ...next, files: merged.files }, [id], { imageId: merged.ids.get(resource.id), plain: false });
            next = A.resizeTopic(next, id);
        }
        else if (result.explanation)
            next = A.setMeta(next, [id], { notes: [A.topicMeta(next, id).notes, result.explanation].filter(Boolean).join('\n\n') });
        else if (result.nodes) {
            let count = 0;
            const add = (nodes: any[], parent: string, depth: number) => { for (const node of nodes) {
                if (count++ >= 40 || depth > 3)
                    break;
                const fresh = crypto.randomUUID();
                next = A.insertTopic(next, fresh, parent, String(node.title).slice(0, 500)).scene;
                if (dialog.mode === 'breakdown')
                    next = A.setMeta(next, [fresh], { todo: { done: false } });
                if (Array.isArray(node.children))
                    add(node.children, fresh, depth + 1);
            } };
            add(result.nodes, id, 0);
        }
        next = A.resizeTopic(next, id);
        o.commit(M.reconnect(next));
        close();
    }
    return { dialog, setDialog, close, run, save, busy, error, result, config, setConfig, generate, apply, attachmentInput, attach, toggleTodo, openMap, jump, removeAttachment };
}
export type MindmapExtras = ReturnType<typeof useMindmapExtras>;
