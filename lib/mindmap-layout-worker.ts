import { layoutTopics } from './structured-mindmap';
import type { LayoutDirection } from './structured-mindmap';
import type { CanvasScene } from './mindmap-scene';

self.onmessage = (event: MessageEvent<{ scene: CanvasScene; direction: LayoutDirection }>) => {
    try {
        self.postMessage({ result: layoutTopics(event.data.scene, event.data.direction) });
    } catch (error) {
        self.postMessage({ error: (error as Error).message });
    }
};
