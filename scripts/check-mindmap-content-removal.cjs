const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');

function load(file) {
    const exports = {};
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function('exports', 'require', source)(exports, name => name.startsWith('.')
        ? load(path.resolve(path.dirname(file), name + '.ts'))
        : require(name));
    return exports;
}

const A = load('lib/mindmap-actions.ts');
const M = load('lib/structured-mindmap.ts');
let scene = A.insertTopic({ elements: [], files: {} }, 'root', null, '保留主题').scene;
scene = A.insertTopic(scene, 'child', 'root', '保留子主题').scene;
scene = M.updateTopic(scene, 'root', { notes: '保留研究记录' });
scene = A.setMeta(scene, ['root'], {
    tags: ['甲', '乙', '甲'],
    todo: { done: true },
    task: { owner: '研究员', start: '2026-11-01', due: '2026-11-10', progress: 40, priority: '高' },
    embed: 'https://example.com/embed',
    canvasLink: 'other-map',
    topicLink: 'child',
    annotation: '保留标注',
    attachments: ['attachment'],
    marker: '★',
    sticker: '贴纸',
    illustration: 'process',
    imageId: 'image',
    style: { bold: true, fill: '#e9f2ed' },
});
scene = {
    ...scene,
    files: {
        image: { id: 'image', dataURL: 'data:image/png;base64,aW1hZ2U=', mimeType: 'image/png' },
        attachment: { id: 'attachment', dataURL: 'data:text/plain;base64,YQ==', mimeType: 'text/plain', name: 'a.txt' },
    },
    elements: scene.elements.map(element => element.id === 'root'
        ? { ...element, link: 'https://example.com/page' }
        : element),
};
scene = A.resizeTopic(scene, 'root');
const original = structuredClone(scene);
const originalHeight = M.topics(scene).find(topic => topic.id === 'root').height;

assert.equal(typeof A.removeTopicContent, 'function', '独立删除附加内容的操作尚未实现');

const cases = [
    ['notes', undefined, 'notesHidden', true],
    ['todo', undefined, 'todo', null],
    ['task', undefined, 'task', null],
    ['web', undefined, 'link', null],
    ['embed', undefined, 'embed', ''],
    ['canvasLink', undefined, 'canvasLink', ''],
    ['topicLink', undefined, 'topicLink', ''],
    ['annotation', undefined, 'annotation', ''],
    ['marker', undefined, 'marker', ''],
    ['sticker', undefined, 'sticker', ''],
    ['illustration', undefined, 'illustration', ''],
    ['image', undefined, 'imageId', null],
];
for (const [kind, value, field, expected] of cases) {
    const next = A.removeTopicContent(scene, 'root', kind, value);
    const meta = A.topicMeta(next, 'root');
    const topic = M.topics(next).find(item => item.id === 'root');
    assert.equal(field === 'link' ? next.elements.find(element => element.id === 'root').link : meta[field], expected, `${kind} 应被独立清除`);
    assert.equal(topic.title, '保留主题');
    assert.equal(M.topics(next).find(item => item.id === 'child').parentId, 'root');
    assert.equal(M.topics(next).find(item => item.id === 'root').notes, '保留研究记录');
    assert.deepEqual(meta.style, { bold: true, fill: '#e9f2ed' });
    // Inline badges and links can share a row. Removing one only saves space when its row becomes empty.
    if (['todo', 'task', 'embed', 'canvasLink', 'topicLink', 'annotation', 'sticker', 'illustration', 'image'].includes(kind))
        assert.ok(topic.height < originalHeight, `${kind} 删除后卡片应回收高度`);
    else
        assert.ok(topic.height <= originalHeight, `${kind} 删除后卡片不得增高`);
    assert.deepEqual(scene, original, '删除操作不得修改旧快照，否则撤销会失效');
    if (kind === 'image') assert.ok(next.files.image, '撤销前应保留图片文件');
}

const oneTag = A.removeTopicContent(scene, 'root', 'tags', '甲');
assert.deepEqual(A.topicMeta(oneTag, 'root').tags, ['乙', '甲'], '应只删除点击位置的标签');
const lastTag = A.removeTopicContent(oneTag, 'root', 'tags', '甲');
assert.deepEqual(A.topicMeta(lastTag, 'root').tags, ['乙']);
const noTags = A.removeTopicContent(lastTag, 'root', 'tags', '乙');
assert.deepEqual(A.topicMeta(noTags, 'root').tags, []);

const noAttachment = A.removeTopicContent(scene, 'root', 'attachment', 'attachment');
assert.deepEqual(A.topicMeta(noAttachment, 'root').attachments, []);
assert.ok(noAttachment.files.attachment, '移除附件引用后仍应保留文件供撤销');
assert.ok(noAttachment.files.image);
assert.equal(A.removeTopicContent(scene, 'root', 'attachment', 'missing'), scene);
assert.equal(A.removeTopicContent(scene, 'missing', 'notes'), scene);

console.log('Topic content removal: 14 content types, per-item tags/attachments, preserved topic/children/style, resized cards and immutable undo snapshots passed.');