const fs = require('node:fs'), ts = require('typescript'), assert = require('node:assert/strict'), path = require('node:path');
const modules = new Map();
function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function('exports', 'require', js)(exports, p => load(path.resolve(path.dirname(file), p + '.ts')));
    return exports;
}
const A = load('lib/mindmap-actions.ts'), M = load('lib/structured-mindmap.ts'), C = load('lib/mindmap-clipboard.ts');
let scene = { files: {}, elements: [] };
for (const [id, parent] of [['root', null], ['a', 'root'], ['b', 'root'], ['a1', 'a'], ['b1', 'b']])
    scene = A.insertTopic(scene, id, parent, id).scene;
scene = M.layoutTopics(scene, 'down');
const xy = (s, id) => M.topics(s).filter(n => n.id === id).map(n => [n.x, n.y])[0];
const tests = {
    'sibling insertion preserves orientation and unrelated branches'() {
        const next = A.insertSibling(scene, 'a2', 'a1').scene;
        assert.equal(next.appState.mindmapOrientation, 'vertical');
        for (const id of ['root', 'b', 'b1']) assert.deepEqual(xy(next, id), xy(scene, id));
        assert.equal(xy(next, 'a2')[1], xy(next, 'a1')[1]);
    },
    'folding keeps unrelated branches and locked positions'() {
        const pinned = M.updateTopic(scene, 'a1', { positionLocked: true });
        const next = M.setTopicFold(pinned, ['a'], true);
        assert.deepEqual(xy(next, 'b'), xy(scene, 'b'));
        assert.deepEqual(xy(next, 'a1'), xy(scene, 'a1'));
        assert(!M.visibleTopics(next).some(n => n.id === 'a1'));
        assert(M.topics(next).find(n => n.id === 'a1').positionLocked);
    },
    'multi-branch drop moves only top-level selection and rejects cycles'() {
        const next = M.dropBranches(scene, ['a', 'a1'], { targetId: 'b', kind: 'child' });
        assert.equal(M.topics(next).find(n => n.id === 'a').parentId, 'b');
        assert.equal(M.topics(next).find(n => n.id === 'a1').parentId, 'a');
        assert.throws(() => M.dropBranches(scene, ['a'], { targetId: 'a1', kind: 'child' }), /后代/);
        const keys = next.elements.filter(e => e.customData?.mindmapEdge && !e.isDeleted).map(e => [e.endBinding.elementId, e.startBinding.elementId]);
        assert.deepEqual(Object.fromEntries(keys), { a: 'b', a1: 'a', b: 'root', b1: 'b' });
        const ordered = M.dropBranches(scene, ['b'], { targetId: 'a', kind: 'before' });
        assert.deepEqual(M.topics(ordered).filter(n => n.parentId === 'root').map(n => n.id), ['b', 'a']);
    },
    'pasted Markdown and mixed indentation form a tree'() {
        const result = C.pasteText(scene, '# 事件边界\n- 传统\n\t- MS-TCN\n  - ASFormer\n## LLM\n  - Event Tokens', 'root');
        const ns = M.topics(result.scene), byTitle = new Map(ns.map(n => [n.title, n]));
        const parent = title => ns.find(n => n.id === byTitle.get(title)?.parentId)?.title;
        assert.equal(parent('事件边界'), 'root');
        assert.equal(parent('传统'), '事件边界');
        assert.equal(parent('MS-TCN'), '传统');
        assert.equal(parent('ASFormer'), '传统');
        assert.equal(parent('LLM'), '事件边界');
        assert.equal(parent('Event Tokens'), 'LLM');
        assert.equal(result.ids.length, 1);
    },
    'search includes folded descendants and reveals the ancestor path'() {
        const tagged = A.setMeta(M.updateTopic(scene, 'a1', { notes: 'Boundary Token', recordId: 'exp-042' }), ['a1'], { tags: ['时序'] });
        const folded = M.updateTopic(tagged, 'a', { collapsed: true });
        for (const q of ['boundary token', 'EXP-042', '时序']) assert.equal(A.searchTopics(folded, q)[0].id, 'a1');
        assert(M.visibleTopics(M.revealTopic(folded, 'a1')).some(n => n.id === 'a1'));
    },
};
tests['sync retries converge and preserve unrelated remote fields'] = () => {
    const old = { id: 'exp-1', kind: 'node', idea: 'idea1', title: 'Original', notes: 'Old' };
    const write = { ...old, title: 'Local' }, applied = { ...write, notes: 'Remote' };
    assert.deepEqual(M.prepareRecordWrites([write], [old], [applied]), [applied]);
    assert.deepEqual(M.prepareRecordWrites([write], [], [write]), [write]);
    assert.throws(() => M.prepareRecordWrites([write], [old], [{ ...applied, title: 'Concurrent' }]), /预览后/);
    assert.throws(() => M.prepareRecordWrites([write], [], [{ ...write, notes: 'Concurrent' }]), /创建/);
};
tests['draft recovery preserves the title and accepts legacy stored scenes'] = () => {
    const { readMindmapDraft } = load('lib/mindmap-scene.ts');
    assert.equal(readMindmapDraft(scene, 'Legacy').title, 'Legacy');
    assert.equal(readMindmapDraft({ scene, title: 'Unsaved', revision: 'latest' }, 'Server').title, 'Unsaved');
    assert.equal(readMindmapDraft({ scene: { elements: null }, title: 'Broken', revision: 'x' }, 'Server'), undefined);
};
tests['spatial queries match brute force across sparse and dense areas'] = () => {
    const { spatialIndex, intersects } = load('lib/mindmap-spatial.ts');
    const items = Array.from({ length: 1000 }, (_, id) => ({ id, x: id % 10 * 210, y: Math.floor(id / 10) * 140, width: 200, height: 68 }));
    const query = spatialIndex(items);
    for (const area of [{ x: -30, y: -10, width: 960, height: 640 }, { x: 900, y: 6000, width: 80, height: 120 }, { x: 900, y: 16000, width: 80, height: 120 }])
        assert.deepEqual(new Set(query(area)), new Set(items.filter(n => intersects(n, area))));
};
tests['repeated seeded edits preserve graph edges, resource references and unique IDs'] = () => {
    let current = { ...scene, files: { ref: { id: 'ref', dataURL: 'data:image/png;base64,AAAA' } } };
    current = A.setMeta(current, ['root'], { imageId: 'ref', attachments: ['ref'] });
    let seed = 31;
    const pick = list => list[(seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % list.length];
    for (let i = 0; i < 180; i++) {
        const ns = M.topics(current), target = pick(ns), alternate = pick(ns), previous = current;
        switch (i % 7) {
        case 0: case 1: current = A.insertTopic(current, 'random-' + i, target.id, 'Topic ' + i).scene; break;
        case 2: current = M.setTopicFold(current, [target.id]); break;
        case 3: current = M.moveBranches(current, [target.id], 3, -12, true); break;
        case 4:
            if (target.id !== 'root' && target.id !== alternate.id && !M.descendants(ns, target.id).includes(alternate.id))
                current = M.dropBranches(current, [target.id], { kind: 'child', targetId: alternate.id });
            break;
        case 5: if (target.id !== 'root') current = A.deleteSingle(current, [target.id]); break;
        case 6: current = i % 3 ? M.layoutTopics(current, 'balanced') : previous; break;
        }
        const active = current.elements.filter(e => !e.isDeleted && e.customData?.mindmapEdge);
        const nodes = M.topics(current);
        const edges = new Map(active.map(e => [e.endBinding.elementId, e.startBinding.elementId]));
        assert.equal(edges.size, active.length);
        assert.equal(new Set(current.elements.map(e => e.id)).size, current.elements.length);
        assert.equal(A.topicMeta(current, 'root').imageId, 'ref');
        assert.equal(current.files.ref.id, 'ref');
        for (const node of nodes) assert.equal(edges.get(node.id) || null, node.parentId);
    }
};
tests['left branch edits preserve positions on the right half of a balanced map'] = () => {
    let balanced = M.layoutTopics(scene, 'balanced');
    balanced = M.moveBranches(balanced, ['a1'], 0, 35);
    const root = M.topics(balanced).find(n => n.id === 'root');
    const left = M.topics(balanced).find(n => n.parentId === root.id && n.x < root.x);
    const right = M.topics(balanced).find(n => n.parentId === root.id && n.x > root.x);
    const before = xy(balanced, right.id);
    const next = A.insertSibling(balanced, 'new-left', left.id).scene;
    assert.deepEqual(xy(next, right.id), before);
    assert(xy(next, 'new-left')[0] < root.x);
};
tests['clipboard resource IDs cannot replace an existing file with different bytes'] = () => {
    const original = { id: 'shared', dataURL: 'data:image/png;base64,AAAA', mimeType: 'image/png' };
    const incoming = { ...original, dataURL: 'data:image/png;base64,BBBB' };
    const from = A.setMeta({ ...scene, files: { shared: incoming } }, ['a1'], { imageId: 'shared' });
    const dest = A.setMeta({ ...scene, files: { shared: original } }, ['root'], { imageId: 'shared' });
    const result = C.pasteBranches(dest, C.copyBranches(from, ['a1']), 'root');
    assert.equal(result.scene.files.shared.dataURL, original.dataURL);
    const copied = A.topicMeta(result.scene, result.ids[0]).imageId;
    assert.equal(result.scene.files[copied].dataURL, incoming.dataURL);
    const duplicate = C.pasteBranches(result.scene, C.copyBranches(from, ['a1']), 'root');
    assert.equal(Object.keys(duplicate.scene.files).length, 2);
};
tests['stable compacting leaves existing space before a newly added child'] = () => {
    const spaced = M.moveBranches(scene, ['b'], 2000, 0);
    let stretched = A.insertTopic(spaced, 'a2', 'a', 'Second').scene;
    stretched = M.moveBranches(stretched, ['a2'], 420, 0);
    const next = A.insertTopic(stretched, 'a3', 'a', 'Third').scene;
    assert.deepEqual(xy(next, 'a2'), xy(stretched, 'a2'));
};
function layoutFixture(rows, orientation = 'horizontal') {
    return { files: {}, appState: { mindmapOrientation: orientation }, elements: rows.map(([id, parentId, x, y, width, height, extra], order) =>
        ({ id, type: 'rectangle', x, y, width, height, customData: { mindmap: { parentId, order, ...extra } } })) };
}
const centerY = n => n.y + n.height / 2;
const centerX = n => n.x + n.width / 2;
const byId = s => new Map(M.topics(s).map(n => [n.id, n]));
const noOverlap = nodes => {
    for (const [i, a] of nodes.entries()) for (const b of nodes.slice(i + 1))
        assert(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, a.id + ' overlaps ' + b.id);
};
tests['expanding a legacy branch discards its stale remote column and centers its children'] = () => {
    const stale = layoutFixture([
        ['root', null, 300, 100, 200, 68], ['left', 'root', 20, 60, 200, 68],
        ['right', 'root', 580, 100, 200, 68, { collapsed: true }],
        ['peer', 'root', 580, 210, 200, 68],
        ...Array.from({ length: 5 }, (_, i) => ['child' + i, 'right', 1150, 460 + i * 110, 200, 68]),
    ]);
    const next = M.setTopicFold(stale, ['right'], false), ns = byId(next), parent = ns.get('right');
    const children = [...ns.values()].filter(n => n.parentId === 'right');
    const gap = children[0].x - parent.x - parent.width;
    assert(gap >= 32 && gap <= 84, 'expected compact parent-child gap, got ' + gap);
    assert(children.every(n => n.x === children[0].x));
    assert.equal((children[0].y + children.at(-1).y + children.at(-1).height) / 2, centerY(parent));
    for (const id of ['root', 'left', 'right', 'peer']) assert.deepEqual(xy(next, id), xy(stale, id));
    const again = M.setTopicFold(M.setTopicFold(next, ['right'], true), ['right'], false);
    for (const n of children) assert.deepEqual(xy(again, n.id), xy(next, n.id));
    noOverlap([...ns.values()]);
};
tests['expand follows the left and downward layout directions'] = () => {
    const left = layoutFixture([
        ['root', null, 520, 100, 200, 68], ['parent', 'root', 200, 100, 200, 68, { collapsed: true }],
        ['child', 'parent', 1000, 500, 140, 68], ['wide-child', 'parent', 1100, 650, 185, 110],
    ]);
    const ns = byId(M.setTopicFold(left, ['parent'], false));
    assert(ns.get('child').x + ns.get('child').width < ns.get('parent').x);
    assert.equal(ns.get('child').x + ns.get('child').width, ns.get('wide-child').x + ns.get('wide-child').width);
    const down = { ...left, appState: { mindmapOrientation: 'vertical' } };
    const vs = byId(M.setTopicFold(down, ['parent'], false));
    assert(vs.get('child').y > vs.get('parent').y + vs.get('parent').height);
    assert.equal(vs.get('child').y, vs.get('wide-child').y);
    assert.equal((vs.get('child').x + vs.get('wide-child').x + vs.get('wide-child').width) / 2, centerX(vs.get('parent')));
};
tests['expanding resolves a collision with a pinned branch by changing branch spacing'] = () => {
    const current = layoutFixture([
        ['root', null, 0, 0, 200, 68], ['a', 'root', 260, 0, 200, 68, { collapsed: true }],
        ['b', 'root', 260, 120, 200, 68], ['outside', 'b', 520, 48, 200, 70],
        ['child', 'a', 1000, 1000, 200, 68], ['pin', 'a', 520, -60, 200, 68, { positionLocked: true }],
    ]);
    const next = M.setTopicFold(current, ['a'], false);
    const ns = byId(next);
    assert.deepEqual(xy(next, 'root'), xy(current, 'root'));
    assert(ns.get('pin').positionLocked);
    assert.equal((centerY(ns.get('child')) + centerY(ns.get('pin'))) / 2, centerY(ns.get('a')));
    assert.equal(centerY(ns.get('outside')), centerY(ns.get('b')));
    noOverlap(M.visibleTopics(next));
};
tests['an obstacle in an empty deeper column leaves the centered child group in place'] = () => {
    const current = layoutFixture([
        ['root', null, 0, 0, 200, 68], ['a', 'root', 260, 0, 200, 68, { collapsed: true }],
        ['b', 'root', 260, 200, 200, 68], ['outside', 'b', 780, 62, 200, 68],
        ['c1', 'a', 1000, 1000, 200, 68], ['c2', 'a', 1000, 1100, 200, 68],
        ['deep', 'c1', 1400, 1000, 200, 68],
    ]);
    const ns = byId(M.setTopicFold(current, ['a'], false));
    assert.equal((centerY(ns.get('c1')) + centerY(ns.get('c2'))) / 2, centerY(ns.get('a')));
    noOverlap([...ns.values()]);
};
tests['opening adjacent branches spaces their parents and keeps both child columns centered'] = () => {
    const initial = layoutFixture([
        ['root', null, 300, 300, 200, 68], ['left', 'root', 18, 250, 200, 68],
        ['a', 'root', 582, 210, 200, 68, { collapsed: true, positionLocked: true }],
        ['b', 'root', 582, 300, 200, 68, { collapsed: true, positionLocked: true }],
        ['c', 'root', 582, 390, 200, 68, { collapsed: true }],
        ...Array.from({ length: 5 }, (_, i) => ['a' + i, 'a', 1200, 600 + i * 110, 200, 68]),
        ...Array.from({ length: 13 }, (_, i) => ['b' + i, 'b', 1200, 1300 + i * 110, 200, 68]),
    ]);
    const first = M.setTopicFold(initial, ['a'], false);
    const both = M.setTopicFold(first, ['b'], false), ns = byId(both);
    const range = id => {
        const children = [...ns.values()].filter(n => n.parentId === id);
        return [Math.min(...children.map(n => n.y)), Math.max(...children.map(n => n.y + n.height))];
    };
    const [aTop, aBottom] = range('a'), [bTop, bBottom] = range('b');
    assert.equal((aTop + aBottom) / 2, centerY(ns.get('a')));
    assert.equal((bTop + bBottom) / 2, centerY(ns.get('b')));
    assert(aBottom < bTop, 'expanded sibling branches need separate rows');
    assert(centerY(ns.get('b')) - centerY(ns.get('a')) > 90, 'parents must move apart');
    assert.deepEqual(xy(both, 'root'), xy(initial, 'root'));
    assert.deepEqual(xy(both, 'left'), xy(initial, 'left'));
    assert(ns.get('a').positionLocked && ns.get('b').positionLocked);
    assert.equal(ns.get('a').x, 582);
    assert.equal(ns.get('b').x, 582);
    noOverlap(M.visibleTopics(both));
    const reduced = byId(M.setTopicFold(both, ['b'], true));
    assert(centerY(reduced.get('b')) - centerY(reduced.get('a')) < centerY(ns.get('b')) - centerY(ns.get('a')));
    assert.equal((centerY(reduced.get('a0')) + centerY(reduced.get('a4'))) / 2, centerY(reduced.get('a')));
};
tests['the first and last child cards stay centered even with an uneven descendant tree'] = () => {
    const initial = layoutFixture([
        ['root', null, 0, 0, 200, 68], ['a', 'root', 282, 0, 200, 68, { collapsed: true }],
        ['tall', 'a', 0, 0, 200, 68], ['short', 'a', 0, 0, 200, 68],
        ...Array.from({ length: 5 }, (_, i) => ['deep' + i, 'tall', 0, 0, 200, 68]),
    ]);
    for (const next of [M.setTopicFold(initial, ['a'], false), M.layoutTopics(M.updateTopic(initial, 'a', { collapsed: false }), 'right')]) {
        const ns = byId(next);
        assert.equal((ns.get('tall').y + ns.get('short').y + ns.get('short').height) / 2, centerY(ns.get('a')));
        noOverlap(M.visibleTopics(next));
    }
};
tests['automatic layout keeps short links beside variable-width neighbors in all modes'] = () => {
    const current = layoutFixture([
        ['root', null, 0, 0, 200, 68], ['a', 'root', 0, 0, 180, 52], ['b', 'root', 0, 0, 650, 280],
        ['a1', 'a', 0, 0, 140, 40], ['a2', 'a', 0, 0, 180, 54], ['a11', 'a1', 0, 0, 180, 240],
        ['b1', 'b', 0, 0, 140, 40], ['b2', 'b', 0, 0, 175, 54],
    ]);
    for (const mode of ['right', 'down', 'balanced']) {
        const next = M.layoutTopics(current, mode), ns = byId(next);
        noOverlap([...ns.values()]);
        for (const n of ns.values()) {
            if (!n.parentId) continue;
            const p = ns.get(n.parentId);
            const gap = mode === 'down' ? n.y - p.y - p.height : Math.max(n.x - p.x - p.width, p.x - n.x - n.width);
            assert(gap >= 32 && gap <= 90, mode + ': ' + n.id + ' edge gap ' + gap);
        }
        const b = ns.get('b'), b1 = ns.get('b1'), b2 = ns.get('b2');
        if (mode === 'down') assert.equal((b1.x + b2.x + b2.width) / 2, centerX(b));
        else assert.equal((b1.y + b2.y + b2.height) / 2, centerY(b));
        const again = M.layoutTopics(next, mode);
        for (const n of ns.values()) assert.deepEqual(xy(again, n.id), xy(next, n.id));
    }
};
let failures = 0;
for (const [name, test] of Object.entries(tests)) {
    try { test(); console.log('PASS', name); }
    catch (error) { failures++; console.error('FAIL', name, error.message); }
}
process.exitCode = failures ? 1 : 0;
