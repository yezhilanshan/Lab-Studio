'use client';

import {useEffect, useEffectEvent, useLayoutEffect, useRef, useState} from 'react';
import {ArrowLeft, ArrowUpRight, BookOpen, CodeXml, FilePenLine, NotebookText, Sparkles} from 'lucide-react';
import type {EditorView} from '@codemirror/view';
import type {RecordItem} from './data';
import {colorOf} from './atlas-visuals';
import {paperMarkdown} from '../lib/paper-markdown';
import type {PaperFormat} from '../lib/paper-format';
import {currentPaperFormats, PaperEditor, runPaperFormat} from './paper-editor';
import {togglePaperTask} from './paper-live-preview';
import {PaperFormatToolbar, formatShortcut} from './paper-format-toolbar';
import {applyPaperCellFormat} from './paper-table-widget';
import {PaperMarkdownPreview} from './paper-markdown-preview';
import {SummaryPanel, type SummaryState} from './paper-summary';
import {openPaperInObsidian} from '../lib/obsidian';
import './paper-notebook.css';
import './paper-document.css';

type Props = {
  paper: RecordItem;
  papers: RecordItem[];
  related?: RecordItem;
  initialAnchor: string;
  backLabel: string;
  onRelated: (paper: RecordItem, anchor?: string) => void;
  onSave: (markdown: string) => Promise<boolean>;
  summary: SummaryState | null;
  applying: boolean;
  onSummarize: () => void;
  onApplySummary: (keys: string[], draft: string | null) => Promise<boolean>;
  onDismissSummary: () => void;
  onClose: () => void;
};

function readDraft(key: string) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function rememberDraft(key: string, source: string | null) {
  try { if (source === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, source); } catch {}
}

const normalized = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase();

function scrollToAnchor(root: HTMLElement | null, anchor: string) {
  const part = anchor.split('#').at(-1) || '';
  const slug = (text: string) => normalized(text).replace(/\s+/g, '-');
  const destination = [...root?.querySelectorAll<HTMLElement>('[data-notebook-heading], [data-notebook-block]') || []].find(element =>
    part.startsWith('^') ? element.dataset.notebookBlock === part.slice(1) : element.dataset.notebookHeading && slug(element.dataset.notebookHeading) === slug(part));
  destination?.scrollIntoView({block: 'center'});
  if (destination) { destination.tabIndex = -1; destination.focus({preventScroll: true}); }
  return Boolean(destination);
}

function lineElement(root: HTMLElement | null, line: number) {
  let nearest: HTMLElement | undefined;
  for (const element of root?.querySelectorAll<HTMLElement>('[data-source-line]') || []) {
    if (Number(element.dataset.sourceLine) > line) break;
    if (element.getClientRects().length) nearest = element;
  }
  return nearest;
}

