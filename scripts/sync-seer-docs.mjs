import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '..');
const sourceRoot = path.resolve(process.env.SEER_DOCS_ROOT || 'D:/lab/SEER/docs');
const publicRoot = path.join(project, 'public/evidence/seer-docs');
const docsOut = path.join(publicRoot, 'docs');
const assetsOut = path.join(publicRoot, 'assets');
const metadataPath = path.join(project, 'app/seer-docs.json');
const publicUrl = '/evidence/seer-docs';

const TYPE_ORDER = ['结果分析', '进展记录', '方案与准备', '复盘与索引', '实现计划', '设计规格', '其他分析'];

function walk(directory, out = []) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, out);
    else if (entry.isFile() && /\.md$/i.test(entry.name)) out.push(absolute);
  }
  return out;
}

function isInside(file, root) {
  const relative = path.relative(root, file);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function resolveLocal(raw, sourceFile) {
  let value = String(raw || '').trim().replace(/^<|>$/g, '');
  try { value = decodeURIComponent(value); } catch {}
  value = value.split('#')[0].split('?')[0];
  if (!value || /^(?:https?:|data:|mailto:|\/\/|#)/i.test(value)) return '';
  if (/^[A-Za-z]:[\\/]/.test(value)) return path.resolve(value);
  if (value.startsWith('/')) return value;
  return path.resolve(path.dirname(sourceFile), value);
}

function assetName(absolute) {
  const hash = crypto.createHash('sha1').update(absolute).digest('hex').slice(0, 10);
  const extension = path.extname(absolute);
  const stem = path.basename(absolute, extension).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'asset';
  return `${hash}-${stem}${extension.toLowerCase()}`;
}

const copiedAssets = new Set();

function copyAsset(absolute) {
  const name = assetName(absolute);
  if (!copiedAssets.has(name)) {
    fs.mkdirSync(assetsOut, {recursive: true});
    fs.copyFileSync(absolute, path.join(assetsOut, name));
    copiedAssets.add(name);
  }
  return name;
}

function rewriteMarkdown(text, sourceFile) {
  let inFence = false;
  let images = 0;
  const lines = text.split(/\r?\n/).map(line => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;

    let next = line.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, raw) => {
      if (/^(?:https?:|data:|\/\/)/i.test(raw.trim())) return match;
      const resolved = resolveLocal(raw, sourceFile);
      if (!resolved || !isInside(resolved, sourceRoot) || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) return match;
      images += 1;
      return `![${alt}](${publicUrl}/assets/${copyAsset(resolved)})`;
    });

    next = next.replace(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g, (match, label, raw) => {
      if (/^(?:https?:|mailto:|\/\/|#)/i.test(raw.trim())) return match;
      const resolved = resolveLocal(raw, sourceFile);
      if (resolved && fs.existsSync(resolved) && /\.md$/i.test(resolved) && isInside(resolved, sourceRoot)) {
        const target = path.relative(sourceRoot, resolved).split(path.sep).join('/');
        return `[${label}](#seer-doc=${encodeURIComponent(target)})`;
      }
      return `[${label}](#seer-file=${encodeURIComponent(raw.trim())})`;
    });

    return next;
  });
  return {text: lines.join('\n'), images};
}

function classify(relative) {
  const base = path.basename(relative, '.md').toLowerCase();
  if (relative.startsWith('superpowers/plans/')) return '实现计划';
  if (relative.startsWith('superpowers/specs/')) return '设计规格';
  if (/progress/.test(base)) return '进展记录';
  if (/(proposal|plan|preparation|implementation|readiness|bootstrap|design|spec|status|方案)/.test(base) && !/(results|diagnostic)/.test(base)) return '方案与准备';
  if (/(results|diagnostic|evaluation|comparison|ablation|filterability|attribution|baseline|modulation|unified|audit|oracle|replay|pilot)/.test(base)) return '结果分析';
  if (/(retrospective|review|inventory|index|coverage)/.test(base)) return '复盘与索引';
  return '其他分析';
}

function plainText(value) {
  return value
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstSummary(text) {
  let inFence = false;
  const paragraph = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      if (paragraph.length) break;
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const trimmed = line.trim();
    if (!trimmed) {
      if (paragraph.length) break;
      continue;
    }
    if (/^(?:#|\||!\[|>|```|~~~|<!--|%%|\[\^)/.test(trimmed)) {
      if (paragraph.length) break;
      continue;
    }
    if (/^(?:[-*+]|\d+[.)])\s/.test(trimmed)) {
      if (paragraph.length) break;
      continue;
    }
    paragraph.push(trimmed);
  }
  const summary = plainText(paragraph.join(' '));
  return summary.length > 260 ? summary.slice(0, 257).trimEnd() + '…' : summary;
}

function docTitle(text, fallback) {
  const heading = /^#\s+(.+)$/m.exec(text);
  return heading ? heading[1].replace(/\s+#+$/, '').trim() : fallback;
}

function docDate(relative, absolute) {
  const match = /(\d{4}-\d{2}-\d{2})/.exec(path.basename(relative));
  if (match) return match[1];
  return new Date(fs.statSync(absolute).mtimeMs).toLocaleDateString('en-CA', {timeZone: 'Asia/Shanghai'});
}

function headings(text) {
  return [...text.matchAll(/^##\s+(.+)$/gm)].map(match => match[1].replace(/\s+#+$/, '').trim()).filter(Boolean).slice(0, 40);
}

if (!fs.existsSync(sourceRoot)) {
  console.error(`SEER docs not found: ${sourceRoot}`);
  process.exit(1);
}

const files = walk(sourceRoot).sort();
if (!files.length) {
  console.error(`SEER docs are empty: ${sourceRoot}`);
  process.exit(1);
}
for (const absolute of files) fs.accessSync(absolute, fs.constants.R_OK);

fs.rmSync(publicRoot, {recursive: true, force: true});
fs.mkdirSync(docsOut, {recursive: true});
fs.mkdirSync(assetsOut, {recursive: true});

const docs = files.map(absolute => {
  const relative = path.relative(sourceRoot, absolute).split(path.sep).join('/');
  const original = fs.readFileSync(absolute, 'utf8');
  const rewritten = rewriteMarkdown(original, absolute);
  const output = path.join(docsOut, relative);
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, rewritten.text, 'utf8');

  const fallback = path.basename(relative, '.md');
  return {
    id: relative.replace(/\.md$/i, ''),
    file: `docs/${relative}`,
    sourcePath: path.resolve(absolute),
    title: docTitle(original, fallback),
    date: docDate(relative, absolute),
    type: classify(relative),
    summary: firstSummary(original) || headings(original).slice(0, 3).join(' · ') || fallback,
    headings: headings(original),
    chars: original.length,
    images: rewritten.images,
    sha256: crypto.createHash('sha256').update(original).digest('hex'),
  };
});

docs.sort((a, b) => {
  const type = TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
  return type || b.date.localeCompare(a.date) || a.title.localeCompare(b.title, 'zh-CN');
});

fs.writeFileSync(metadataPath, JSON.stringify(docs, null, 1) + '\n', 'utf8');
fs.writeFileSync(path.join(publicRoot, 'manifest.json'), JSON.stringify(docs, null, 1) + '\n', 'utf8');
console.log(`Synced ${docs.length} documents and ${copiedAssets.size} images.`);
console.log(`Metadata: ${path.relative(project, metadataPath)}`);
console.log(`Static docs: ${path.relative(project, publicRoot)}`);
