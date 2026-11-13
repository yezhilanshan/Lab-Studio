import type {RecordItem} from '../app/data';
import {paperMarkdown} from './paper-markdown';

export const OBSIDIAN_CONFIG_KEY = 'seer.workbench.obsidian.v1';
export const DEFAULT_OBSIDIAN_CONFIG = {vault: 'Obsidian Vault', folder: '论文/文献库', docsFolder: 'SEER/结果分析'};

export type ObsidianConfig = {vault: string; folder: string; docsFolder: string};

type NoteOptions = {appUrl?: string; relatedTitle?: string};

// Keep the generated URI below the Windows command-line limit; longer notes are
// handed to Obsidian through the clipboard instead of the `content` parameter.
const MAX_INLINE_CONTENT = 24000;

export function normalizeObsidianFolder(folder: unknown) {
  const segments = String(folder ?? '')
    .split(/[\\/]+/)
    .map(segment => segment.trim())
    .filter(segment => segment && segment !== '.' && segment !== '..');
  return segments.join('/');
}

export function safeObsidianName(title: unknown) {
  const name = String(title ?? '')
    .replace(/[\u0000-\u001f<>:"/\\|?*#^\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+|[. ]+$/g, '')
    .slice(0, 120)
    .trim();
  return name || '未命名文献';
}

export function readObsidianConfig(): ObsidianConfig {
  if (typeof window === 'undefined') return {...DEFAULT_OBSIDIAN_CONFIG};
  try {
    const raw = window.localStorage.getItem(OBSIDIAN_CONFIG_KEY);
    if (!raw) return {...DEFAULT_OBSIDIAN_CONFIG};
    const saved = JSON.parse(raw) as Partial<ObsidianConfig>;
    return {
      vault: String(saved.vault ?? '').trim() || DEFAULT_OBSIDIAN_CONFIG.vault,
      folder: normalizeObsidianFolder(saved.folder) || DEFAULT_OBSIDIAN_CONFIG.folder,
      docsFolder: normalizeObsidianFolder(saved.docsFolder) || DEFAULT_OBSIDIAN_CONFIG.docsFolder,
    };
  } catch {
    return {...DEFAULT_OBSIDIAN_CONFIG};
  }
}

export function saveObsidianConfig(config: ObsidianConfig) {
  try {
    window.localStorage.setItem(OBSIDIAN_CONFIG_KEY, JSON.stringify({
      vault: String(config.vault ?? '').trim() || DEFAULT_OBSIDIAN_CONFIG.vault,
      folder: normalizeObsidianFolder(config.folder) || DEFAULT_OBSIDIAN_CONFIG.folder,
      docsFolder: normalizeObsidianFolder(config.docsFolder) || DEFAULT_OBSIDIAN_CONFIG.docsFolder,
    }));
  } catch {}
}

function yamlString(value: unknown) {
  return '"' + String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r\n?|\n/g, '\\n') + '"';
}

function metaValue(value: unknown) {
  const text = String(value ?? '').trim();
  return text || '';
}

function evidenceBlocks(paper: RecordItem) {
  const blocks: string[] = [];
  if (metaValue(paper.summaryBasis)) blocks.push(`**来源说明**：${String(paper.summaryBasis).trim()}`);
  if (metaValue(paper.yearEvidence)) {
    const basis = metaValue(paper.yearBasis) || '年份依据';
    blocks.push(`**${metaValue(paper.year) || '年份待核验'} · ${basis}**\n\n${String(paper.yearEvidence).trim()}`);
  }
  if (metaValue(paper.abstract)) blocks.push(`**原文摘要 / 首页摘录**\n\n${String(paper.abstract).trim()}`);
  if (metaValue(paper.limitationEvidence)) {
    const page = metaValue(paper.limitationPage);
    blocks.push(`**局限性原文${page ? ` · 第 ${page} 页` : ''}**\n\n${String(paper.limitationEvidence).trim()}`);
  }
  return blocks;
}

export function paperObsidianMarkdown(paper: RecordItem, options: NoteOptions = {}) {
  const title = metaValue(paper.title) || '未命名文献';
  const status = metaValue(paper.review) || metaValue(paper.status);
  const updated = new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai', hour12: false});
  const frontmatter = [
    ['title', title],
    ['authors', metaValue(paper.authors)],
    ['year', metaValue(paper.year)],
    ['venue', metaValue(paper.venue)],
    ['theme', metaValue(paper.theme)],
    ['type', metaValue(paper.type)],
    ['status', status],
    ['priority', paper.priority ? 'true' : ''],
    ['url', metaValue(paper.url)],
    ['source-path', metaValue(paper.sourcePath)],
    ['workbench-id', metaValue(paper.id)],
    ['updated', updated],
    ['generator', 'lab-studio'],
  ].filter(([, value]) => value !== '') as [string, string][];

  const metaLine = [
    metaValue(paper.year),
    metaValue(paper.venue) || metaValue(paper.type),
    metaValue(paper.theme),
    status,
  ].filter(Boolean).join(' · ');

  const dimensions = paperMarkdown(paper).trim();
  const evidence = evidenceBlocks(paper);
  const sources: string[] = [];
  sources.push(`- [Google Scholar](https://scholar.google.com/scholar?q=${encodeURIComponent(title)})`);
  if (/^https?:\/\//i.test(metaValue(paper.url))) sources.push(`- [论文来源](${metaValue(paper.url)})`);
  if (metaValue(paper.documentId) && options.appUrl) {
    sources.push(`- [下载原文](${options.appUrl.replace(/\/+$/, '')}/api/documents/${encodeURIComponent(metaValue(paper.documentId))})`);
  }
  if (metaValue(paper.sourcePath)) sources.push(`- 本地原文：\`${metaValue(paper.sourcePath)}\``);
  if (options.appUrl) sources.push(`- 工作台记录：${options.appUrl.replace(/\/+$/, '')}/#library`);

  const related = metaValue(paper.relatedTo)
    ? [
        '## 关联工作',
        '',
        `- ${metaValue(paper.relation) || '关联'}：${options.relatedTitle || metaValue(paper.relatedTo)}`,
        metaValue(paper.relationNote) ? `\n${metaValue(paper.relationNote)}` : '',
      ].join('\n')
    : '';

  return [
    '---',
    ...frontmatter.map(([key, value]) => `${key}: ${yamlString(value)}`),
    '---',
    '',
    `# ${title}`,
    '',
    `> [!info] 由 Lab Studio 文献库生成`,
    `> 生成时间：${updated}${metaValue(paper.id) ? ` · 记录 ${metaValue(paper.id)}` : ''}`,
    '> 再次打开会覆盖同名笔记；请在 Obsidian 中继续编辑。',
    '',
    metaLine ? `**${metaLine}**` : '',
    metaLine ? '' : '',
    dimensions,
    evidence.length ? '\n## 原文摘录与来源说明\n\n' + evidence.join('\n\n') : '',
    related ? `\n${related}` : '',
    sources.length ? '\n## 来源\n\n' + sources.join('\n') : '',
    '',
  ].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '')).join('\n');
}