export function PaperNotebook({paper, papers, related, initialAnchor, backLabel, onRelated, onSave, summary, applying, onSummarize, onApplySummary, onDismissSummary, onClose}: Props) {
  const editor = useRef<EditorView>(null);
  const formatCell = useRef<HTMLInputElement | null>(null);
  const controls = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const switchButton = useRef<HTMLButtonElement>(null);
  const pendingLine = useRef<{line: number; select: boolean} | null>(null);
  const readScrollAfterEdit = useRef<number | null>(null);
  const saving = useRef(false), autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftKey = 'seer.paper-draft.v1.' + paper.id;
  const [mode, setMode] = useState<'read' | 'edit'>('read');
  const [sourceMode, setSourceMode] = useState(false);
  const [draft, setDraft] = useState<string | null>(() => readDraft(draftKey));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [notice, setNotice] = useState('');
  const saved = paperMarkdown(paper);
  const source = draft ?? saved;
  const editing = mode === 'edit';
  const busy = status === 'saving';
  const latestSource = useRef(source), savedPaper = useRef(saved), saveAction = useRef(onSave);

  useEffect(() => {
    savedPaper.current = saved;
    saveAction.current = onSave;
  }, [saved, onSave]);
  useEffect(() => () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); }, []);

  useLayoutEffect(() => {
    window.scrollTo({top: 0, behavior: 'instant'});
    switchButton.current?.focus({preventScroll: true});
    if (!initialAnchor) return;
    const frame = requestAnimationFrame(() => {
      if (!scrollToAnchor(preview.current, initialAnchor)) setNotice('这篇文献中没有找到链接指向的位置。');
    });
    return () => cancelAnimationFrame(frame);
  }, [initialAnchor]);

  useLayoutEffect(() => {
    const position = pendingLine.current;
    if (!position) return;
    pendingLine.current = null;
    const frame = requestAnimationFrame(() => {
      if (!editing) switchButton.current?.focus({preventScroll: true});
      const view = editor.current;
      if (editing && view) {
        const line = view.state.doc.line(Math.min(position.line, view.state.doc.lines));
        if (position.select) view.dispatch({selection: {anchor: line.from}});
        view.focus();
        const top = view.documentTop + view.lineBlockAt(line.from).top;
        if (window.scrollY || position.line > 1) window.scrollBy({top: top - (controls.current?.getBoundingClientRect().bottom || 0) - 18, behavior: 'instant'});
      } else {
        if (position.line > 1 || window.scrollY) {
          const block = lineElement(preview.current, position.line);
          if (block) window.scrollBy({top: block.getBoundingClientRect().top - (controls.current?.getBoundingClientRect().bottom || 0) - 18, behavior: 'instant'});
        }
        readScrollAfterEdit.current = window.scrollY;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  const notebookHotkey = useEffectEvent((event: KeyboardEvent) => {
    if (event.isComposing || (!event.ctrlKey && !event.metaKey) || event.altKey || event.shiftKey || document.querySelector('dialog[open]')) return;
    const key = event.key.toLowerCase();
    if (key !== 'e' && key !== 's') return;
    event.preventDefault();
    if (key === 'e' && !event.repeat) switchMode(editing ? 'read' : 'edit');
    if (key === 's') void save();
  });
  useEffect(() => {
    function handleKey(event: KeyboardEvent) { notebookHotkey(event); }
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, []);

  function scheduleAutoSave(next: string) {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = null;
    if (next === savedPaper.current) return;
    autoSaveTimer.current = setTimeout(() => {
      autoSaveTimer.current = null;
      void save(next);
    }, 900);
  }

  function update(next: string) {
    latestSource.current = next;
    setDraft(next);
    rememberDraft(draftKey, next === saved ? null : next);
    setStatus('idle');
    scheduleAutoSave(next);
  }

  function switchMode(next: 'read' | 'edit', explicitLine?: number) {
    if (mode === next) return;
    const view = editor.current;
    const boundary = (controls.current?.getBoundingClientRect().bottom || 0) + 24;
    let line = explicitLine || 1;
    if (!explicitLine && window.scrollY) {
      if (editing && view) line = view.state.doc.lineAt(view.lineBlockAtHeight(boundary - view.documentTop).from).number;
      else for (const block of preview.current?.querySelectorAll<HTMLElement>('[data-source-line]') || []) {
        if (!block.getClientRects().length) continue;
        if (block.getBoundingClientRect().top > boundary) break;
        line = Number(block.dataset.sourceLine);
      }
    }
    const movedInRead = readScrollAfterEdit.current === null || Math.abs(window.scrollY - readScrollAfterEdit.current) > 10;
    pendingLine.current = {line, select: Boolean(explicitLine || (next === 'edit' && movedInRead))};
    setMode(next);
  }

  async function leave(action: () => void) {
    if (saving.current) return;
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    }
    const pending = latestSource.current;
    if (pending === savedPaper.current) rememberDraft(draftKey, null);
    else if (!await save(pending)) return;
    action();
  }

  async function save(text = latestSource.current) {
    if (text === savedPaper.current || saving.current) return false;
    saving.current = true;
    setStatus('saving');
    try {
      if (!await saveAction.current(text)) throw Error('Save failed');
      const latest = latestSource.current;
      if (latest === text) {
        rememberDraft(draftKey, null);
        setDraft(null);
        setStatus('saved');
        setNotice(current => current === '自动保存失败，修改仍保存在本机草稿中。' ? '' : current);
      } else {
        rememberDraft(draftKey, latest);
        setStatus('idle');
        scheduleAutoSave(latest);
      }
      return true;
    } catch {
      setStatus('failed');
      setNotice('自动保存失败，修改仍保存在本机草稿中。');
      return false;
    } finally {
      saving.current = false;
    }
  }

  // Hand the pending draft to the writer so it is folded in rather than overwritten,
  // then drop it locally — otherwise the next autosave would restore the stale text.
  async function acceptSummary(keys: string[]) {
    if (await onApplySummary(keys, draft)) {
      rememberDraft(draftKey, null);
      setDraft(null);
    }
  }

  function apply(format: PaperFormat) {
    const view = editor.current;
    if (!view) return;
    const cell = formatCell.current;
    if (cell && view.contentDOM.contains(cell)) {
      if (applyPaperCellFormat(cell, format)) cell.focus();
      return;
    }
    runPaperFormat(view, format);
    view.focus();
  }

  function follow(target: string) {
    setNotice('');
    const [path, ...parts] = target.split('#');
    const anchor = parts.join('#');
    const name = normalized(path.replace(/\.md$/i, ''));
    const matchingId = name && papers.find(item => normalized(item.id) === name);
    const candidates = name ? papers.filter(item => normalized(item.title) === name) : [paper];
    const next = matchingId || candidates[0];
    if (candidates.length > 1 && !matchingId) {
      setNotice(`「${path}」对应多篇文献，请使用文献 ID。`);
    } else if (!next) setNotice(`文献库中没有找到「${path}」。`);
    else if (next.id !== paper.id) leave(() => onRelated(next, anchor));
    else if (anchor && !scrollToAnchor(preview.current, anchor)) setNotice('这篇文献中没有找到链接指向的位置。');
  }

  function toggleTask(line: number) {
    const view = editor.current;
    return Boolean(view && togglePaperTask(view, line));
  }

  async function openObsidian() {
    const result = await openPaperInObsidian(paper, {readingMarkdown: latestSource.current, relatedTitle: related?.title});
    setNotice(result.message);
  }

  const url = String(paper.url || '');
  const theme = colorOf(paper.theme);

  return <section className="paper-notebook" aria-label="文献详情" data-mode={mode}>
    <div className="notebook-controls" ref={controls}>
      <div className="notebook-topline">
        <button className="notebook-back" type="button" aria-label={'返回' + backLabel} onClick={() => leave(onClose)} disabled={busy}><ArrowLeft size={16}/> 返回{backLabel}</button>
        <div className="notebook-actions">
          <button type="button" className="notebook-view" title="直接用已配置的服务商生成五维总结" onClick={onSummarize} disabled={busy || summary?.status === 'loading'}>
            <Sparkles size={16}/> {summary?.status === 'loading' ? '总结中…' : 'AI 总结'}
          </button>
          <button type="button" className="notebook-view" title="生成文献详情并在 Obsidian 中打开" onClick={openObsidian} disabled={busy}>
            <NotebookText size={16}/> Obsidian
          </button>
          <button ref={switchButton} type="button" className="notebook-view" title={formatShortcut('Mod-e')} onClick={() => switchMode(editing ? 'read' : 'edit')}>
            {editing ? <BookOpen size={16}/> : <FilePenLine size={16}/>} {editing ? '阅读' : '编辑'}
          </button>
        </div>
      </div>
      {editing && <div className="notebook-toolline">
        <PaperFormatToolbar busy={busy} onFormat={apply}
          onTarget={target => { formatCell.current = target instanceof HTMLInputElement && target.matches('[data-table-cell]') && editor.current?.contentDOM.contains(target) ? target : null; }}
          getContext={() => {
            const view = editor.current;
            const inCell = Boolean(formatCell.current && view?.contentDOM.contains(formatCell.current));
            return {inCell, active: view && !inCell ? currentPaperFormats(view) : new Set<PaperFormat>()};
          }}/>
        <button className="notebook-source-mode" type="button" title="显示完整 Markdown 源码" aria-pressed={sourceMode} onClick={() => { setSourceMode(!sourceMode); editor.current?.focus(); }}><CodeXml size={16}/> 源码</button>
      </div>}
      {notice && <div className="notebook-notice" role="status">{notice}<button type="button" aria-label="关闭提示" onClick={() => setNotice('')}>×</button></div>}
    </div>

    <article className="notebook-document">
      <header className="notebook-paper-header">
        <div className="paper-meta"><i style={{background: theme}}/>{paper.year || '年份待补充'}<span>·</span>{paper.venue || paper.type || '论文'}<span className="theme-tag" style={{color: theme}}>{paper.theme || '待归类'}</span></div>
        <h1>{paper.title}</h1>
        {paper.authors && <p className="paper-authors">{paper.authors}</p>}
        <div className="notebook-sources">
          <a href={'https://scholar.google.com/scholar?q=' + encodeURIComponent(paper.title)} target="_blank" rel="noreferrer">Google Scholar <ArrowUpRight size={13}/></a>
          {/^https?:\/\//i.test(url) && <a href={url} target="_blank" rel="noreferrer">论文来源 <ArrowUpRight size={13}/></a>}
          {paper.documentId && <a href={'/api/documents/' + encodeURIComponent(String(paper.documentId))}>下载原文</a>}
        </div>
      </header>

      {summary && <SummaryPanel key={summary.status + summary.model} state={summary} applying={applying} onApply={acceptSummary} onDismiss={onDismissSummary}/>}

      <div className="notebook-body">
        <div className="notebook-editor-pane" hidden={!editing}>
          <PaperEditor initialSource={source} busy={false} sourceMode={sourceMode} viewRef={editor} onChange={update}/>
        </div>
        {!editing && <PaperMarkdownPreview source={source} rootRef={preview} onLink={follow} onTask={toggleTask} onEditLine={line => switchMode('edit', line)}/>}
      </div>

      {!editing && <>
        {(paper.summaryBasis || paper.yearEvidence || paper.abstract || paper.limitationEvidence) && <details className="paper-evidence notebook-evidence">
          <summary>原文摘录与来源说明</summary>
          {paper.summaryBasis && <p>{paper.summaryBasis}</p>}
          {paper.yearEvidence && <div><strong>{paper.year || '年份待核验'} · {paper.yearBasis}</strong><p>{paper.yearEvidence}</p></div>}
          {paper.abstract && <div><strong>原文摘要 / 首页摘录</strong><p>{paper.abstract}</p></div>}
          {paper.limitationEvidence && <div><strong>局限性原文 · 第 {paper.limitationPage} 页</strong><p>{paper.limitationEvidence}</p></div>}
        </details>}
        {paper.relatedTo && <section className="reader-related">
          <h3>{paper.relation || '关联工作'}</h3>
          {paper.relationNote && <p className="relation-note">{paper.relationNote}</p>}
          {related ? <button type="button" onClick={() => leave(() => onRelated(related))}>{related.title} <ArrowUpRight size={13}/></button> : <p>关联卡片已移除</p>}
        </section>}
      </>}
    </article>
  </section>;
}
