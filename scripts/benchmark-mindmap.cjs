const fs = require('node:fs'), ts = require('typescript'), path = require('node:path');
function load(file) {
    const exports = {};
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function('exports', 'require', code)(exports, p => load(path.resolve(path.dirname(file), p + '.ts')));
    return exports;
}

const M = load('lib/structured-mindmap.ts');
const { spatialIndex } = load('lib/mindmap-spatial.ts');
const samples = 7;
function median(operation) {
    operation();
    const times = Array.from({ length: samples }, () => {
        const start = performance.now();
        operation();
        return performance.now() - start;
    }).sort((a, b) => a - b);
    return Number(times[samples >>> 1].toFixed(2));
}
const results = [1000, 3000, 10000].map(nodes => {
    const elements = Array.from({ length: nodes }, (_, i) => ({
        id: 'topic-' + i, type: 'rectangle', x: 0, y: 0, width: 200, height: 68,
        customData: { mindmap: { parentId: i ? 'topic-' + Math.floor((i - 1) / 6) : null, order: i } },
    }));
    const scene = { elements, files: {} }, layout = M.layoutTopics(scene, 'balanced'), lookup = spatialIndex(M.visibleTopics(layout));
    return {
        nodes,
        'layout ms': median(() => M.layoutTopics(scene, 'balanced')),
        'viewport x100 ms': median(() => { for (let i = 0; i < 100; i++) lookup({ x: 60 + i * 8, y: i * 120, width: 1000, height: 680 }); }),
        'move ms': median(() => M.moveBranches(layout, ['topic-1'], 20, 10, true)),
        'fold ms': median(() => M.setTopicFold(layout, ['topic-7'], true)),
        'serialize ms': median(() => JSON.stringify(layout)),
        'elements after layout': layout.elements.length,
    };
});
console.table(results);
