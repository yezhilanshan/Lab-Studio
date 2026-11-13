import MarkdownIt, {type StateInline} from 'markdown-it';
import footnotes from 'markdown-it-footnote';
import katex from 'katex';
import hljs from 'highlight.js/lib/common';
import {highlightColors} from './paper-format';

const md = new MarkdownIt({html: false, linkify: true, breaks: true, highlight(code, language) {
  return language && hljs.getLanguage(language) ? hljs.highlight(code, {language, ignoreIllegals: true}).value : '';
}}).use(footnotes);

const escape = md.utils.escapeHtml;
const calloutTypes: Record<string, string> = {
  note: '笔记', abstract: '摘要', summary: '摘要', tldr: '摘要', info: '信息', todo: '待办',
  tip: '提示', hint: '提示', important: '重点', success: '完成', check: '完成', done: '完成',
  question: '问题', help: '帮助', faq: '常见问题', warning: '警告', caution: '注意', attention: '注意',
  failure: '失败', fail: '失败', missing: '缺失', danger: '危险', error: '错误', bug: '错误',
  example: '示例', quote: '引用', cite: '引用',
};

export function closingPaperMarker(source: string, marker: string, from: number) {
  for (let position = source.indexOf(marker, from); position !== -1; position = source.indexOf(marker, position + marker.length)) {
    let backslashes = 0;
    while (source[position - backslashes - 1] === '\\') backslashes++;
    if (backslashes % 2 === 0) return position;
  }
  return -1;
}

function inlineMarker(marker: string, create: (state: StateInline, content: string) => void, accept: (state: StateInline, end: number, content: string) => boolean = (_, __, content) => Boolean(content)) {
  return (state: StateInline, silent: boolean) => {
    if (!state.src.startsWith(marker, state.pos)) return false;
    const end = closingPaperMarker(state.src, marker, state.pos + marker.length);
    if (end < 0 || end + marker.length > state.posMax) return false;
    const content = state.src.slice(state.pos + marker.length, end);
    if (!accept(state, end, content)) return false;
    if (!silent) create(state, content);
    state.pos = end + marker.length;
    return true;
  };
}

md.inline.ruler.before('emphasis', 'notebook_highlight', inlineMarker('==', (state, content) => {
  const color = highlightColors.find(([, marker]) => content.startsWith(marker));
  const open = state.push('mark_open', 'mark', 1);
  if (color) open.attrSet('data-color', color[0]);
  const children: StateInline['tokens'] = [];
  state.md.inline.parse(color ? content.slice(color[1].length) : content, state.md, state.env, children);
  for (const token of children) { token.level += open.level + 1; state.tokens.push(token); }
  state.push('mark_close', 'mark', -1);
}, (_, __, content) => Boolean(content.trim()) && !content.startsWith('=')));

md.inline.ruler.before('emphasis', 'notebook_comment', inlineMarker('%%', () => {}, () => true));
md.inline.ruler.before('emphasis', 'notebook_math', inlineMarker('$', (state, content) => {
  state.push('notebook_math', 'span', 0).content = content;
}, (state, end, content) => /^\S(?:[^\n]*\S)?$/.test(content) && !/\d/.test(state.src[end + 1] || '')));

md.inline.ruler.before('link', 'notebook_wiki', (state, silent) => {
  if (state.linkLevel || !state.src.startsWith('[[', state.pos)) return false;
  const end = closingPaperMarker(state.src, ']]', state.pos + 2);
  if (end === -1 || end + 2 > state.posMax) return false;
  const body = state.src.slice(state.pos + 2, end);
  if (!body || /[\[\]\n]/.test(body)) return false;
  const [target, ...alias] = body.split('|');
  if (!target.trim()) return false;
  if (!silent) {
    const token = state.push('notebook_wiki', 'a', 0);
    token.content = alias.join('|').trim() || target.trim();
    token.meta = {target: target.trim()};
  }
  state.pos = end + 2;
  return true;
});

md.block.ruler.before('paragraph', 'notebook_comment_block', (state, start, end, silent) => {
  const first = state.bMarks[start] + state.tShift[start];
  if (state.sCount[start] - state.blkIndent >= 4 || !state.src.startsWith('%%', first)) return false;
  if (closingPaperMarker(state.src.slice(first + 2, state.eMarks[start]), '%%', 0) >= 0) return false;
  if (silent) return true;
  const comment = state.push('notebook_hidden_comment', '', 0);
  comment.map = [start, end];
  for (let line = start + 1; line < end; line++) {
    const position = state.bMarks[line] + state.tShift[line];
    const close = closingPaperMarker(state.src.slice(position, state.eMarks[line]), '%%', 0);
    if (close < 0) continue;
    const tail = position + close + 2;
    const text = state.src.slice(tail, state.eMarks[line]).trimStart();
    if (text) {
      const paragraph = state.push('paragraph_open', 'p', 1);
      paragraph.map = [line, line + 1];
      const inline = state.push('inline', '', 0);
      inline.content = text;
      inline.children = [];
      state.push('paragraph_close', 'p', -1);
    }
    state.line = line + 1;
    comment.map[1] = state.line;
    return true;
  }
  state.line = end;
  return true;
}, {alt: ['paragraph', 'reference', 'blockquote', 'list']});

