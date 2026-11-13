'use client';

import {useEffect, useRef, type RefObject} from 'react';
import {defaultKeymap, history, historyKeymap, indentLess, indentMore, isolateHistory} from '@codemirror/commands';
import {insertNewlineContinueMarkupCommand, markdown, markdownKeymap, markdownLanguage} from '@codemirror/lang-markdown';
import {defaultHighlightStyle, syntaxHighlighting, syntaxTree} from '@codemirror/language';
import {Compartment, EditorSelection, EditorState, Transaction} from '@codemirror/state';
import {drawSelection, EditorView, keymap} from '@codemirror/view';
import {highlightColors, paperFormatEdit, paperFormatGroups, type PaperFormat} from '../lib/paper-format';
import {paperLivePreview, paperMarkdownSyntax} from './paper-live-preview';
import {focusPaperTable} from './paper-table-widget';

export function currentPaperFormats(view: EditorView) {
  const {state} = view;
  const position = state.selection.main.from;
  const active = new Set<PaperFormat>();
  let block = false;
  let node = syntaxTree(state).resolveInner(position, position === state.doc.lineAt(position).from ? 1 : -1);
  for (;;) {
    const heading = /^(?:ATX|Setext)Heading([1-6])$/.exec(node.name);
    if (heading) { active.add(`h${heading[1]}` as PaperFormat); block = true; }
    switch (node.name) {
      case 'StrongEmphasis': active.add('bold'); break;
      case 'Emphasis': active.add('italic'); break;
      case 'Strikethrough': active.add('strike'); break;
      case 'InlineCode': active.add('code'); break;
      case 'NotebookMath': active.add('math'); break;
      case 'NotebookComment': active.add('comment'); break;
      case 'NotebookHighlight': {
        active.add('highlight');
        const color = highlightColors.find(([, mark]) => state.sliceDoc(node.from + 2, node.from + 2 + mark.length) === mark);
        if (color) active.add(color[0]);
        break;
      }
      case 'Task': active.add('task'); block = true; break;
      case 'ListItem': {
        const line = state.doc.lineAt(node.from).text;
        const task = /(?:[-*+]|\d+[.)])[ \t]+\[[^\]\n]\](?:[ \t]+|$)/.test(line);
        active.add(task ? 'task' : node.parent?.name === 'OrderedList' ? 'numbered' : 'bullet');
        block = true;
        break;
      }
      case 'Blockquote': active.add('quote'); block = true; break;
      case 'Table': case 'FencedCode': case 'CodeBlock': block = true; break;
    }
    if (!node.parent) break;
    node = node.parent;
  }
  if (!block) active.add('body');
  return active;
}

export function runPaperFormat(view: EditorView, format: PaperFormat) {
  if (view.state.readOnly) return false;
  const {from, to} = view.state.selection.main;
  const {changes, anchor, head} = paperFormatEdit(view.state.doc.toString(), from, to, format);
  const openGrid = format === 'table' && view.state.field(paperLivePreview, false) !== undefined;
  view.dispatch({changes, selection: {anchor, head: openGrid ? anchor : head}, scrollIntoView: true, annotations: [Transaction.userEvent.of('input.format'), isolateHistory.of('full')]});
  if (openGrid) {
    const table = view.state.field(paperLivePreview, false)?.blocks.find(block => block.table && block.from <= anchor && block.to >= anchor);
    if (table) requestAnimationFrame(() => focusPaperTable(view, table.from));
  }
  return true;
}

function exitEmptyQuote(view: EditorView) {
  const {state} = view;
  if (state.readOnly || state.selection.ranges.length !== 1 || !state.selection.main.empty) return false;
  const row = state.doc.lineAt(state.selection.main.head);
  if (!/^[ \t]*(?:>[ \t]*)+$/.test(row.text)) return false;
  const marker = row.from + row.text.lastIndexOf('>');
  let node = syntaxTree(state).resolveInner(marker, 1);
  while (node.name !== 'Blockquote' && node.parent) node = node.parent;
  if (node.name !== 'Blockquote') return false;
  const from = row.text.includes('>', row.text.indexOf('>') + 1) ? marker : row.from;
  view.dispatch({changes: {from, to: row.to}, selection: {anchor: from}, scrollIntoView: true, annotations: Transaction.userEvent.of('input')});
  return true;
}

