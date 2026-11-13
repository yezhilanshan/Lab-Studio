export const highlightColors = [
  ['red', '🔴', '红色', 'Mod-Shift-Alt-1'], ['orange', '🟠', '橙色', 'Mod-Shift-Alt-2'], ['yellow', '🟡', '黄色', 'Mod-Shift-Alt-3'],
  ['green', '🟢', '绿色', 'Mod-Shift-Alt-4'], ['blue', '🔵', '蓝色', 'Mod-Shift-Alt-5'], ['purple', '🟣', '紫色', 'Mod-Shift-Alt-6'],
] as const;

export const paperFormatGroups = [
  {label: '文本格式', items: [
    ['bold', '加粗', 'Mod-b'], ['italic', '倾斜', 'Mod-i'], ['strike', '删除线', 'Mod-Alt-s'],
    ['highlight', '高亮', 'Mod-Alt-h'], ['code', '行内代码', 'Mod-Alt-c'],
    ['math', '行内数学', 'Mod-Alt-m'], ['comment', '注释', 'Mod-Alt-x'],
    ['clear', '清除格式', 'Mod-Alt-Backspace'],
  ]},
  {label: '段落设置', items: [
    ['bullet', '无序列表', 'Mod-Alt-u'], ['numbered', '有序列表', 'Mod-Alt-o'],
    ['task', '任务列表', 'Mod-Alt-l'], ['h1', '1 级标题', 'Mod-Alt-1'],
    ['h2', '2 级标题', 'Mod-Alt-2'], ['h3', '3 级标题', 'Mod-Alt-3'],
    ['h4', '4 级标题', 'Mod-Alt-4'], ['h5', '5 级标题', 'Mod-Alt-5'],
    ['h6', '6 级标题', 'Mod-Alt-6'], ['body', '正文', 'Mod-Alt-0'], ['quote', '引用', 'Mod-Alt-q'],
  ]},
  {label: '插入', items: [
    ['wiki', '文献链接', 'Mod-Alt-k'], ['link', '外部链接', 'Mod-k'],
    ['footnote', '脚注', 'Mod-Alt-f'], ['table', '表格', 'Mod-Alt-t'],
    ['callout', '标注', 'Mod-Alt-a'], ['rule', '分隔线', 'Mod-Alt-r'],
    ['codeblock', '代码块', 'Mod-Shift-Alt-c'], ['mathblock', '数学块', 'Mod-Shift-Alt-m'],
    ['image', '图片链接', 'Mod-Alt-i'],
  ]},
] as const;

