export type CanvasScene={elements:any[];files:Record<string,any>;appState?:Record<string,any>};
export function validateScene(scene:unknown, enforceElementLimit = true):string{
 if(!scene||typeof scene!=='object')return '画布格式不正确';
 const s=scene as CanvasScene;if(!Array.isArray(s.elements)||(enforceElementLimit&&s.elements.length>10000))return '画布最多支持10000个图形';
 const ids=new Set<string>();for(const e of s.elements){if(!e||typeof e.id!=='string'||!e.id||ids.has(e.id)||typeof e.type!=='string'||!Number.isFinite(e.x)||!Number.isFinite(e.y))return '图形数据不完整或ID重复';ids.add(e.id)}
 if(s.files&&(!s.files||typeof s.files!=='object'||Array.isArray(s.files)))return '附件格式不正确';
 return '';
}
export function cleanScene(elements:readonly any[],state:Record<string,any>,files:Record<string,any>):CanvasScene{
 return {elements:[...elements],files,appState:{viewBackgroundColor:state.viewBackgroundColor||'#ffffff',gridSize:state.gridSize||null,theme:state.theme||'light'}};
}
// SDK normalization can adjust geometry without incrementing element versions.
export function sceneFingerprint(scene:CanvasScene){return JSON.stringify([scene.elements,Object.entries(scene.files||{}).map(([id,file])=>[id,file.dataURL]),scene.appState])}

export type MindmapDraft = { scene: CanvasScene; title: string; revision: string };
export function readMindmapDraft(value: CanvasScene | MindmapDraft | undefined, title: string) {
    if (!value || typeof value !== 'object') return undefined;
    const draft: MindmapDraft = 'scene' in value ? value : { scene: value, title, revision: '' };
    return draft.scene && !validateScene(draft.scene, false) && typeof draft.title === 'string' ? draft : undefined;
}

export async function createMindmapFile(dataURL: string, mimeType: string, name?: string) {
    const bytes = new TextEncoder().encode(JSON.stringify([dataURL, mimeType, name || '']));
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    const id = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
    return { id, dataURL, mimeType, created: Date.now(), ...(name ? { name, kind: 'attachment' } : {}) };
}

export function mergeMindmapFiles(existing: CanvasScene['files'], incoming: CanvasScene['files']) {
    const files = { ...existing }, ids = new Map<string, string>();
    const key = (f: any) => JSON.stringify([f.dataURL, f.mimeType, f.name]);
    const indexed = new Map(Object.entries(existing).filter(([, f]) => f?.dataURL).map(([id, f]) => [key(f), id]));
    for (const [id, file] of Object.entries(incoming)) {
        if (!file?.dataURL) continue;
        const content = key(file), reused = indexed.get(content);
        const target = reused || (Object.hasOwn(files, id) ? crypto.randomUUID() : id);
        if (!reused) {
            Object.defineProperty(files, target, { value: { ...file, id: target }, enumerable: true, writable: true, configurable: true });
            indexed.set(content, target);
        }
        ids.set(id, target);
    }
    return { files, ids };
}
