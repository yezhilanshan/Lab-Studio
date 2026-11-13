import {redo, undo, isolateHistory} from '@codemirror/commands';
import {Transaction} from '@codemirror/state';
import {EditorView, WidgetType} from '@codemirror/view';
import {renderPaperInline} from '../lib/paper-markdown-render';
import {highlightColors, paperFormatEdit, paperFormatGroups, type PaperFormat} from '../lib/paper-format';
import {editPaperTable, paperTableCellEdit, readPaperTable, tableCellText, type TableAction} from '../lib/paper-table';

type Cell = {row: number; column: number};
type TableView = {sync: (source: string, readOnly: boolean) => void; format: (input: HTMLInputElement, command: PaperFormat) => boolean};
const tables = new WeakMap<HTMLElement, TableView>();
const actions = [
  ['row-add', '＋ 行', '添加行'], ['column-add', '＋ 列', '添加列'],
  ['row-remove', '− 行', '删除行'], ['column-remove', '− 列', '删除列'],
] as const;
const cellFormats = [...paperFormatGroups[0].items, ...paperFormatGroups[2].items.filter(([format]) => format === 'link' || format === 'wiki' || format === 'image')];

export function isPaperCellFormat(command: PaperFormat) {
  return cellFormats.some(([format]) => format === command) || highlightColors.some(([format]) => format === command);
}

export function applyPaperCellFormat(input: HTMLInputElement, command: PaperFormat) {
  const table = input.closest<HTMLElement>('.notebook-edit-table');
  return Boolean(table && tables.get(table)?.format(input, command));
}

function inputAt(root: HTMLElement, row: number, column: number) {
  return root.querySelector<HTMLInputElement>(`[data-table-cell="${row},${column}"]`);
}

export function focusPaperTable(view: EditorView, from: number, atEnd = false, column = 0) {
  const table = Array.from(view.contentDOM.querySelectorAll<HTMLElement>('.notebook-edit-table'))
    .find(element => view.posAtDOM(element) === from);
  const row = atEnd ? Number(table?.dataset.lastRow || 0) : 0;
  const input = table && inputAt(table, row, Math.min(column, Number(table.dataset.lastColumn || 0)));
  input?.focus();
  return Boolean(input);
}