export type PaperFormat = (typeof paperFormatGroups)[number]['items'][number][0] | (typeof highlightColors)[number][0];
type Change = {from: number; to: number; insert: string};
type Edit = {changes: Change[]; anchor: number; head: number};
const colorPrefix = /^(?:🔴|🟠|🟡|🟢|🔵|🟣)/u;
const wrapTokens = {bold: '**', italic: '_', strike: '~~', math: '$', comment: '%%'};
const listPrefix = /^(?:[-+*]|\d{1,9}[.)])[ \t]+(?:\[[^\]\n]\][ \t]+)?/;
const blockPrefix = /^(?:#{1,6}[ \t]+|>[ \t]?)/;

export function paperFormatEdit(source: string, from: number, to: number, format: PaperFormat): Edit {
  const selected = source.slice(from, to);
  const lineStart = from ? source.lastIndexOf('\n', from - 1) + 1 : 0;
  const endOffset = to > from && source[to - 1] === '\n' ? to - 1 : to;
  const nextLine = source.indexOf('\n', endOffset);
  const lineEnd = nextLine < 0 ? source.length : nextLine;

  function replace(start: number, end: number, insert: string, offset = insert.length, length = 0): Edit {
    const anchor = start + offset;
    return {changes: [{from: start, to: end, insert}], anchor, head: anchor + length};
  }

  function wrap(open: string, close = open, content = selected, toggle = true) {
    if (toggle && selected.length >= open.length + close.length && selected.startsWith(open) && selected.endsWith(close)) {
      const inner = selected.slice(open.length, -close.length);
      return replace(from, to, inner, 0, inner.length);
    }
    if (toggle && from >= open.length && source.slice(from - open.length, from) === open && source.slice(to, to + close.length) === close) {
      return replace(from - open.length, to + close.length, selected, 0, selected.length);
    }
    return replace(from, to, open + content + close, open.length, content.length);
  }

  function block(body: string, offset = body.length, length = 0, start = from, end = to) {
    const before = source.slice(0, start);
    const after = source.slice(end);
    const left = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const right = !after || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
    return replace(start, end, left + body + right, left.length + offset, length);
  }

  const color = highlightColors.find(([id]) => id === format);
  if (color || format === 'highlight') {
    const paint = color?.[1] || '';
    const fullySelected = selected.length >= 4 && selected.startsWith('==') && selected.endsWith('==');
    const left = /==(?:🔴|🟠|🟡|🟢|🔵|🟣)?$/u.exec(source.slice(0, from))?.[0];
    if (fullySelected || (left && source.slice(to, to + 2) === '==')) {
      const inner = fullySelected ? selected.slice(2, -2).replace(colorPrefix, '') : selected;
      const start = fullySelected ? from : from - left!.length;
      const end = fullySelected ? to : to + 2;
      return color ? replace(start, end, '==' + paint + inner + '==', 2 + paint.length, inner.length) : replace(start, end, inner, 0, inner.length);
    }
    return wrap('==' + paint, '==', selected, false);
  }
  if (format in wrapTokens) return wrap(wrapTokens[format as keyof typeof wrapTokens]);
  if (format === 'code') {
    const size = Math.max(0, ...Array.from(selected.matchAll(/`+/g), match => match[0].length));
    const fence = '`'.repeat(size + 1);
    const space = selected.startsWith('`') || selected.endsWith('`') ? ' ' : '';
    return wrap(fence + space, space + fence);
  }
  if (format === 'wiki') return wrap('[[', ']]', selected || '文献标题', false);
  if (format === 'link' || format === 'image') {
    const label = selected || (format === 'image' ? '图片说明' : '链接文字');
    const start = (format === 'image' ? '![' : '[') + label.replace(/(?<!\\)[\[\]]/g, '\\$&').replace(/\n/g, ' ') + '](';
    return replace(from, to, start + 'https://)', start.length, 'https://'.length);
  }
  if (format === 'footnote') {
    let index = 1;
    while (source.includes(`[^${index}]`)) index++;
    const reference = `[^${index}]`;
    const definition = `\n\n${reference}: `;
    return {changes: [{from: to, to, insert: reference}, {from: source.length, to: source.length, insert: definition + '脚注内容'}],
      anchor: source.length + reference.length + definition.length, head: source.length + reference.length + definition.length + '脚注内容'.length};
  }
  if (format === 'table') {
    const header = selected.trim().replace(/\n/g, ' ').replace(/(?<!\\)\|/g, '\\|');
    return block(`| ${header} |  |\n| --- | --- |\n|  |  |`, 2, header.length);
  }
  if (format === 'callout') {
    const title = '> [!note] 标注';
    const content = (selected || '标注内容').split('\n').map(line => '> ' + line).join('\n');
    return block(title + '\n' + content, title.length - 2, 2);
  }
  if (format === 'rule') return block('---\n\n', 5, 0, to, to);
  if (format === 'codeblock' || format === 'mathblock') {
    const fence = format === 'mathblock' ? '$$' : '`'.repeat(Math.max(3, ...Array.from(selected.matchAll(/`{3,}/g), match => match[0].length + 1)));
    return block(`${fence}\n${selected}\n${fence}`, fence.length + 1, selected.length);
  }
  if (format === 'clear' && selected && (from !== lineStart || to !== lineEnd)) {
    const plain = clearInline(selected);
    return replace(from, to, plain, 0, plain.length);
  }

  const lines = source.slice(lineStart, lineEnd).split('\n');
  const prefix = (line: string, index: number) => {
    const indent = line.match(/^[ \t]*/)?.[0] || '';
    const body = line.slice(indent.length);
    if (!body && lines.length > 1) return line;
    if (format === 'quote') return indent + (lines.every(text => !text.trim() || /^[ \t]*>/.test(text)) ? body.replace(/^>[ \t]?/, '') : '> ' + body);
    const oldList = body.match(listPrefix)?.[0] || '';
    const rest = body.replace(listPrefix, '').replace(blockPrefix, '');
    if (format === 'bullet') return indent + '- ' + rest;
    if (format === 'numbered') return indent + `${index + 1}. ` + rest;
    if (format === 'task') return indent + '- ' + (oldList.match(/\[[^\]\n]\][ \t]+/)?.[0] || '[ ] ') + rest;
    if (/^h[1-6]$/.test(format)) return indent + '#'.repeat(Number(format[1])) + ' ' + rest;
    return indent + (format === 'clear' ? clearInline(rest) : rest);
  };
  const updated = lines.map(prefix).join('\n');
  if (from !== to) return replace(lineStart, lineEnd, updated, 0, updated.length);
  const cursor = Math.max(0, Math.min(updated.length, from - lineStart + updated.length - lines.join('\n').length));
  return replace(lineStart, lineEnd, updated, cursor);
}

function clearInline(text: string) {
  let plain = text.replace(/(?<!\\)!?\[([^\[\]\n]*)\]\([^\n]*?\)/g, '$1')
    .replace(/(?<!\\)\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g, (_, title, alias) => alias || title);
  for (let depth = 0; depth < 6; depth++) {
    const next = plain.replace(/(?<!\\)(\*{1,3}|_{1,3}|~~|==|`+|%%|\$)(.+?)\1/g, (_, marker, body: string) => marker === '==' ? body.replace(colorPrefix, '') : body);
    if (next === plain) break;
    plain = next;
  }
  return plain;
}
