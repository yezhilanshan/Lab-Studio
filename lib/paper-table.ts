export type PaperTable = {rows: string[][]; separators: string[]; lines: string[]};

function parseRow(line: string) {
  const text = line.trim();
  const cells: string[] = [];
  let start = text.startsWith('|') ? 1 : 0;
  for (let index = start; index < text.length; index++) {
    if (text[index] === '|' && text[index - 1] !== '\\') {
      cells.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (start < text.length || !text.endsWith('|')) cells.push(text.slice(start).trim());
  return cells;
}

export function readPaperTable(source: string): PaperTable {
  const lines = source.split('\n');
  return {lines, rows: [parseRow(lines[0]), ...lines.slice(2).map(parseRow)], separators: parseRow(lines[1] || '')};
}

export function tableCellText(cell: string) { return cell.replace(/\\\|/g, '|'); }

function rowMarkdown(cells: string[]) { return '| ' + cells.join(' | ') + ' |'; }

export function paperTableCellEdit(table: PaperTable, row: number, column: number, value: string) {
  const line = row === 0 ? 0 : row + 1;
  const cells = table.rows[row].slice();
  while (cells.length < table.separators.length) cells.push('');
  const cell = value.trim().replace(/\|/g, '\\|');
  if (cells[column] === cell) return null;
  cells[column] = cell;
  const from = table.lines.slice(0, line).reduce((position, text) => position + text.length + 1, 0);
  return {from, to: from + table.lines[line].length, insert: rowMarkdown(cells)};
}

export type TableAction = 'row-add' | 'row-remove' | 'column-add' | 'column-remove' | 'left' | 'center' | 'right';

export function editPaperTable(table: PaperTable, action: TableAction, row: number, column: number) {
  const {rows, separators} = table;
  if (action === 'row-add' || action === 'row-remove') {
    if (action === 'row-remove' && row === 0) return null;
    const lines = table.lines.slice();
    if (action === 'row-add') lines.splice(row + 2, 0, rowMarkdown(separators.map(() => '')));
    else lines.splice(row + 1, 1);
    return {source: lines.join('\n'), row: action === 'row-add' ? row + 1 : Math.min(row, rows.length - 2), column};
  }
  if (action === 'column-remove' && separators.length < 2) return null;
  if (action === 'left' || action === 'center' || action === 'right') {
    const marks = separators.slice();
    marks[column] = action === 'left' ? ':---' : action === 'center' ? ':---:' : '---:';
    const lines = table.lines.slice();
    lines[1] = rowMarkdown(marks);
    return {source: lines.join('\n'), row, column};
  }
  const marks = separators.slice();
  const index = action === 'column-add' ? column + 1 : column;
  const change = (cells: string[], inserted: string) => {
    while (cells.length < separators.length) cells.push('');
    if (action === 'column-add') cells.splice(index, 0, inserted);
    else cells.splice(index, 1);
    return rowMarkdown(cells);
  };
  const [heading, ...body] = rows.map(cells => change(cells.slice(), ''));
  return {source: [heading, change(marks, '---'), ...body].join('\n'), row, column: Math.min(index, marks.length - 1)};
}
