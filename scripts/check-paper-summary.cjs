const ts = require('typescript'), fs = require('node:fs'), assert = require('node:assert/strict');
function moduleFrom(path) {
  const out = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('exports', 'require', out)(exports, require);
  return exports;
}
const { paperMarkdown, applySummaryWithDraft } = moduleFrom('lib/paper-markdown.ts');

const paper = {
  id: 'p1', kind: 'paper', title: '论文',
  readingMarkdown: '## 解决什么问题\n\n旧问题\n\n## 研究笔记\n\n旧笔记\n',
  problem: '旧问题', notes: '旧笔记',
};
// The user typed in the editor but the 900ms autosave has not fired yet.
const draft = paper.readingMarkdown.replace('旧笔记', '用户刚写的笔记');

const merged = applySummaryWithDraft(paper, draft, { problem: 'AI 新问题' }, 'test-model');
assert.match(merged.readingMarkdown, /用户刚写的笔记/, '未保存草稿必须保留');
assert.match(merged.readingMarkdown, /AI 新问题/, 'AI 总结必须写入');
assert.equal(merged.notes, '用户刚写的笔记');
assert.equal(merged.problem, 'AI 新问题');
assert.equal(merged.review, 'API草稿待核验');
assert.equal(merged.summaryModel, 'test-model');
assert.equal(paper.notes, '旧笔记', '不得就地修改传入的 paper');

// No pending draft: same outcome as the previous merge path.
const noDraft = applySummaryWithDraft(paper, null, { problem: 'AI 新问题' }, 'm');
assert.match(noDraft.readingMarkdown, /AI 新问题/);
assert.match(noDraft.readingMarkdown, /旧笔记/);

// Draft equal to the saved body must not invent a change.
const same = applySummaryWithDraft(paper, paper.readingMarkdown, { problem: 'AI' }, 'm');
assert.match(same.readingMarkdown, /AI/);
assert.match(same.readingMarkdown, /旧笔记/);

// Legacy papers store dimensions as fields, with no readingMarkdown yet.
const legacy = { id: 'p2', kind: 'paper', title: 'L', problem: '旧问题', notes: '旧笔记' };
const legacyDraft = paperMarkdown(legacy).replace('旧笔记', '草稿笔记');
const legacyMerged = applySummaryWithDraft(legacy, legacyDraft, { solution: 'AI 思路' }, 'm');
assert.match(legacyMerged.readingMarkdown, /草稿笔记/);
assert.match(legacyMerged.readingMarkdown, /AI 思路/);

// Empty patch values must not erase an existing section.
const kept = applySummaryWithDraft(paper, draft, { problem: '' }, 'm');
assert.match(kept.readingMarkdown, /用户刚写的笔记/);

console.log('Paper summary verified: pending draft survives an accepted AI summary, fields and Markdown stay in sync, legacy papers and empty patches handled.');