function createTableView(root: HTMLElement, view: EditorView, initial: string): TableView {
  const tools = document.createElement('div');
  tools.className = 'notebook-table-tools';
  const viewport = document.createElement('div');
  viewport.className = 'notebook-table-viewport';
  root.appendChild(tools);
  root.appendChild(viewport);
  for (const [action, text, label] of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = action;
    button.textContent = text;
    button.title = label;
    button.setAttribute('aria-label', label);
    tools.appendChild(button);
  }
  const align = document.createElement('select');
  align.setAttribute('aria-label', '列对齐');
  for (const [value, text] of [['left', '左对齐'], ['center', '居中'], ['right', '右对齐']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    align.appendChild(option);
  }
  tools.appendChild(align);

  let source = initial;
  let model = readPaperTable(source);
  let active: Cell = {row: 0, column: 0};
  let pending: Cell | null = null;
  let ownInput: HTMLInputElement | null = null;
  let readOnly = false;

  function buildGrid() {
    const table = document.createElement('table');
    table.setAttribute('aria-label', 'Markdown 表格');
    const heading = table.createTHead();
    const body = table.createTBody();
    model.rows.forEach((_, row) => {
      const tr = (row === 0 ? heading : body).insertRow();
      model.separators.forEach((_, column) => {
        const td = document.createElement(row === 0 ? 'th' : 'td');
        const cell = document.createElement('div');
        cell.className = 'notebook-table-cell';
        const preview = document.createElement('span');
        preview.className = 'notebook-table-cell-preview';
        preview.setAttribute('aria-hidden', 'true');
        const input = document.createElement('input');
        input.type = 'text';
        input.size = 1;
        input.spellcheck = false;
        input.dataset.tableCell = `${row},${column}`;
        input.setAttribute('aria-label', `第 ${row + 1} 行第 ${column + 1} 列`);
        cell.appendChild(preview);
        cell.appendChild(input);
        td.appendChild(cell);
        tr.appendChild(td);
      });
    });
    viewport.replaceChildren(table);
  }

  function updateTools() {
    const separator = model.separators[active.column] || '';
    align.value = separator.endsWith(':') ? separator.startsWith(':') ? 'center' : 'right' : 'left';
    align.disabled = readOnly;
    for (const button of tools.querySelectorAll<HTMLButtonElement>('button')) {
      button.disabled = readOnly || (button.dataset.action === 'row-remove' && active.row === 0) ||
        (button.dataset.action === 'column-remove' && model.separators.length < 2);
    }
  }

  function sync(next: string, locked: boolean) {
    const previous = model;
    if (source !== next) model = readPaperTable(next);
    source = next;
    readOnly = locked;
    const row = Math.min(active.row, model.rows.length - 1);
    const column = Math.min(active.column, model.separators.length - 1);
    active = {row, column};
    const rebuild = !viewport.firstChild || previous.rows.length !== model.rows.length || previous.separators.length !== model.separators.length;
    const restore = pending || (rebuild && root.contains(document.activeElement) ? active : null);
    if (rebuild) buildGrid();
    root.dataset.lastRow = String(model.rows.length - 1);
    root.dataset.lastColumn = String(model.separators.length - 1);
    model.rows.forEach((cells, row) => model.separators.forEach((separator, column) => {
      const input = inputAt(root, row, column)!;
      const cell = tableCellText(cells[column] || '');
      if (input !== ownInput && input.value !== cell) input.value = cell;
      input.readOnly = locked;
      const preview = input.previousElementSibling!;
      if (preview.getAttribute('data-source') !== cell) {
        try { preview.innerHTML = renderPaperInline(cell); } catch { preview.textContent = cell; }
        preview.setAttribute('data-source', cell);
      }
      input.style.textAlign = preview.parentElement!.style.textAlign = separator.endsWith(':') ? separator.startsWith(':') ? 'center' : 'right' : 'left';
    }));
    updateTools();
    if (restore) inputAt(root, restore.row, restore.column)?.focus();
  }

  function commit(input: HTMLInputElement, format = false) {
    if (view.state.readOnly) return;
    const [row, column] = input.dataset.tableCell!.split(',').map(Number);
    const edit = paperTableCellEdit(model, row, column, input.value);
    if (!edit) return;
    const base = view.posAtDOM(root);
    ownInput = input;
    try {
      const annotations = [Transaction.userEvent.of(format ? 'input.format' : 'input.type')];
      if (format) annotations.push(isolateHistory.of('full'));
      view.dispatch({changes: {from: base + edit.from, to: base + edit.to, insert: edit.insert}, annotations});
    } finally { ownInput = null; }
  }

  function formatCell(input: HTMLInputElement, command: PaperFormat) {
    if (view.state.readOnly || !isPaperCellFormat(command)) return false;
    const {changes, anchor, head} = paperFormatEdit(input.value, input.selectionStart ?? 0, input.selectionEnd ?? 0, command);
    for (const edit of changes.slice().reverse()) input.setRangeText(edit.insert, edit.from, edit.to);
    input.setSelectionRange(anchor, head);
    commit(input, true);
    return true;
  }

  function change(action: TableAction, row = active.row, column = active.column) {
    if (view.state.readOnly) return;
    const next = editPaperTable(model, action, row, column);
    if (!next) return;
    if (next.source === source) { inputAt(root, next.row, next.column)?.focus(); return; }
    const from = view.posAtDOM(root);
    pending = next;
    try {
      view.dispatch({changes: {from, to: from + source.length, insert: next.source}, annotations: [Transaction.userEvent.of('input.format'), isolateHistory.of('full')]});
    } finally { pending = null; }
  }

  function exit(before: boolean, addLine = false) {
    const from = view.posAtDOM(root);
    const boundary = view.state.doc.lineAt(before ? from : from + source.length).number;
    const line = boundary + (before ? -1 : 1);
    if (line >= 1 && line <= view.state.doc.lines) {
      view.dispatch({selection: {anchor: view.state.doc.line(line).from}, scrollIntoView: true});
    } else if (addLine) {
      const at = before ? from : from + source.length;
      if (view.state.readOnly) return;
      view.dispatch({changes: {from: at, insert: '\n'}, selection: {anchor: before ? at : at + 1}, scrollIntoView: true});
    } else return;
    view.focus();
  }

  tools.addEventListener('mousedown', event => { if (event.target instanceof HTMLButtonElement) event.preventDefault(); });
  tools.addEventListener('click', event => {
    if (event.target instanceof HTMLButtonElement && event.target.dataset.action) change(event.target.dataset.action as TableAction);
  });
  align.addEventListener('change', () => change(align.value as TableAction));
  viewport.addEventListener('focusin', event => {
    if (!(event.target instanceof HTMLInputElement) || !event.target.dataset.tableCell) return;
    const [row, column] = event.target.dataset.tableCell.split(',').map(Number);
    active = {row, column};
    updateTools();
  });
  viewport.addEventListener('input', event => {
    if (!(event instanceof InputEvent && event.isComposing) && event.target instanceof HTMLInputElement) commit(event.target);
  });
  viewport.addEventListener('compositionend', event => { if (event.target instanceof HTMLInputElement) commit(event.target); });
  viewport.addEventListener('keydown', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || event.isComposing) return;
    const {row, column} = active;
    const columns = model.separators.length;
    const rows = model.rows.length;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && ['z','y'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      if (!view.state.readOnly) (event.shiftKey || event.key.toLowerCase() === 'y' ? redo : undo)(view);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !view.state.readOnly) {
      const key = `Mod-${event.shiftKey ? 'Shift-' : ''}${event.altKey ? 'Alt-' : ''}${event.key.length === 1 ? event.key.toLowerCase() : event.key}`;
      const color = event.shiftKey && event.altKey ? highlightColors[Number(event.code.match(/^Digit([1-6])$/)?.[1]) - 1]?.[0] : undefined;
      const format = color || cellFormats.find(([, , shortcut]) => shortcut === key)?.[0];
      if (format && formatCell(input, format)) {
        event.preventDefault();
        return;
      }
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') { event.preventDefault(); exit(false, true); return; }
    if (event.key === 'Tab') {
      event.preventDefault();
      const index = row * columns + column + (event.shiftKey ? -1 : 1);
      if (index < 0) exit(true);
      else if (index >= rows * columns) change('row-add', rows - 1, 0);
      else inputAt(root, Math.floor(index / columns), index % columns)?.focus();
    } else if (event.key === 'Enter' || (!event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown'))) {
      event.preventDefault();
      const next = row + (event.key === 'ArrowUp' || event.shiftKey ? -1 : 1);
      if (next >= 0 && next < rows) inputAt(root, next, column)?.focus();
      else if (next === rows && event.key === 'Enter') change('row-add', row, column);
      else exit(next < 0);
    } else if (!event.shiftKey && input.selectionStart === input.selectionEnd) {
      const next = event.key === 'ArrowLeft' && input.selectionStart === 0 ? column - 1 :
        event.key === 'ArrowRight' && input.selectionEnd === input.value.length ? column + 1 : column;
      if (next !== column && next >= 0 && next < columns) {
        event.preventDefault();
        inputAt(root, row, next)?.focus();
      }
    }
  });
  return {sync, format: formatCell};
}

export class PaperTableWidget extends WidgetType {
  constructor(readonly source: string, readonly readOnly: boolean) { super(); }

  eq(other: PaperTableWidget) { return this.source === other.source && this.readOnly === other.readOnly; }

  toDOM(view: EditorView) {
    const root = document.createElement('div');
    root.className = 'notebook-edit-table';
    root.contentEditable = 'false';
    const table = createTableView(root, view, this.source);
    tables.set(root, table);
    table.sync(this.source, this.readOnly);
    return root;
  }

  updateDOM(root: HTMLElement) {
    const table = tables.get(root);
    table?.sync(this.source, this.readOnly);
    return Boolean(table);
  }
}
