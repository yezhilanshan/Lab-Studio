export type Rect = { x: number; y: number; width: number; height: number };

export function intersects(a: Rect, b: Rect) {
    return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

export function covering<T extends Rect>(items: T[]): Rect {
    let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
    for (const item of items) {
        x = Math.min(x, item.x);
        y = Math.min(y, item.y);
        right = Math.max(right, item.x + item.width);
        bottom = Math.max(bottom, item.y + item.height);
    }
    return { x, y, width: right - x, height: bottom - y };
}

type Bucket<T> = { box: Rect; items: T[] } | { box: Rect; left: Bucket<T>; right: Bucket<T> };
export function spatialIndex<T extends Rect>(items: T[]) {
    function build(nodes: T[]): Bucket<T> {
        const box = covering(nodes);
        if (nodes.length <= 16) return { box, items: nodes };
        const axis = box.width >= box.height ? 'x' : 'y';
        nodes.sort((a, b) => a[axis] - b[axis]);
        const half = nodes.length >>> 1;
        return { box, left: build(nodes.slice(0, half)), right: build(nodes.slice(half)) };
    }
    const root = items.length ? build([...items]) : null;
    return (area: Rect) => {
        const hits: T[] = [];
        const stack = root ? [root] : [];
        while (stack.length) {
            const node = stack.pop()!;
            if (!intersects(node.box, area)) continue;
            if ('items' in node) {
                for (const item of node.items) if (intersects(item, area)) hits.push(item);
            } else {
                stack.push(node.left, node.right);
            }
        }
        return hits;
    };
}