function obsidianNewUri(vault: string, file: string, content: string, useClipboard: boolean) {
  const parts = [
    `vault=${encodeURIComponent(vault)}`,
    `file=${encodeURIComponent(file)}`,
    'overwrite=true',
    'paneType=tab',
  ];
  if (useClipboard) parts.push('clipboard=true');
  else parts.push(`content=${encodeURIComponent(content)}`);
  return 'obsidian://new?' + parts.join('&');
}

export function obsidianVaultUri(vault: string) {
  return 'obsidian://open?vault=' + encodeURIComponent(String(vault || DEFAULT_OBSIDIAN_CONFIG.vault));
}

function launchUri(uri: string) {
  const anchor = document.createElement('a');
  anchor.href = uri;
  anchor.rel = 'noreferrer';
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export type ObsidianResult = {ok: boolean; message: string; file: string};

async function deliverToObsidian(vault: string, file: string, content: string): Promise<ObsidianResult> {
  // Obsidian's URI handler has an OS/browser URL length limit, so prefer
  // transferring the note through the clipboard (Obsidian 1.7+). Fall back to
  // the content parameter only when the note is short enough and clipboard
  // access is unavailable.
  let useClipboard = true;
  try {
    if (!navigator.clipboard?.writeText) throw Error('clipboard unavailable');
    await navigator.clipboard.writeText(content);
  } catch {
    useClipboard = false;
    if (encodeURIComponent(content).length > MAX_INLINE_CONTENT) {
      return {ok: false, message: '剪贴板写入失败；这篇笔记较长，无法通过 URI 直接传递。请检查浏览器剪贴板权限后重试。', file};
    }
  }

  launchUri(obsidianNewUri(vault, file, content, useClipboard));
  return {
    ok: true,
    message: `已请求 Obsidian 打开：${file}.md${useClipboard ? '（正文经剪贴板传入）' : ''}`,
    file,
  };
}

export async function openPaperInObsidian(
  paper: RecordItem,
  options: NoteOptions & {readingMarkdown?: string} = {},
): Promise<ObsidianResult> {
  if (typeof window === 'undefined') return {ok: false, message: '只能在浏览器中打开 Obsidian。', file: ''};

  const config = readObsidianConfig();
  const folder = normalizeObsidianFolder(config.folder) || DEFAULT_OBSIDIAN_CONFIG.folder;
  const file = `${folder}/${safeObsidianName(paper.title)}`;
  const target = options.readingMarkdown ? {...paper, readingMarkdown: options.readingMarkdown} : paper;
  const content = paperObsidianMarkdown(target, {
    appUrl: window.location.origin,
    relatedTitle: options.relatedTitle,
  });
  return deliverToObsidian(config.vault, file, content);
}

export type MarkdownNoteInput = {
  title: string;
  content: string;
  sourcePath?: string;
  sourceUrl?: string;
  kind?: string;
};

export function markdownNoteDocument(note: MarkdownNoteInput) {
  const title = String(note.title || '未命名文档').trim();
  const updated = new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai', hour12: false});
  const fields = [
    ['title', title],
    ['source-path', String(note.sourcePath || '').trim()],
    ['source-url', String(note.sourceUrl || '').trim()],
    ['kind', String(note.kind || '').trim()],
    ['updated', updated],
    ['generator', 'lab-studio'],
  ].filter(([, value]) => value !== '') as [string, string][];
  const body = String(note.content || '').trim();
  const heading = /^#\s+/.test(body) ? '' : `# ${title}\n\n`;
  return [
    '---',
    ...fields.map(([key, value]) => `${key}: ${yamlString(value)}`),
    '---',
    '',
    '> [!info] 由 Lab Studio 研究推进生成',
    `> 生成时间：${updated}${note.sourcePath ? ` · 原始文档 \`${note.sourcePath}\`` : ''}`,
    '> 再次打开会覆盖同名笔记；请在 Obsidian 中继续编辑。',
    '',
    heading + body,
    '',
  ].join('\n');
}

export async function openMarkdownInObsidian(
  note: MarkdownNoteInput,
  options: {folder?: string; fileBase?: string} = {},
): Promise<ObsidianResult> {
  if (typeof window === 'undefined') return {ok: false, message: '只能在浏览器中打开 Obsidian。', file: ''};

  const config = readObsidianConfig();
  const folder = normalizeObsidianFolder(options.folder || config.docsFolder) || DEFAULT_OBSIDIAN_CONFIG.docsFolder;
  const file = `${folder}/${safeObsidianName(options.fileBase || note.title)}`;
  const content = markdownNoteDocument(note);
  return deliverToObsidian(config.vault, file, content);
}
