'use client';

import {useState} from 'react';
import {X} from 'lucide-react';
import {PAPER_DIMENSIONS as dimensions} from '../lib/paper-markdown';
import './paper-summary.css';

export type SummaryState = {
  id: string;
  status: 'loading' | 'done' | 'error';
  draft: Record<string, string> | null;
  before: Record<string, string>;
  error: string;
  model: string;
};

function toLines(text: unknown) {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, '').trim())
    .filter(Boolean);
}

function sameContent(before: unknown, after: unknown) {
  return toLines(before).join('\n') === toLines(after).join('\n');
}

function Diff({before, after}: {before: string; after: string}) {
  const oldLines = toLines(before);
  const newLines = toLines(after);
  const removed = oldLines.filter(line => !newLines.includes(line));
  const added = new Set(newLines.filter(line => !oldLines.includes(line)));
  if (!newLines.length) return <p className="ai-summary-empty">这次没有给出该模块的内容。</p>;
  return <div className="ai-summary-diff">
    {removed.length > 0 && <ul className="ai-diff-removed">
      {removed.map((line, index) => <li key={'old' + index}>{line}</li>)}
    </ul>}
    <ul className="ai-diff-kept">
      {newLines.map((line, index) => <li key={'new' + index} data-new={added.has(line) || undefined}>{line}</li>)}
    </ul>
  </div>;
}

export function SummaryPanel({state, applying = false, onApply, onDismiss}: {
  state: SummaryState;
  applying?: boolean;
  onApply: (keys: string[]) => void;
  onDismiss: () => void;
}) {
  const [chosen, setChosen] = useState<string[]>(() =>
    dimensions.filter(([key]) => !sameContent(state.before[key], state.draft?.[key])).map(([key]) => key));
  const allChosen = chosen.length === dimensions.length;

  function toggle(key: string) {
    setChosen(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key]);
  }

  return <section className="ai-summary" aria-live="polite" aria-busy={state.status === 'loading'}>
    <header className="ai-summary-head">
      <strong>AI 五维总结</strong>
      {state.model && <span>{state.model}</span>}
      <button type="button" aria-label="关闭总结" onClick={onDismiss}><X size={14}/></button>
    </header>
    {state.status === 'loading' && <p className="ai-summary-note">正在读取正文并调用服务商，可能需要几十秒…</p>}
    {state.status === 'error' && <p className="ai-summary-error" role="alert">{state.error}</p>}
    {state.status === 'done' && state.draft && <>
      <div className="ai-summary-body">
      <p className="ai-summary-legend">
        删除线是原有内容，<b>绿色</b>是新增内容；未勾选的模块不会写入。
      </p>
      {dimensions.map(([key, title]) => {
        const before = state.before[key] || '';
        const after = state.draft?.[key] || '';
        const unchanged = sameContent(before, after);
        const flag = unchanged ? '无变化' : toLines(before).length ? '有变更' : '新增';
        return <div className="ai-summary-dim" key={key} data-unchanged={unchanged || undefined}>
          <label className="ai-summary-toggle">
            <input type="checkbox" checked={chosen.includes(key)} disabled={applying} onChange={() => toggle(key)}/>
            <strong>{title}</strong>
            <span className="ai-summary-flag" data-kind={flag}>{flag}</span>
          </label>
          <Diff before={before} after={after}/>
        </div>;
      })}
      </div>
      <div className="ai-summary-foot" role="group" aria-label="接受总结模块">
        <button type="button" className="secondary" disabled={applying || !chosen.length} onClick={() => onApply(chosen)}>
          {applying ? '写入中…' : chosen.length ? `接受选中 ${chosen.length} 项` : '请先勾选模块'}
        </button>
        <button type="button" className="ai-summary-bulk" onClick={() => setChosen(allChosen ? [] : dimensions.map(([key]) => key))}>
          {allChosen ? '清空' : '全选'}
        </button>
        <small>只写入已勾选的模块，其余保持原样。</small>
      </div>
    </>}
  </section>;
}