function movePreviewLine(view: EditorView, down: boolean, extend = false) {
  const {state} = view;
  const preview = state.field(paperLivePreview, false);
  const range = state.selection.main;
  if (!preview || state.selection.ranges.length !== 1 || (!extend && !range.empty)) return false;
  const row = state.doc.lineAt(range.head);
  const next = row.number + (down ? 1 : -1);
  if (next < 1 || next > state.doc.lines) return false;
  const moved = view.moveVertically(range, down);
  const movedRow = state.doc.lineAt(moved.head).number;
  if (movedRow === row.number && moved.head !== range.head) {
    const previousCoords = view.coordsAtPos(range.head);
    const movedCoords = view.coordsAtPos(moved.head);
    if (previousCoords && movedCoords && Math.abs(previousCoords.top - movedCoords.top) > view.defaultLineHeight / 2) return false;
  }
  const adjacent = state.doc.line(next);
  const block = preview.blocks.find(candidate => candidate.from <= adjacent.from && candidate.to >= adjacent.to);
  if (!extend && block?.table && focusPaperTable(view, block.from, !down)) return true;
  if (!block && movedRow === next) return false;
  const rawColumn = movedRow === next ? moved.head - adjacent.from : range.head - row.from;
  const head = adjacent.from + Math.min(adjacent.length, rawColumn);
  const selection = extend ? EditorSelection.range(range.anchor, head, moved.goalColumn) : EditorSelection.cursor(head, 0, undefined, moved.goalColumn);
  view.dispatch({selection, scrollIntoView: true, annotations: Transaction.userEvent.of('select')});
  return true;
}

function indentList(view: EditorView, outdent = false) {
  const {from, to} = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  if (from === to && !/^\s*(?:[-*+]|\d+[.)])\s/.test(line.text)) return false;
  return (outdent ? indentLess : indentMore)(view);
}

const formatKeymap = paperFormatGroups.flatMap(group => group.items
  .filter(([, , key]) => !/\d$/.test(key))
  .map(([id, , key]) => ({key, run: (view: EditorView) => runPaperFormat(view, id)})));
const continueMarkup = insertNewlineContinueMarkupCommand({nonTightLists: false});

// Use the physical key for number chords because Shift changes the character on many layouts.
const numberShortcuts = EditorView.domEventHandlers({keydown(event, view) {
  const digit = /^Digit([0-6])$/.exec(event.code)?.[1];
  if (!digit || !event.altKey || (!event.ctrlKey && !event.metaKey) || event.isComposing) return false;
  const format = event.shiftKey ? highlightColors[Number(digit) - 1]?.[0] : digit === '0' ? 'body' : `h${digit}` as PaperFormat;
  return Boolean(format && runPaperFormat(view, format));
}});

type Props = {
  initialSource: string;
  busy: boolean;
  sourceMode: boolean;
  viewRef: RefObject<EditorView | null>;
  onChange: (source: string) => void;
};

export function PaperEditor({initialSource, busy, sourceMode, viewRef, onChange}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const initial = useRef(initialSource);
  const onUpdate = useRef(onChange);
  const permission = useRef(new Compartment());
  const presentation = useRef(new Compartment());

  useEffect(() => { onUpdate.current = onChange; }, [onChange]);
  // An accepted AI summary rewrites the paper outside the editor. Without this the
  // view keeps the stale draft and the next autosave writes it back over the summary.
  const synced = useRef(initialSource);
  useEffect(() => {
    const view = viewRef.current;
    if (!view || initialSource === synced.current) return;
    synced.current = initialSource;
    const current = view.state.doc.toString();
    if (current === initialSource) return;
    view.dispatch({changes: {from: 0, to: current.length, insert: initialSource}});
  }, [initialSource, viewRef]);
  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({parent: host.current, state: EditorState.create({doc: initial.current, extensions: [
      history(), drawSelection(), EditorView.lineWrapping, numberShortcuts,
      keymap.of([...formatKeymap, {key: 'Tab', run: view => indentList(view), shift: view => indentList(view, true)},
        {key: 'Enter', run: view => exitEmptyQuote(view) || continueMarkup(view)},
        {key: 'ArrowUp', run: view => movePreviewLine(view, false), shift: view => movePreviewLine(view, false, true)},
        {key: 'ArrowDown', run: view => movePreviewLine(view, true), shift: view => movePreviewLine(view, true, true)},
        ...markdownKeymap.filter(binding => binding.key !== 'Enter'), ...historyKeymap, ...defaultKeymap]),
      markdown({base: markdownLanguage, extensions: paperMarkdownSyntax, addKeymap: false}),
      presentation.current.of(paperLivePreview),
      permission.current.of([EditorState.readOnly.of(false), EditorView.editable.of(true)]),
      EditorView.contentAttributes.of({'aria-label': '文献 Markdown 编辑区', spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off'}),
      EditorView.updateListener.of(update => {
        if (update.docChanged) onUpdate.current(update.state.doc.toString());
      }),
    ]})});
    viewRef.current = view;
    return () => { viewRef.current = null; view.destroy(); };
  }, [viewRef]);

  useEffect(() => {
    viewRef.current?.dispatch({effects: permission.current.reconfigure([EditorState.readOnly.of(busy), EditorView.editable.of(!busy)])});
  }, [busy, viewRef]);

  useEffect(() => {
    viewRef.current?.dispatch({effects: presentation.current.reconfigure(sourceMode ? syntaxHighlighting(defaultHighlightStyle) : paperLivePreview)});
  }, [sourceMode, viewRef]);

  return <div className="notebook-editor" ref={host}/>;
}
