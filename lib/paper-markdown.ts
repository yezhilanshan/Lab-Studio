import type {RecordItem} from '../app/data';

export const PAPER_DIMENSIONS = [
  ['problem', '解决什么问题'],
  ['difficulty', '遇到的难点'],
  ['solution', '具体解决思路'],
  ['limitations', '存在的局限'],
  ['borrow', '可借鉴的点'],
] as const;

const sections = [...PAPER_DIMENSIONS, ['notes', '研究笔记']] as const;

function legacyBody(paper: RecordItem, field: typeof sections[number][0]) {
  const text = String(paper[field] || '').trim();
  if (!text || field === 'problem' || field === 'notes') return text;
  const lines = text.split(/\r?\n/);
  // Preserve existing Markdown blocks. Older summaries are often one item per line.
  if (lines.some(line => /^(?:\s*$|\s{2,}|\s*(?:[-*+]\s|\d+[.)]\s|#|>|```|~~~|\|))/.test(line))) return text;
  return lines.map(line => '- ' + line.replace(/^\s*(?:•|\d+[、.])\s*/, '')).join('\n');
}

export function paperMarkdown(paper: RecordItem) {
  if (typeof paper.readingMarkdown === 'string') return paper.readingMarkdown;
  return sections.map(([field, heading]) => {
    const body = legacyBody(paper, field);
    return `## ${heading}${body ? '\n\n' + body : ''}`;
  }).join('\n\n') + '\n';
}

// What the reader actually shows for each dimension: the Markdown section when
// one exists, otherwise the stored field. Diffing against the raw field would
// claim changes the reader never sees.
export function paperSections(paper: RecordItem) {
  const source = paperMarkdown(paper);
  const ranges = sectionRanges(source);
  const result: Record<string, string> = {};
  for (const [field, heading] of PAPER_DIMENSIONS) {
    const range = ranges.find(item => item.title === heading);
    result[field] = range ? source.slice(range.bodyStart, range.end).trim() : String(paper[field] || '').trim();
  }
  return result;
}

function sectionRanges(source: string) {
  const headings: {title: string; bodyStart: number; end: number}[] = [];
  let offset = 0;
  let fence: string | undefined;
  for (const line of source.match(/[^\n]*\n|[^\n]+$/g) || []) {
    const trimmed = line.trimEnd();
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(trimmed);
    if (fence === '%%' || fence === '$$') {
      if (trimmed.includes(fence)) fence = undefined;
    } else if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
    } else if (marker) {
      fence = marker[1];
    } else if (/^ {0,3}(%%|\$\$)/.test(trimmed)) {
      const opening = trimmed.trimStart().slice(0, 2);
      if (!trimmed.trimStart().slice(2).includes(opening)) fence = opening;
    } else {
      const heading = /^ {0,3}(#{1,2})(?:[ \t]+|$)(.*)$/.exec(trimmed);
      if (heading) {
        if (headings.length) headings[headings.length - 1].end = offset;
        headings.push({title: heading[1] === '##' ? heading[2].replace(/[ \t]+#+$/, '').trim() : '', bodyStart: offset + line.length, end: source.length});
      }
    }
    offset += line.length;
  }
  return headings;
}

export function applyPaperMarkdown(paper: RecordItem, source: string): RecordItem {
  const previous = paperMarkdown(paper);
  const oldRanges = sectionRanges(previous);
  const ranges = sectionRanges(source);
  const next: RecordItem = {...paper, readingMarkdown: source};
  for (const [field, heading] of sections) {
    const range = ranges.find(item => item.title === heading);
    if (!range) continue;
    const old = oldRanges.find(item => item.title === heading);
    const body = source.slice(range.bodyStart, range.end).trim();
    if (!old || body !== previous.slice(old.bodyStart, old.end).trim()) next[field] = body;
  }
  return next;
}

export function mergePaperFields(previous: RecordItem, next: RecordItem): RecordItem {
  if (typeof previous.readingMarkdown !== 'string') return next;
  let source = previous.readingMarkdown;
  for (const [field, heading] of sections) {
    if (String(previous[field] || '') === String(next[field] || '')) continue;
    const body = legacyBody(next, field);
    const range = sectionRanges(source).find(item => item.title === heading);
    if (!range && body) {
      source = (source.trimEnd() ? source.trimEnd() + '\n\n' : '') + `## ${heading}\n\n${body}\n`;
    } else if (range) {
      const prefix = source.slice(0, range.bodyStart).trimEnd();
      source = prefix + (body ? `\n\n${body}` : '') + (range.end < source.length ? '\n\n' : '\n') + source.slice(range.end);
    }
  }
  return {...next, readingMarkdown: source};
}

// Accepting an AI summary must not discard edits that are still sitting in the editor
// draft, and the draft must not later overwrite the summary. Fold the draft in first.
export function applySummaryWithDraft(paper: RecordItem, draft: string | null | undefined, patch: Record<string, string>, model: string): RecordItem {
  const flushed = typeof draft === 'string' ? applyPaperMarkdown(paper, draft) : paper;
  const next: RecordItem = {...flushed};
  for (const [field, value] of Object.entries(patch)) if (value) next[field] = value;
  return mergePaperFields(flushed, {...next, review: 'API草稿待核验', summaryModel: model, summaryDate: new Date().toISOString()});
}
