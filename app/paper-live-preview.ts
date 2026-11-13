import type {markdown} from '@codemirror/lang-markdown';
import {syntaxTree} from '@codemirror/language';
import {StateField, type EditorState, type Range} from '@codemirror/state';
import {Decoration, EditorView, WidgetType, type DecorationSet} from '@codemirror/view';
import {highlightColors} from '../lib/paper-format';
import {closingPaperMarker, paperLiveDocument, renderPaperInline, renderPaperMarkdown} from '../lib/paper-markdown-render';
import {PaperTableWidget} from './paper-table-widget';

type MarkdownExtension = NonNullable<NonNullable<Parameters<typeof markdown>[0]>['extensions']>;
const highlight = {resolve: 'NotebookHighlight', mark: 'NotebookHighlightMark'};

export const paperMarkdownSyntax: MarkdownExtension = {
  defineNodes: ['NotebookHighlight', 'NotebookHighlightMark', 'NotebookWiki', 'NotebookMath', 'NotebookComment', 'NotebookFootnote'],
  parseInline: [{
    name: 'NotebookHighlight', before: 'Emphasis', parse(cx, next, pos) {
      if (next !== 61 || cx.char(pos + 1) !== 61 || cx.char(pos - 1) === 61 || cx.char(pos + 2) === 61) return -1;
      const open = /\S/u.test(cx.slice(pos + 2, pos + 3));
      const close = /\S/u.test(cx.slice(Math.max(cx.offset, pos - 1), pos));
      return cx.addDelimiter(highlight, pos, pos + 2, open, close);
    },
  }, {
    name: 'NotebookInline', before: 'Link', parse(cx, next, pos) {
      if (next !== 91 && next !== 37 && next !== 36) return -1;
      const pair = cx.slice(pos, pos + 2);
      const [name, opener, closer] = pair === '[[' ? ['NotebookWiki', '[[', ']]']
        : pair === '%%' ? ['NotebookComment', '%%', '%%']
        : pair === '[^' ? ['NotebookFootnote', '[^', ']']
        : next === 36 && pair !== '$$' && cx.char(pos - 1) !== 36 ? ['NotebookMath', '$', '$'] : [];
      if (!name || !opener || !closer) return -1;
      const end = closingPaperMarker(cx.text, closer, pos - cx.offset + opener.length) + cx.offset;
      if (end < pos + opener.length) return -1;
      const body = cx.slice(pos + opener.length, end);
      if (body.includes('\n') || (name === 'NotebookWiki' && (!body.trim() || /[\[\]]/.test(body))) ||
          (name === 'NotebookFootnote' && !/^[^\s\[\]]+$/.test(body)) ||
          (name === 'NotebookMath' && (!/^\S(?:.*\S)?$/.test(body) || /\d/.test(cx.slice(end + 1, end + 2))))) return -1;
      return cx.addElement(cx.elt(name, pos, end + closer.length));
    },
  }],
};

export function togglePaperTask(view: EditorView, line: number) {
  if (view.state.readOnly || line < 1 || line > view.state.doc.lines) return false;
  const row = view.state.doc.line(line);
  const marker = /^(?:[ \t]*>[ \t]?)*[ \t]*(?:[-*+]|\d+[.)])[ \t]+\[([^\]\n])\]/.exec(row.text);
  if (!marker) return false;
  const from = row.from + marker[0].length - 2;
  view.dispatch({changes: {from, to: from + 1, insert: marker[1] === ' ' ? 'x' : ' '}});
  return true;
}

class PreviewWidget extends WidgetType {
  constructor(readonly source: string, readonly block: boolean) { super(); }

  eq(other: PreviewWidget) { return other.source === this.source && other.block === this.block; }

  toDOM(view: EditorView) {
    const dom = document.createElement(this.block ? 'div' : 'span');
    dom.className = 'paper-markdown notebook-live-widget';
    try {
      dom.innerHTML = this.block ? renderPaperMarkdown(this.source) : renderPaperInline(this.source);
    } catch { dom.textContent = this.source; }
    dom.addEventListener('mousedown', event => {
      if (!(event instanceof MouseEvent) || event.button !== 0 || !(event.target instanceof Element) || event.target.closest('summary')) return;
      event.preventDefault();
      const from = view.posAtDOM(dom);
      const line = view.state.doc.lineAt(from);
      const sourceLine = Number(event.target.closest<HTMLElement>('[data-source-line]')?.dataset.sourceLine || 1);
      const target = this.block ? view.state.doc.line(Math.min(view.state.doc.lines, line.number + sourceLine - 1)).from : from;
      view.dispatch({selection: {anchor: target}, scrollIntoView: true});
      view.focus();
    });
    dom.addEventListener('click', event => {
      if (event.target instanceof Element && event.target.closest('a')) event.preventDefault();
    });
    return dom;
  }
}

