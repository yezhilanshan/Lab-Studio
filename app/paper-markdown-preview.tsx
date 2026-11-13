'use client';

import {useMemo, type RefObject} from 'react';
import {renderPaperMarkdown} from '../lib/paper-markdown-render';
import 'katex/dist/katex.min.css';

type Props = {
  source: string;
  rootRef: RefObject<HTMLDivElement | null>;
  onLink: (target: string) => void;
  onTask: (line: number) => boolean;
  onEditLine?: (line: number) => void;
};

export function PaperMarkdownPreview({source, rootRef, onLink, onTask, onEditLine}: Props) {
  const html = useMemo(() => {
    try { return renderPaperMarkdown(source); } catch { return null; }
  }, [source]);

  if (!source.trim()) return <p className="paper-notebook-empty">这份笔记还没有内容。</p>;
  if (html === null) return <div className="paper-markdown"><p role="status">预览未能载入，以下为 Markdown 源文。</p><pre>{source}</pre></div>;
  return <div className="paper-markdown" aria-label="Markdown 阅读区" ref={rootRef}
    onClick={event => {
      if (!(event.target instanceof Element)) return;
      const task = event.target.closest<HTMLInputElement>('[data-notebook-task]');
      if (task) {
        if (!onTask(Number(task.dataset.notebookTask))) event.preventDefault();
        return;
      }
      const link = event.target.closest<HTMLAnchorElement>('a');
      if (link?.dataset.notebookLink) {
        event.preventDefault();
        onLink(link.dataset.notebookLink);
      } else if (link?.closest('.footnote-ref, .footnote-backref')) {
        event.preventDefault();
        const id = link.getAttribute('href')?.slice(1);
        const destination = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[id]') || []).find(element => element.id === id);
        destination?.scrollIntoView({block: 'center'});
        if (destination) { destination.tabIndex = -1; destination.focus({preventScroll: true}); }
      }
    }}
    onDoubleClick={event => {
      if (!onEditLine || !(event.target instanceof Element) || event.target.closest('a, input, summary')) return;
      const line = event.target.closest<HTMLElement>('[data-source-line]')?.dataset.sourceLine;
      if (line) onEditLine(Number(line));
    }}
    dangerouslySetInnerHTML={{__html: html}}/>;
}
