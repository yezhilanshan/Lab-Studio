const ts = require('typescript'), fs = require('node:fs'), assert = require('node:assert/strict');
function moduleFrom(path) {
  const out = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('exports', 'require', out)(exports, require);
  return exports;
}
const G = moduleFrom('lib/mindmap-gesture.ts');
const kind = (over) => G.gestureKind({ pointerType: 'mouse', button: 0, hitTopic: false, pointers: 1, ...over });

// The desktop path must not change: right button pans, left on a topic drags, left on empty marquees.
assert.equal(kind({ button: 2, hitTopic: true }), 'pan');
assert.equal(kind({ button: 2, hitTopic: false }), 'pan');
assert.equal(kind({ button: 0, hitTopic: true }), 'drag');
assert.equal(kind({ button: 0, hitTopic: false }), 'marquee');
assert.equal(kind({ pointerType: 'pen', button: 2, hitTopic: true }), 'pan');

// Touch has no right button: one finger on empty must pan, on a topic must drag.
assert.equal(kind({ pointerType: 'touch', button: 0, hitTopic: false }), 'pan');
assert.equal(kind({ pointerType: 'touch', button: 0, hitTopic: true }), 'drag');
// A second finger always becomes a pinch, whatever the first one was doing.
assert.equal(kind({ pointerType: 'touch', hitTopic: true, pointers: 2 }), 'pinch');
assert.equal(kind({ pointerType: 'mouse', button: 0, pointers: 2 }), 'pinch');

const menu = (over) => G.opensContextMenu({ kind: 'pan', moved: false, primary: 't1', longPress: false, ...over });
assert.equal(menu({}), true, '右键单击主题仍打开菜单');
assert.equal(menu({ primary: undefined }), false);
assert.equal(menu({ moved: true }), false);
assert.equal(menu({ kind: 'drag' }), false);
assert.equal(menu({ kind: 'drag', longPress: true }), true, '触屏长按主题打开菜单');
assert.equal(menu({ kind: 'drag', longPress: false }), false, '触屏普通点按不打开菜单');
assert.equal(menu({ kind: 'pan', longPress: true }), true);

const anchor = { distance: 100, center: { x: 200, y: 150 }, viewport: { x: 40, y: 30, k: 1 } };
const same = G.pinchViewport(anchor, { distance: 100, center: { x: 200, y: 150 } });
assert.deepEqual(same, anchor.viewport, '手指未动时视口不得漂移');

const zoomed = G.pinchViewport(anchor, { distance: 200, center: { x: 200, y: 150 } });
assert.equal(zoomed.k, 2);
// The world point under the pinch centre must stay under that centre.
const world = { x: (200 - 40) / 1, y: (150 - 30) / 1 };
assert.equal(zoomed.x + world.x * zoomed.k, 200);
assert.equal(zoomed.y + world.y * zoomed.k, 150);

// Panning while pinching moves the anchor with the fingers.
const moved = G.pinchViewport(anchor, { distance: 100, center: { x: 260, y: 190 } });
assert.equal(moved.k, 1);
assert.equal(moved.x, 100);
assert.equal(moved.y, 70);

const clamped = G.pinchViewport(anchor, { distance: 100000, center: { x: 200, y: 150 } });
assert.equal(clamped.k, 4, '缩放必须停在上限');
const zero = G.pinchViewport({ ...anchor, distance: 0 }, { distance: 0, center: { x: 200, y: 150 } });
assert.ok(Number.isFinite(zero.k) && Number.isFinite(zero.x) && Number.isFinite(zero.y), '零距离不得产生 NaN');

console.log('Mind-map gestures verified: desktop mouse path unchanged, touch pan/drag, two-finger pinch, long-press menu, anchored zoom with clamping.');