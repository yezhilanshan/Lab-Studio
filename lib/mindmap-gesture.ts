export type GestureKind = 'pan' | 'marquee' | 'drag' | 'pinch';
export type Point = { x: number; y: number };
export type Viewport = { x: number; y: number; k: number };

// Touch reports button 0 for every contact, so the right-button pan branch is unreachable
// there. One finger on empty canvas pans instead of marquee-selecting.
export function gestureKind(input: { pointerType: string; button: number; hitTopic: boolean; pointers: number }): GestureKind {
    if (input.pointers >= 2) return 'pinch';
    if (input.pointerType === 'touch') return input.hitTopic ? 'drag' : 'pan';
    if (input.button === 2) return 'pan';
    return input.hitTopic ? 'drag' : 'marquee';
}

export function opensContextMenu(g: { kind: GestureKind; moved: boolean; primary?: string; longPress: boolean }) {
    return Boolean(g.primary) && !g.moved && (g.kind === 'pan' || g.longPress);
}

export type PinchAnchor = { distance: number; center: Point; viewport: Viewport };

// Keeps the world point that started under the pinch centre under the fingers as they move.
export function pinchViewport(anchor: PinchAnchor, next: { distance: number; center: Point }, min = .04, max = 4): Viewport {
    const scale = anchor.distance > 0 ? next.distance / anchor.distance : 1;
    const k = Math.max(min, Math.min(max, anchor.viewport.k * scale));
    const world = {
        x: (anchor.center.x - anchor.viewport.x) / anchor.viewport.k,
        y: (anchor.center.y - anchor.viewport.y) / anchor.viewport.k,
    };
    return { k, x: next.center.x - world.x * k, y: next.center.y - world.y * k };
}