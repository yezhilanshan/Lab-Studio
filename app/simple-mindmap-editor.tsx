'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { MutableRefObject } from 'react';
import type { CanvasScene } from '../lib/mindmap-scene';
import type { useStructuredMindmap } from './use-structured-mindmap';
import { useMindmapTools, MapView } from './use-mindmap-tools';
import { MindmapSurface } from './mindmap-surface';
import { MindmapToolbar, MindmapFormat, MindmapDialogs } from './mindmap-toolbar';
import { searchTopics } from '../lib/mindmap-actions';
import { visibleScene, visibleTopics, topics } from '../lib/structured-mindmap';
import './simple-mindmap.css';
import './mindmap-context.css';
import { MindmapContextMenu } from './mindmap-context-menu';
import { MindmapExtrasDialogs } from './mindmap-extras-ui';
type Props = {
    scene: MutableRefObject<CanvasScene | null>;
    controller: ReturnType<typeof useStructuredMindmap>;
    api: MutableRefObject<any>;
    newMap: () => void;
    adjacent: (delta: number) => void;
    importFile: () => void;
    exportFile: (svg?: boolean) => void;
    linked: boolean;
    idea?: string;
    onOpenEvidence?: (nodeId: string) => void;
    focusRecordId?: string;
    maps: {
        id: string;
        title: string;
    }[];
    openMap: (id: string) => void;
};
export function SimpleMindmapEditor(props: Props) {
    const view = useRef<MapView | null>(null), svg = useRef<SVGSVGElement | null>(null), [zoom, setZoom] = useState(1), [exporting, setExporting] = useState(false), tools = useMindmapTools({ ...props, view });
    const latest = useRef({ props, tools });
    latest.current = { props, tools };
    useEffect(() => {
        const api = { updateScene: (data: any) => {
                if (data.appState?.selectedElementIds)
                    latest.current.tools.select(Object.keys(data.appState.selectedElementIds).filter(id => data.appState.selectedElementIds[id]));
            }, getSceneElements: () => visibleScene(latest.current.props.scene.current!).elements.filter(e => !e.isDeleted), getAppState: () => ({ selectedElementIds: Object.fromEntries(latest.current.tools.selected.map(id => [id, true])), viewBackgroundColor: '#ffffff', theme: 'light' }), getFiles: () => latest.current.props.scene.current!.files, focus: (id: string, zoom = 0.8) => view.current?.center(id, zoom), scrollToContent: (elements?: any[], options?: any) => {
                const ids = elements?.map(e => e.id);
                if (options?.fitToContent)
                    view.current?.fit(ids);
                else if (ids?.length)
                    view.current?.center(ids[0]);
                else
                    view.current?.fit();
            }, getSvg: () => {
                const source = svg.current;
                if (!source)
                    return '';
                let clone: SVGSVGElement;
                flushSync(() => setExporting(true));
                try { clone = source.cloneNode(true) as SVGSVGElement; }
                finally { flushSync(() => setExporting(false)); }
                clone.querySelector('.map-selection-rect')?.remove();
                clone.querySelectorAll('.map-fold-control,.map-decoration-remove,.map-quick-child,.map-drop-preview').forEach(e => e.remove());
                clone.querySelectorAll('.selected,.drop-target').forEach(e => e.classList.remove('selected', 'drop-target'));
                const loaded = visibleTopics(latest.current.props.scene.current!), ns = loaded.length ? loaded : [{ x: 0, y: 0, width: 300, height: 200 }];
                const minX = Math.min(...ns.map(n => n.x)) - 50, minY = Math.min(...ns.map(n => n.y)) - 90, width = Math.max(...ns.map(n => n.x + n.width)) - minX + 80, height = Math.max(...ns.map(n => n.y + n.height)) - minY + 80;
                clone.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
                clone.setAttribute('width', String(width));
                clone.setAttribute('height', String(height));
                clone.querySelector('.map-world')?.removeAttribute('transform');
                clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                return new XMLSerializer().serializeToString(clone);
            } };
        props.api.current = api;
        const ns = topics(props.scene.current!), target = props.focusRecordId ? ns.find(n => n.recordId === props.focusRecordId) : null;
        if (target) {
            tools.jumpTo(target.id);
            tools.say('已定位到「' + target.title + '」');
        }
        else {
            const root = ns.find(n => !n.parentId);
            if (root)
                tools.select([root.id]);
        }
        return () => {
            if (props.api.current === api)
                props.api.current = null;
        };
    }, []);
    const scene = props.scene.current!;
    return <div className="simple-map-editor"><MindmapToolbar tools={tools} view={view} zoom={zoom} canUndo={props.controller.canUndo} canRedo={props.controller.canRedo} linked={props.linked} sync={d => void props.controller.preview(d)} importFile={props.importFile} exportFile={props.exportFile} layout={props.controller.layout}/><div className="map-work-area"><MindmapSurface scene={scene} tools={tools} view={view} idea={props.idea} svgRef={svg} exporting={exporting} commit={s => props.controller.commit(s)} zoomChanged={setZoom}/>{tools.format && <MindmapFormat tools={tools} scene={scene}/>}</div><input ref={tools.imageInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden aria-label="上传主题图片" onChange={e => {
            if (e.target.files?.[0])
                void tools.image(e.target.files[0]);
            e.target.value = '';
        }}/><MindmapDialogs tools={tools} scene={scene}/>{tools.search && <MindmapSearch scene={scene} close={() => tools.setSearch(false)} jump={tools.jumpTo}/>}<MindmapContextMenu tools={tools}/><MindmapExtrasDialogs tools={tools} scene={scene} maps={props.maps}/><input type="file" multiple hidden aria-label="上传主题附件" ref={tools.extras.attachmentInput} onChange={e => { if (e.target.files)
        void tools.extras.attach(e.target.files); e.target.value = ''; }}/>{tools.message && <div className="map-toast" role="status">{tools.message}</div>}</div>;
}

function MindmapSearch({ scene, close, jump }: { scene: CanvasScene; close: () => void; jump: (id: string) => void }) {
    const [query, setQuery] = useState(''), [active, setActive] = useState(0);
    const results = useMemo(() => searchTopics(scene, query), [scene, query]);
    const byId = useMemo(() => new Map(topics(scene).map(n => [n.id, n])), [scene]);
    const input = useRef<HTMLInputElement>(null);
    const shown = results.slice(0, 100);
    useEffect(() => {
        input.current?.focus();
        return () => document.querySelector<HTMLElement>('.map-surface')?.focus({ preventScroll: true });
    }, []);
    useEffect(() => {
        document.getElementById('map-search-result-' + active)?.scrollIntoView({ block: 'nearest' });
    }, [active]);
    function path(id: string) {
        const parts: string[] = [];
        for (let n = byId.get(id); n?.parentId; n = byId.get(n.parentId)) {
            const parent = byId.get(n.parentId);
            if (parent) parts.push(parent.title);
        }
        return parts.reverse().join(' › ');
    }
    return <div className="map-modal-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) close(); }}>
        <section className="map-modal map-search" role="dialog" aria-modal="true" aria-label="搜索导图">
            <header><h3>搜索导图</h3><button type="button" aria-label="关闭搜索" onClick={close}>×</button></header>
            <div className="map-dialog-body">
                <input ref={input} aria-label="搜索标题、笔记、标签或实验编号" placeholder="标题、笔记、标签或实验编号" value={query}
                    onChange={e => { setQuery(e.target.value); setActive(0); }}
                    onKeyDown={e => {
                        if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229 || !shown.length) return;
                        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                            e.preventDefault();
                            setActive(i => (i + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length);
                        } else if (e.key === 'Enter') {
                            e.preventDefault();
                            jump(shown[active]?.id || shown[0].id);
                        }
                    }}/>
                {query.trim() && <small role="status">{results.length} 项结果{results.length > shown.length && ' · 显示前 100 项'}</small>}
                <div className="map-search-results">{shown.map((n, i) =>
                    <button id={'map-search-result-' + i} key={n.id} type="button" data-active={active === i} onClick={() => jump(n.id)}>
                        <strong>{n.title}</strong><small>{[path(n.id), n.recordId].filter(Boolean).join(' · ')}</small>
                    </button>)}</div>
            </div>
        </section>
    </div>;
}
