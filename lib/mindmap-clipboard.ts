import { mergeMindmapFiles, type CanvasScene } from './mindmap-scene';
import * as M from './structured-mindmap';
import { patchElement, insertTopic } from './mindmap-actions';
export type MapFragment = {
    type: 'seer-mindmap-fragment';
    version: 1;
    rootIds: string[];
    elements: any[];
    files: Record<string, any>;
};
export function copyBranches(scene: CanvasScene, selected: string[]): MapFragment {
    const ns = M.topics(scene), rootIds = M.branchRoots(ns, selected).map(n => n.id), ids = new Set(rootIds.flatMap(id => [id, ...M.descendants(ns, id)]));
    const elements = scene.elements.filter(e => !e.isDeleted && (ids.has(e.id) || ids.has(e.containerId) || (ids.has(e.startBinding?.elementId) && ids.has(e.endBinding?.elementId)) || (e.customData?.mindmapDecoration && (e.customData.topicIds || []).every((id: string) => ids.has(id)) && (!e.customData.summaryTopicId || ids.has(e.customData.summaryTopicId)))));
    const fileIds = new Set<string>();
    for (const e of elements) {
        if (e.fileId)
            fileIds.add(e.fileId);
        const m = e.customData?.mindmap;
        if (m?.imageId)
            fileIds.add(m.imageId);
        for (const id of m?.attachments || [])
            fileIds.add(id);
    }
    return { type: 'seer-mindmap-fragment', version: 1, rootIds, elements: structuredClone(elements), files: Object.fromEntries(Object.entries(scene.files).filter(([id]) => fileIds.has(id))) };
}
export function parseFragment(text: string): MapFragment | null { try {
    const f = JSON.parse(text);
    if (f.type !== 'seer-mindmap-fragment' || f.version !== 1 || !Array.isArray(f.rootIds) || !Array.isArray(f.elements) || f.elements.length > 10000 || !f.elements.every((e: any) => typeof e.id === 'string' && Number.isFinite(e.x) && Number.isFinite(e.y)))
        return null;
    return { ...f, files: f.files && typeof f.files === 'object' && !Array.isArray(f.files) ? f.files : {} };
}
catch {
    return null;
} }
export function pasteBranches(scene: CanvasScene, fragment: MapFragment, parentId: string | null, afterId?: string) {
    const ns = M.topics(scene);
    if (parentId && !ns.some(n => n.id === parentId))
        throw Error('粘贴位置不存在');
    const ids = new Map(fragment.elements.map(e => [e.id, crypto.randomUUID()])), roots = new Set(fragment.rootIds), siblings = ns.filter(n => n.parentId === parentId), after = ns.find(n => n.id === afterId), following = after ? siblings.filter(n => n.order > after.order).sort((a, b) => a.order - b.order)[0] : undefined, start = after?.order ?? Math.max(0, ...siblings.map(n => n.order)), gap = following ? following.order - start : fragment.rootIds.length + 1;
    const resources = mergeMindmapFiles(scene.files, fragment.files);
    const elements = fragment.elements.map(old => {
        const e = structuredClone(old), id = ids.get(e.id)!, m = e.customData?.mindmap;
        delete e.customData?.researchNodeId;
        if (e.fileId) e.fileId = resources.ids.get(e.fileId) || e.fileId;
        if (m) {
            delete m.recordId;
            delete m.base;
            delete m.missing;
            delete m.defaultStyle;
            delete m.positionLocked;
            if (m.imageId) m.imageId = resources.ids.get(m.imageId) || m.imageId;
            if (Array.isArray(m.attachments)) m.attachments = m.attachments.map((id: string) => resources.ids.get(id) || id);
            m.id = id;
            m.parentId = roots.has(e.id) ? parentId : ids.get(m.parentId) || null;
            if (roots.has(e.id))
                m.order = start + gap * (fragment.rootIds.indexOf(e.id) + 1) / (fragment.rootIds.length + 1);
            if (m.topicLink && ids.has(m.topicLink))
                m.topicLink = ids.get(m.topicLink);
        }
        if (e.containerId)
            e.containerId = ids.get(e.containerId) || null;
        if (e.boundElements)
            e.boundElements = e.boundElements.filter((b: any) => ids.has(b.id)).map((b: any) => ({ ...b, id: ids.get(b.id) }));
        for (const field of ['startBinding', 'endBinding'])
            if (e[field])
                e[field] = { ...e[field], elementId: ids.get(e[field].elementId) || e[field].elementId };
        if (e.customData?.topicIds)
            e.customData.topicIds = e.customData.topicIds.map((id: string) => ids.get(id) || id);
        if (e.customData?.summaryTopicId)
            e.customData.summaryTopicId = ids.get(e.customData.summaryTopicId) || e.customData.summaryTopicId;
        return patchElement(e, { id, x: e.x + 45, y: e.y + 45 });
    });
    let next: CanvasScene = { ...scene, elements: [...scene.elements, ...elements], files: resources.files };
    if (parentId)
        next = M.updateTopic(next, parentId, { collapsed: false });
    const inserted = fragment.rootIds.map(id => ids.get(id)!);
    return { scene: M.compactBranches(M.placeNewBranches(next, inserted, afterId), new Set([parentId]), scene), ids: inserted };
}
export function pasteText(scene: CanvasScene, text: string, parentId: string | null) {
    let next = scene;
    const ids: string[] = [], headings: { level: number; id: string }[] = [], list: { indent: number; id: string }[] = [];
    const newIds = new Set<string>();
    let count = 0;
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const [, whitespace, body] = /^(\s*)(.*)$/.exec(line)!;
        const heading = /^(#{1,6})\s+(.+)$/.exec(body);
        const bullet = /^(?:[-+*]|\d+[.)])\s+(.+)$/.exec(body);
        const title = (heading?.[2] || bullet?.[1] || body).trim().slice(0, 500);
        if (!title) continue;
        if (count++ >= 100) break;
        const indent = whitespace.replace(/\t/g, '  ').length;
        if (heading) {
            list.length = 0;
            while (headings.length && headings.at(-1)!.level >= heading[1].length) headings.pop();
        } else {
            while (list.length && (list.at(-1)!.indent > indent || list.at(-1)!.indent === indent))
                list.pop();
        }
        const parent = (!heading && list.at(-1)?.id) || headings.at(-1)?.id || parentId;
        const id = crypto.randomUUID();
        next = insertTopic(next, id, parent, title, undefined, false).scene;
        newIds.add(id);
        if (parent === parentId) ids.push(id);
        if (heading) headings.push({ level: heading[1].length, id });
        else list.push({ indent, id });
    }
    // Position each level after its parent so direction and spacing match the active layout.
    const parents = new Set<string | null>([parentId]);
    let level = ids;
    while (level.length) {
        next = M.placeNewBranches(next, level);
        const children = M.topicChildren(M.topics(next));
        level = level.flatMap(id => {
            if (children.has(id)) parents.add(id);
            return (children.get(id) || []).filter(n => newIds.has(n.id)).map(n => n.id);
        });
    }
    return { scene: ids.length ? M.compactBranches(next, parents, scene) : scene, ids };
}