class ListWidget extends WidgetType {
  constructor(readonly task: boolean | null) { super(); }

  eq(other: ListWidget) { return other.task === this.task; }

  toDOM(view: EditorView) {
    if (this.task === null) {
      const bullet = document.createElement('span');
      bullet.className = 'notebook-live-bullet';
      bullet.textContent = '•';
      return bullet;
    }
    const input = document.createElement('input');
    input.className = 'notebook-live-task';
    input.type = 'checkbox';
    input.checked = this.task;
    input.setAttribute('aria-label', '切换任务状态');
    input.addEventListener('mousedown', event => event.preventDefault());
    input.addEventListener('click', event => {
      if (!togglePaperTask(view, view.state.doc.lineAt(view.posAtDOM(input)).number)) event.preventDefault();
    });
    return input;
  }
}

class FootnoteWidget extends WidgetType {
  constructor(readonly number: number) { super(); }

  eq(other: FootnoteWidget) { return other.number === this.number; }

  toDOM(view: EditorView) {
    const reference = document.createElement('sup');
    reference.className = 'notebook-live-footnote';
    reference.textContent = `[${this.number}]`;
    reference.title = `脚注 ${this.number}`;
    reference.addEventListener('mousedown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      view.dispatch({selection: {anchor: Math.min(view.state.doc.length, view.posAtDOM(reference) + 2)}});
      view.focus();
    });
    return reference;
  }
}

type PreviewBlock = {from: number; to: number; decoration: Decoration; table: boolean};

function previewDocument(state: EditorState) {
  const {blocks: lines, footnotes} = paperLiveDocument(state.doc.toString());
  const blocks: PreviewBlock[] = lines.flatMap(({start, end, type}) => {
    const from = state.doc.line(start + 1).from;
    const to = state.doc.line(end).to;
    const source = state.sliceDoc(from, to);
    const table = type === 'table_open';
    const widget = table ? new PaperTableWidget(source, state.readOnly) : new PreviewWidget(source, true);
    return from < to ? [{from, to, table, decoration: Decoration.replace({block: true, widget})}] : [];
  });
  return {blocks, footnotes};
}

const hidden = Decoration.replace({});
const strong = Decoration.mark({tagName: 'strong', class: 'notebook-live-strong'});
const italic = Decoration.mark({tagName: 'em', class: 'notebook-live-em'});
const strike = Decoration.mark({tagName: 's', class: 'notebook-live-strike'});
const code = Decoration.mark({tagName: 'code', class: 'notebook-live-code'});
const link = Decoration.mark({class: 'notebook-live-link'});
const wiki = Decoration.mark({class: 'notebook-live-link notebook-live-wiki'});
const quote = Decoration.line({class: 'notebook-live-quote'});
const completedTask = Decoration.line({class: 'notebook-live-completed'});
const syntax = Decoration.mark({class: 'notebook-live-syntax'});