md.block.ruler.before('fence', 'notebook_display_math', (state, start, end, silent) => {
  const first = state.bMarks[start] + state.tShift[start];
  if (state.sCount[start] - state.blkIndent >= 4 || !state.src.startsWith('$$', first)) return false;
  const parts = [state.src.slice(first + 2, state.eMarks[start])];
  for (let line = start; line < end; line++) {
    if (line > start) parts.push(state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]));
    const last = parts[parts.length - 1];
    const close = closingPaperMarker(last, '$$', 0);
    if (close < 0 || last.slice(close + 2).trim()) continue;
    parts[parts.length - 1] = last.slice(0, close);
    if (silent) return true;
    const token = state.push('notebook_display_math', 'div', 0);
    token.map = [start, line + 1];
    token.content = parts.join('\n').trim();
    state.line = line + 1;
    return true;
  }
  return false;
}, {alt: ['paragraph', 'reference', 'blockquote', 'list']});

md.core.ruler.before('inline', 'notebook_blocks', state => {
  const quotes: (string | null)[] = [];
  const tokens = state.tokens;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.map && token.tag && token.nesting >= 0) token.attrSet('data-source-line', String(token.map[0] + 1));
    const inline = tokens[index + 2];
    if (token.type === 'blockquote_open') {
      const marker = tokens[index + 1]?.type === 'paragraph_open' && inline?.type === 'inline' && /^\[!([\w-]+)\]([+-]?)[ \t]*([^\n]*)(?:\n|$)/.exec(inline.content);
      quotes.push(marker ? marker[2] : null);
      if (marker) {
        const type = marker[1].toLowerCase();
        token.type = 'notebook_callout_open';
        token.meta = {type, fold: marker[2], title: marker[3].trim() || (Object.hasOwn(calloutTypes, type) ? calloutTypes[type] : type)};
        inline.content = inline.content.slice(marker[0].length);
      }
    } else if (token.type === 'blockquote_close') {
      const fold = quotes.pop();
      if (fold != null) {
        token.type = 'notebook_callout_close';
        token.meta = {fold};
      }
    }
    if (token.type === 'list_item_open' && tokens[index + 1]?.type === 'paragraph_open' && inline?.type === 'inline') {
      const task = /^\[([^\]\n])\](?:[ \t]+|$)/.exec(inline.content);
      if (task && token.map) {
        token.attrSet('class', 'notebook-task');
        token.attrSet('data-task-checked', String(task[1] !== ' '));
        token.meta = {checked: task[1] !== ' ', line: token.map[0] + 1};
        inline.content = inline.content.slice(task[0].length);
      }
    }
    if (token.type === 'inline') {
      const anchor = /(?:^|[ \t]+)\^([a-z0-9-]+)[ \t]*$/i.exec(token.content);
      const parent = tokens[index - 1];
      if (anchor && parent?.type === 'paragraph_open') {
        token.content = token.content.slice(0, anchor.index);
        parent.attrSet('data-notebook-block', anchor[1]);
      }
    }
  }
});

md.core.ruler.after('inline', 'notebook_headings', state => {
  state.tokens.forEach((token, index) => {
    if (token.type !== 'heading_open') return;
    const text = state.tokens[index + 1]?.children?.map(child => child.content).join('') || '';
    token.attrSet('data-notebook-heading', text.trim());
  });
});

md.renderer.rules.notebook_wiki = (tokens, index) => `<a href="#" class="notebook-wiki" data-notebook-link="${escape(String(tokens[index].meta?.target))}">${escape(tokens[index].content)}</a>`;

function math(content: string, displayMode: boolean) {
  return katex.renderToString(content, {displayMode, throwOnError: false, strict: 'ignore', trust: false, maxExpand: 250, maxSize: 25});
}

md.renderer.rules.notebook_math = (tokens, index) => math(tokens[index].content, false);
md.renderer.rules.notebook_hidden_comment = () => '';
md.renderer.rules.notebook_display_math = (tokens, index, _options, _env, renderer) => `<div class="notebook-math"${renderer.renderAttrs(tokens[index])}>${math(tokens[index].content, true)}</div>\n`;

md.renderer.rules.notebook_callout_open = (tokens, index, _options, _env, renderer) => {
  const token = tokens[index];
  const {type, fold, title} = token.meta || {};
  const attributes = `class="notebook-callout" data-type="${escape(String(type))}"${renderer.renderAttrs(token)}`;
  const caption = `<span>${md.renderInline(String(title))}</span>`;
  return (fold ? `<details ${attributes}${fold === '+' ? ' open' : ''}><summary class="callout-title">${caption}</summary>` : `<aside ${attributes}><div class="callout-title">${caption}</div>`) + '<div class="notebook-callout-body">\n';
};
md.renderer.rules.notebook_callout_close = (tokens, index) => tokens[index].meta?.fold ? '</div></details>\n' : '</div></aside>\n';

const fence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  const language = /^[\w+#.-]{1,32}(?=\s|$)/.exec(token.info.trim())?.[0];
  const caption = language ? `<figcaption>${escape(language)}</figcaption>` : '';
  return `<figure class="notebook-code-block"${renderer.renderAttrs(token)}>${caption}${fence(tokens, index, options, env, renderer)}</figure>\n`;
};

md.renderer.rules.table_open = (tokens, index, options, _env, renderer) => '<div class="notebook-table-frame">\n' + renderer.renderToken(tokens, index, options);
md.renderer.rules.table_close = (tokens, index, options, _env, renderer) => renderer.renderToken(tokens, index, options) + '</div>\n';
md.renderer.rules.footnote_block_open = () => '<section class="footnotes" aria-label="脚注"><div class="notebook-footnote-title" aria-hidden="true">脚注</div><ol class="footnotes-list">\n';

md.renderer.rules.list_item_open = (tokens, index, options, _env, renderer) => {
  const token = tokens[index];
  return token.meta ? `<li${renderer.renderAttrs(token)}><input type="checkbox" aria-label="切换任务状态" data-notebook-task="${token.meta.line}"${token.meta.checked ? ' checked' : ''}>` : renderer.renderToken(tokens, index, options);
};

const image = md.renderer.rules.image!;
md.renderer.rules.image = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  const size = /\|(\d{1,4})(?:x(\d{1,4}))?$/.exec(token.content);
  if (size) {
    token.attrSet('width', size[1]);
    if (size[2]) token.attrSet('height', size[2]);
    const last = token.children?.at(-1);
    if (last?.type === 'text') last.content = last.content.replace(size[0], '');
  }
  token.attrSet('loading', 'lazy');
  token.attrSet('referrerpolicy', 'no-referrer');
  return image(tokens, index, options, env, renderer);
};

md.renderer.rules.link_open = (tokens, index, options, _env, renderer) => {
  const token = tokens[index];
  const href = String(token.attrGet('href') || '');
  if (/^(https?:\/\/|mailto:|\/\/)/i.test(href)) {
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener noreferrer');
  } else if (href && !/^(?:\/|[a-z][a-z\d+.-]*:)/i.test(href)) {
    try { token.attrSet('data-notebook-link', decodeURIComponent(href)); } catch { token.attrSet('data-notebook-link', href); }
    token.attrSet('href', '#');
    token.attrSet('class', 'notebook-wiki');
  }
  return renderer.renderToken(tokens, index, options);
};

export function renderPaperMarkdown(source: string) {
  return md.render(source, {docId: 'paper-note'});
}

export function renderPaperInline(source: string) {
  return md.renderInline(source);
}

const liveBlocks = new Set(['table_open', 'notebook_callout_open', 'notebook_display_math', 'notebook_hidden_comment', 'fence', 'code_block', 'hr']);

export function paperLiveDocument(source: string) {
  // Return whole top-level blocks. Inline formatting stays editable as CodeMirror text.
  const env: {footnotes?: {refs?: Record<string, number>}} = {};
  const tokens = /^(?: {0,3}(?:`{3}|~{3}|>|\$\$|%%|[-*_])|[ \t]{4}|\t)|\||\[\^/m.test(source) ? md.parse(source, env) : [];
  const blocks = tokens.flatMap(token => token.level === 0 && token.map && liveBlocks.has(token.type)
    ? [{start: token.map[0], end: token.map[1], type: token.type}] : []);
  return {blocks, footnotes: new Map(Object.entries(env.footnotes?.refs || {}).filter(([, number]) => number >= 0).map(([label, number]) => [label.slice(1), number + 1]))};
}