function decorate(state: EditorState, {blocks, footnotes}: ReturnType<typeof previewDocument>): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const editing = (from: number, to: number) => state.selection.ranges.some(selection => selection.from <= to && selection.to >= from);
  const replacements = blocks.filter(block => block.table
    ? !state.selection.ranges.some(range => !range.empty && range.from <= block.to && range.to >= block.from)
    : !editing(block.from, block.to));
  const quotedLines = new Set<number>();
  for (const {from, to, decoration} of replacements) ranges.push(decoration.range(from, to));
  let blockIndex = 0;

  function add(decoration: Decoration, from: number, to: number) {
    if (from < to) ranges.push(decoration.range(from, to));
  }

  syntaxTree(state).iterate({enter(node) {
    const {from, to, name} = node;
    while (blockIndex < replacements.length && replacements[blockIndex].to <= from) blockIndex++;
    const block = replacements[blockIndex];
    if (block && block.from <= from && block.to >= to) return false;

    if (name === 'Blockquote') {
      const start = state.doc.lineAt(from).number;
      const end = state.doc.lineAt(Math.max(from, to - 1)).number;
      for (let line = start; line <= end; line++) {
        if (quotedLines.has(line)) continue;
        quotedLines.add(line);
        ranges.push(quote.range(state.doc.line(line).from));
      }
    }

    const level = /^(ATX|Setext)Heading([1-6])$/.exec(name);
    if (level) {
      const row = state.doc.lineAt(from);
      ranges.push(Decoration.line({class: `notebook-live-h${level[2]}`}).range(row.from));
      const reveal = editing(row.from, state.doc.lineAt(to).to);
      for (const marker of node.node.getChildren('HeaderMark')) {
        const before = marker.from === from;
        const end = before ? marker.to + (state.sliceDoc(marker.to, row.to).match(/^[ \t]*/)?.[0].length || 0) : marker.to;
        const start = before ? marker.from : marker.from - (state.sliceDoc(state.doc.lineAt(marker.from).from, marker.from).match(/[ \t]+$/)?.[0].length || 0);
        add(reveal ? syntax : hidden, start, end);
      }
    } else if (name === 'QuoteMark' || name === 'ListMark') {
      const row = state.doc.lineAt(from);
      const reveal = editing(row.from, row.to);
      const tail = state.sliceDoc(to, row.to);
      const raw = state.sliceDoc(from, to);
      const task = /^[ \t]+\[([^\]])\](?:[ \t]+|$)/.exec(tail);
      if (name === 'ListMark' && task && task[1] !== ' ') ranges.push(completedTask.range(row.from));
      if (reveal) add(syntax, from, to + (task?.[0].trimEnd().length || 0));
      else if (name === 'QuoteMark') add(hidden, from, to + (tail.startsWith(' ') ? 1 : 0));
      else if (task || /^[-+*]$/.test(raw)) add(Decoration.replace({widget: new ListWidget(task ? task[1] !== ' ' : null)}), from, to + (task?.[0].length || 0));
    } else if (name === 'StrongEmphasis' || name === 'Emphasis' || name === 'Strikethrough' || name === 'InlineCode' || name === 'NotebookHighlight') {
      const markerName = name === 'InlineCode' ? 'CodeMark' : name === 'Strikethrough' ? 'StrikethroughMark' : name === 'NotebookHighlight' ? 'NotebookHighlightMark' : 'EmphasisMark';
      const opening = node.node.firstChild;
      const closing = node.node.lastChild;
      if (!opening || !closing || opening.name !== markerName || closing.name !== markerName || opening.to > closing.from) return;
      const color = name === 'NotebookHighlight' && highlightColors.find(([, marker]) => state.sliceDoc(opening.to, opening.to + marker.length) === marker);
      const content = opening.to + (color ? color[1].length : 0);
      const decoration = name === 'StrongEmphasis' ? strong : name === 'Emphasis' ? italic : name === 'Strikethrough' ? strike : name === 'InlineCode' ? code : Decoration.mark({tagName: 'mark', class: 'notebook-live-highlight', attributes: color ? {'data-color': color[0]} : undefined});
      const delimiter = editing(from, to) ? syntax : hidden;
      add(decoration, content, closing.from);
      add(delimiter, opening.from, content);
      add(delimiter, closing.from, closing.to);
    } else if (name === 'NotebookFootnote') {
      const number = footnotes.get(state.sliceDoc(from + 2, to - 1));
      if (number !== undefined && !editing(from, to)) add(Decoration.replace({widget: new FootnoteWidget(number)}), from, to);
    } else if (name === 'NotebookWiki' || name === 'Link' || name === 'Autolink') {
      const raw = state.sliceDoc(from, to);
      const marks = node.node.getChildren('LinkMark');
      const alias = raw.indexOf('|');
      const start = name === 'NotebookWiki' ? from + (alias < 0 ? 2 : alias + 1) : marks[0]?.to;
      const end = name === 'NotebookWiki' ? to - 2 : marks[1]?.from;
      if (start === undefined || end === undefined || (name === 'Link' && marks.length < 4 && !node.node.getChild('LinkLabel'))) return;
      const delimiter = editing(from, to) ? syntax : hidden;
      add(name === 'NotebookWiki' ? wiki : link, start, end);
      add(delimiter, from, start);
      add(delimiter, end, to);
    } else if (name === 'NotebookComment') {
      add(editing(from, to) ? syntax : hidden, from, to);
      return false;
    } else if (name === 'NotebookMath' || name === 'Image') {
      if (!editing(from, to)) {
        add(Decoration.replace({widget: new PreviewWidget(state.sliceDoc(from, to), false)}), from, to);
        return false;
      }
    }
  }});
  return Decoration.set(ranges, true);
}

export const paperLivePreview = StateField.define<ReturnType<typeof previewDocument> & {decorations: DecorationSet}>({
  create(state) {
    const document = previewDocument(state);
    return {...document, decorations: decorate(state, document)};
  },
  update(previous, transaction) {
    const blocksChanged = transaction.docChanged || transaction.startState.readOnly !== transaction.state.readOnly;
    if (!blocksChanged && !transaction.selection && syntaxTree(transaction.startState) === syntaxTree(transaction.state)) return previous;
    const document = blocksChanged ? previewDocument(transaction.state) : previous;
    return {...document, decorations: decorate(transaction.state, document)};
  },
  provide: field => EditorView.decorations.from(field, value => value.decorations),
});
