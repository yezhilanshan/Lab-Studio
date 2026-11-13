'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowUpRight,ChevronRight,FileText,GitBranch,NotebookText,Search} from 'lucide-react';
import research from './research-data.json';
import {followUps,recordDates,undatedPositions} from './research-chronology';
import seerDocs from './seer-docs.json';
import {maskPath} from '../lib/display-path';
import {openMarkdownInObsidian} from '../lib/obsidian';
import {PaperMarkdownPreview} from './paper-markdown-preview';
import './paper-document.css';

type NodeItem=(typeof research.groups)[number]['items'][number];
type SeerDoc={
  id: string; file: string; sourcePath: string; title: string; date: string; type: string;
  summary: string; headings: string[]; chars: number; images: number; sha256: string;
};

const TYPE_ORDER=['结果分析','进展记录','方案与准备','复盘与索引','实现计划','设计规格','其他分析'];
const sourceById=new Map(research.sources.map(source=>[source.id,source]));
const docsByKey=new Map<string,SeerDoc>();
for(const doc of seerDocs as SeerDoc[]){
  const base=doc.id.split('/').pop()!;
  if(!docsByKey.has(base)||!doc.id.includes('/'))docsByKey.set(base,doc);
  docsByKey.set(doc.id,doc);
  docsByKey.set(doc.file,doc);
  docsByKey.set(doc.file.replace(/^docs\//,''),doc);
  docsByKey.set(doc.file.replace(/^docs\//,'').replace(/\.md$/i,''),doc);
}
const docTextCache=new Map<string,string>();
const STATES=[...new Set(research.groups.flatMap(group=>group.items.map(node=>node.status)))];

function sourceFor(id:string){return sourceById.get(id)}
function docUrl(doc:SeerDoc){return '/evidence/seer-docs/'+doc.file.split('/').map(encodeURIComponent).join('/')}
function docForSource(source:NonNullable<ReturnType<typeof sourceFor>>){
  const path=source.path.replaceAll('\\','/');
  if(!path.endsWith('.md'))return;
  const relative=path.split('/docs/').pop();
  const basename=path.split('/').pop()!.slice(0,-3);
  return (relative&&docsByKey.get(relative))||docsByKey.get(basename)||seerDocs.find(doc=>doc.title===source.title);
}

function dateLabel(start:string,end:string){
  return end&&end!==start?`${start} 至 ${end}`:start;
}

function timelineEntry(node:NodeItem,group:{title:string;conclusion:string}){
  const sources=node.sourceIds.map(sourceFor).filter(source=>source!==undefined);
  const docs=new Map<string,SeerDoc>();
  const otherSources=sources.filter(source=>{
    const doc=docForSource(source);
    if(!doc)return true;
    docs.set(doc.id,doc);
    return false;
  });
  const sourceDates=sources.flatMap(source=>source.path.match(/\d{4}-\d{2}-\d{2}/g)||[]).sort();
  const [start='',end='']=recordDates[node.id]?.split('/')||[sourceDates[0],sourceDates.at(-1)];
  const orderDay=start||undatedPositions[node.id]||'';
  return {node,group:group.title,conclusion:group.conclusion,docs:[...docs.values()],otherSources,orderDay,date:dateLabel(start,end)};
}

const TIMELINE=research.groups.flatMap(group=>group.items.map(node=>timelineEntry(node,group)))
  .sort((a,b)=>a.orderDay.localeCompare(b.orderDay))
  .map((entry,index)=>({...entry,ordinal:index+1}));
const ENTRY_BY_ID=new Map(TIMELINE.map(entry=>[entry.node.id,entry]));
// Reverse of followUps: which records name this one as their next step. Only
// authored links appear here, so a missing seam means "no recorded connection".
const PRECEDED_BY=new Map<string,string[]>();
for(const [from,tos] of Object.entries(followUps))
  for(const to of tos||[])
    PRECEDED_BY.set(to,[...(PRECEDED_BY.get(to)||[]),from]);
const TOTAL_STEPS=TIMELINE.length;
const FOLLOW_COUNT=Object.values(followUps).reduce((total,list)=>total+(list?.length||0),0);
const DATED=TIMELINE.filter(entry=>entry.orderDay);
const DATE_RANGE=DATED.length?DATED[0].orderDay+' → '+DATED[DATED.length-1].orderDay:'';
const attachedDocs=new Set(TIMELINE.flatMap(entry=>entry.docs.map(doc=>doc.id)));
const EXTRA_DOCS=seerDocs.filter(doc=>!attachedDocs.has(doc.id));
const DOC_TYPES=TYPE_ORDER.filter(type=>EXTRA_DOCS.some(doc=>doc.type===type));

function matchesDoc(doc:SeerDoc,query:string){
  return [doc.title,doc.summary,doc.sourcePath,...doc.headings].some(text=>text.toLowerCase().includes(query));
}
async function fetchDocText(doc:SeerDoc){
  const cached=docTextCache.get(doc.file);if(cached)return cached;
  const response=await fetch(docUrl(doc));
  if(!response.ok)throw Error(`读取文档失败（${response.status}）`);
  const text=await response.text();docTextCache.set(doc.file,text);return text;
}
function markdownForObsidian(source:string){
  const origin=window.location.origin;
  return source
    .replace(/(!\[[^\]]*\]\()\/evidence\//g,`$1${origin}/evidence/`)
    .replace(/\[([^\]]+)\]\(#seer-doc=([^)]+)\)/g,(_,label: string,target: string)=>`${label}（原文档：\`${decodeURIComponent(target)}\`）`)
    .replace(/\[([^\]]+)\]\(#seer-file=([^)]+)\)/g,(_,label: string,target: string)=>`${label}（本地文件：\`${decodeURIComponent(target)}\`）`);
}

function useDocText(doc:SeerDoc|null){
  const [state,setState]=useState<{key:string;text:string;error:string}|null>(null);
  const key=doc?.file||'';
  useEffect(()=>{
    if(!doc||docTextCache.has(doc.file))return;
    let cancelled=false;
    fetchDocText(doc)
      .then(text=>{if(!cancelled)setState({key:doc.file,text,error:''})})
      .catch(error=>{if(!cancelled)setState({key:doc.file,text:'',error:(error as Error).message})});
    return()=>{cancelled=true};
  },[doc]);
  if(!doc)return null;
  const cached=docTextCache.get(doc.file);
  if(cached)return {text:cached,error:''};
  return state?.key===key?{text:state.text,error:state.error}:null;
}

function DocMarkdown({doc,onOpenDoc}:{doc:SeerDoc;onOpenDoc:(doc:SeerDoc)=>void}){
  const state=useDocText(doc),rootRef=useRef<HTMLDivElement>(null),[notice,setNotice]=useState('');
  function follow(target:string){
    setNotice('');
    if(target.startsWith('#seer-doc=')){
      const raw=target.slice('#seer-doc='.length);let key=raw;
      try{key=decodeURIComponent(raw)}catch{}
      const next=docsByKey.get(key)||docsByKey.get(key.replace(/\.md$/i,''))||(seerDocs as SeerDoc[]).find(item=>item.title===key);
      if(next)onOpenDoc(next);else setNotice(`没有找到对应文档：${key}`);
    }else if(target.startsWith('#seer-file=')){
      const raw=target.slice('#seer-file='.length);let file=raw;
      try{file=decodeURIComponent(raw)}catch{}
      setNotice(`原始证据文件未打包到站点：${file}`);
    }else if(target){
      const next=(seerDocs as SeerDoc[]).find(item=>item.title===target||item.id===target);
      if(next)onOpenDoc(next);else setNotice(`未识别的站内链接：${target}`);
    }
  }
  if(!state)return <p className="doc-loading" role="status">正在读取完整分析…</p>;
  if(state.error)return <p className="studio-message" role="status">读取失败：{state.error}</p>;
  return <div className="seer-doc-markdown">
    {notice&&<p className="studio-message" role="status">{notice}</p>}
    <PaperMarkdownPreview source={state.text} rootRef={rootRef} onLink={follow} onTask={()=>false}/>
  </div>;
}

function DocViewer({doc,onOpenDoc,onObsidian,notice}:{doc:SeerDoc;onOpenDoc:(doc:SeerDoc)=>void;onObsidian:(doc:SeerDoc)=>void;notice:string}){
  return <div className="seer-doc-viewer">
    <div className="seer-doc-viewer-bar">
      <div className="seer-doc-meta">{doc.date} · {doc.type} · {doc.chars.toLocaleString('zh-CN')} 字符{doc.images?` · ${doc.images} 图`:''}</div>
      <button type="button" className="secondary" onClick={()=>onObsidian(doc)}><NotebookText size={15}/> 在 Obsidian 中打开</button>
    </div>
    <code className="seer-doc-path">{maskPath(doc.sourcePath)}</code>
    {notice&&<p className="studio-message" role="status">{notice}</p>}
    <DocMarkdown doc={doc} onOpenDoc={onOpenDoc}/>
  </div>;
}

function DocDetails({doc,onOpenDoc,onObsidian}:{doc:SeerDoc;onOpenDoc:(doc:SeerDoc)=>void;onObsidian:(doc:SeerDoc)=>void}){
  const [open,setOpen]=useState(false);
  return <details className="node-doc-details" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>
      <span className="node-doc-date">{doc.date} · {doc.type}</span>
      <strong>{doc.title}</strong>
      <span className="node-doc-size">{doc.chars.toLocaleString('zh-CN')} 字符</span>
    </summary>
    <div className="node-doc-actions">
      <button type="button" className="secondary" onClick={()=>onOpenDoc(doc)}>独立阅读 <ArrowUpRight size={13}/></button>
      <button type="button" className="secondary" onClick={()=>onObsidian(doc)}><NotebookText size={13}/> Obsidian</button>
    </div>
    {open&&<DocMarkdown doc={doc} onOpenDoc={onOpenDoc}/>}
  </details>;
}

type TimelineEntry=typeof TIMELINE[number];

function scrollToRecord(nodeId:string,openEvidence=false){
  const target=document.getElementById('evidence-node-'+nodeId);
  const evidence=target?.querySelector<HTMLDetailsElement>('.experiment-evidence');
  if(openEvidence&&evidence)evidence.open=true;
  target?.focus({preventScroll:true});
  target?.scrollIntoView({block:'start'});
}

function monthLabel(month:string){
  return month?month.slice(0,4)+' 年 '+Number(month.slice(5))+' 月':'早期设计 · 日期未详';
}

function ExperimentRecord({entry,onOpenDoc,onObsidian,onLocate,onFollow,focused}:{
  entry:TimelineEntry;
  onOpenDoc:(doc:SeerDoc)=>void;
  onObsidian:(doc:SeerDoc)=>void;
  onLocate?:(nodeId:string)=>void;
  onFollow:(nodeId:string)=>void;
  focused:boolean;
}){
  const {node,group,conclusion,date,docs,otherSources,ordinal}=entry;
  const nextEntries=(followUps[node.id]||[]).map(id=>ENTRY_BY_ID.get(id)).filter(entry=>entry!==undefined);
  const previousEntries=(PRECEDED_BY.get(node.id)||[]).map(id=>ENTRY_BY_ID.get(id)).filter(entry=>entry!==undefined);
  const statusClass=node.status==='已实验'?'green':node.status.includes('未核实')?'amber':'blue';

  return <article className={'experiment-record'+(focused?' evidence-focused':'')} id={'evidence-node-'+node.id} data-group={group} tabIndex={-1}>
    <header className="experiment-header">
      <div className="experiment-meta">
        <span className="experiment-order">{String(ordinal).padStart(2,'0')}<i>/{TOTAL_STEPS}</i></span>
        <span className="experiment-date">{date||'日期未详'}</span>
        <span className="experiment-stage" title={conclusion||''}>{group}</span>
        <span className={'badge '+statusClass}>{node.status}</span>
        {onLocate&&<button type="button" className="node-locate experiment-locate" onClick={()=>onLocate(node.id)}>
          <GitBranch size={13}/> 在实验进度树中定位
        </button>}
      </div>
      <h4><span className="experiment-id">{node.id}</span>{' '}{node.title}</h4>
      {previousEntries.length>0&&<p className="experiment-preceded">承自
        {previousEntries.map(prev=><button type="button" key={prev.node.id} onClick={()=>onFollow(prev.node.id)}>{prev.node.id} · {prev.node.title}</button>)}的下一步
      </p>}
    </header>
    <dl className="experiment-steps">
      <div><dt>为什么做</dt><dd>{node.problem}</dd></div>
      <div><dt>怎么做</dt><dd>{node.attempt}</dd></div>
      <div><dt>结果与限制</dt><dd>{node.result}</dd></div>
      <div className="experiment-next">
        <dt>为什么转向下一步</dt>
        <dd>
          <p>{node.next}</p>
          {nextEntries.length>0
            ?<ul className="experiment-followups">
              {nextEntries.map(next=><li key={next.node.id}>
                <button type="button" onClick={()=>onFollow(next.node.id)}>
                  <span className="experiment-followup-label">后续记录</span>
                  <strong>{next.node.id} · {next.node.title}</strong>
                  <ChevronRight size={14}/>
                </button>
                <p className="experiment-followup-why"><span>它要解决的问题</span>{next.node.problem}</p>
              </li>)}
            </ul>
            :<p className="experiment-followup-none">记录没有指明紧接着的下一步；相邻条目按日期排列，不代表属于同一实验。</p>}
        </dd>
      </div>
    </dl>
    <footer className="experiment-footer">
      <details className="experiment-evidence">
        <summary><FileText size={15}/> 原文与证据 <span>{docs.length+otherSources.length} 份</span></summary>
        {docs.map(doc=><DocDetails key={doc.id} doc={doc} onOpenDoc={onOpenDoc} onObsidian={onObsidian}/>)}
        {otherSources.length>0&&<ul className="experiment-sources">
          {otherSources.map(source=><li key={source.id}>
            {'url' in source
              ?<a href={source.url} target="_blank" rel="noreferrer">{source.title} <ArrowUpRight size={13}/></a>
              :<strong>{source.title}</strong>}
            <code>{maskPath(source.path)}</code>
          </li>)}
        </ul>}
      </details>
    </footer>
  </article>;
}

export function ResearchExplorer({focusNodeId='',onLocate}:{focusNodeId?:string;onLocate?:(nodeId:string)=>void}={}){
  const [query,setQuery]=useState('');
  const [group,setGroup]=useState('');
  const [status,setStatus]=useState('');
  const [docType,setDocType]=useState('');
  const [followedNode,setFollowedNode]=useState('');
  const [activeStage,setActiveStage]=useState('');
  const [viewingDoc,setViewingDoc]=useState<SeerDoc|null>(null);
  const [notice,setNotice]=useState('');
  const dialog=useRef<HTMLDialogElement>(null);
  const extraDocs=useRef<HTMLDetailsElement>(null);
  const dialogOpen=Boolean(viewingDoc);
  const focused=followedNode||focusNodeId;
  const needle=query.trim().toLowerCase();

  const visibleMonths=useMemo(()=>{
    const months=new Map<string,TimelineEntry[]>();
    for(const entry of TIMELINE){
      const {node,docs,otherSources}=entry;
      if(group&&entry.group!==group)continue;
      if(status&&node.status!==status)continue;
      const text=[node.id,node.title,node.problem,node.attempt,node.result,node.next,entry.group,entry.date];
      if(needle&&!text.some(value=>value.toLowerCase().includes(needle))
        &&!docs.some(doc=>matchesDoc(doc,needle))
        &&!otherSources.some(source=>source.title.toLowerCase().includes(needle)))continue;
      const month=entry.orderDay.slice(0,7);
      const entries=months.get(month)||[];
      entries.push(entry);
      months.set(month,entries);
    }
    return [...months];
  },[group,status,needle]);

  // The right rail mirrors the stage of whichever record sits under the fixed header.
  useEffect(()=>{
    let frame=0;
    const pick=()=>{
      frame=0;
      let current='';
      for(const element of document.querySelectorAll<HTMLElement>('.experiment-record[data-group]')){
        if(element.getBoundingClientRect().top>150)break;
        current=element.dataset.group||'';
      }
      setActiveStage(previous=>previous===current?previous:current);
    };
    const onScroll=()=>{if(!frame)frame=requestAnimationFrame(pick)};
    frame=requestAnimationFrame(pick);
    window.addEventListener('scroll',onScroll,{passive:true});
    return()=>{window.removeEventListener('scroll',onScroll);if(frame)cancelAnimationFrame(frame)};
  },[visibleMonths]);

  const supplemental=useMemo(()=>EXTRA_DOCS.filter(doc=>
    (!docType||doc.type===docType)&&(!needle||matchesDoc(doc,needle))
  ),[docType,needle]);

  useEffect(()=>{
    const modal=dialog.current;
    if(dialogOpen&&!modal?.open)modal?.showModal();
  },[dialogOpen]);

  useEffect(()=>{
    if(!focused)return;
    const frame=requestAnimationFrame(()=>scrollToRecord(focused,focused===focusNodeId));
    return()=>cancelAnimationFrame(frame);
  },[focused,focusNodeId]);

  function clearFilters(){
    setQuery('');
    setGroup('');
    setStatus('');
  }

  function followRecord(nodeId:string){
    if(!document.getElementById('evidence-node-'+nodeId))clearFilters();
    setFollowedNode(nodeId);
    if(nodeId===focused)requestAnimationFrame(()=>scrollToRecord(nodeId));
  }

  function openSupplemental(){
    if(!extraDocs.current)return;
    extraDocs.current.open=true;
    extraDocs.current.querySelector('summary')?.focus({preventScroll:true});
    extraDocs.current.scrollIntoView({block:'start'});
  }

  function closeDialog(){
    dialog.current?.close();
    setViewingDoc(null);
    setNotice('');
  }

  function openDoc(doc:SeerDoc){
    setViewingDoc(doc);
    setNotice('');
  }

  async function sendDocToObsidian(doc:SeerDoc){
    setNotice('正在准备 Obsidian 笔记…');
    try{
      const text=await fetchDocText(doc);
      const result=await openMarkdownInObsidian({
        title:doc.title,
        content:markdownForObsidian(text),
        sourcePath:doc.sourcePath,
        sourceUrl:window.location.origin+'/#progress',
        kind:'seer-experiment-doc',
      },{fileBase:doc.date+' '+doc.title});
      setNotice(result.message);
    }catch(error){setNotice((error as Error).message)}
  }

  const currentStage=research.groups.find(stage=>stage.title===(group||activeStage));

  return <div className="explorer experiment-history">
    <div className="experiment-main">
    <div className="experiment-intro">
      <h2>实验演进与结果</h2>
      <p>把研究记录与完整分析合成一条线：按记录日期排序，每一步写明为什么做、怎么做、结果与限制、为什么转向下一步；原文与来源证据挂在同一步下面。「后续记录」只连接记录本身写明的下一步，相邻条目不代表同一实验。</p>
    </div>
    {visibleMonths.length>1&&<nav className="experiment-months" aria-label="跳转至记录月份">
      {visibleMonths.map(([month])=><button type="button" key={month} onClick={()=>{
        const section=document.getElementById('experiment-month-'+month);
        section?.focus({preventScroll:true});
        section?.scrollIntoView({block:'start'});
      }}>{monthLabel(month)}</button>)}
    </nav>}
    <div className="toolbar experiment-toolbar">
      <div className="input-search">
        <Search size={16}/>
        <input aria-label="搜索实验与原文" value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索实验、结论或文档标题…"/>
      </div>
      <select aria-label="筛选研究阶段" value={group} onChange={event=>setGroup(event.target.value)}>
        <option value="">全部阶段</option>
        {research.groups.map(group=><option key={group.title}>{group.title}</option>)}
      </select>
      <select aria-label="筛选证据类型" value={status} onChange={event=>setStatus(event.target.value)}>
        <option value="">全部证据</option>
        {STATES.map(state=><option key={state}>{state}</option>)}
      </select>
      <button type="button" className="experiment-extra-link" onClick={openSupplemental}>
        补充文档{needle?' · '+supplemental.length:''} <ChevronRight size={14}/>
      </button>
    </div>
    {focusNodeId&&!ENTRY_BY_ID.has(focusNodeId)&&<p className="studio-message" role="status">历史证据中没有节点 {focusNodeId}</p>}
    {notice&&!dialogOpen&&<p className="studio-message" role="status">{notice}</p>}
    {visibleMonths.map(([month,entries])=><section className="experiment-month" id={'experiment-month-'+month} tabIndex={-1} key={month}>
      <h3>{monthLabel(month)}<span>{entries.length} 步</span></h3>
      <ol className="experiment-timeline">
        {entries.map(entry=><li key={entry.node.id}>
          <ExperimentRecord entry={entry} onOpenDoc={openDoc} onObsidian={sendDocToObsidian}
            onLocate={onLocate} onFollow={followRecord} focused={entry.node.id===focused}/>
        </li>)}
      </ol>
    </section>)}
    {!visibleMonths.length&&<div className="empty">
      没有匹配的实验记录 <button type="button" onClick={clearFilters}>清除筛选</button>
    </div>}
    <details ref={extraDocs} className="experiment-extra-docs">
      <summary>补充文档 <span>{supplemental.length} 份</span></summary>
      <p>尚未挂接到具体实验的原文，可按标题、摘要或章节检索。</p>
      <div className="toolbar">
        <select aria-label="筛选补充文档类型" value={docType} onChange={event=>setDocType(event.target.value)}>
          <option value="">全部类型</option>
          {DOC_TYPES.map(type=><option key={type}>{type}</option>)}
        </select>
      </div>
      {supplemental.map(doc=><DocDetails key={doc.id} doc={doc} onOpenDoc={openDoc} onObsidian={sendDocToObsidian}/>)}
      {!supplemental.length&&<p className="empty">没有匹配的补充文档</p>}
    </details>
    </div>
    <aside className="experiment-rail" aria-label="研究路线索引">
      <section className="experiment-rail-block">
        <h3>研究路线</h3>
        <dl className="experiment-rail-stats">
          <div><dt>步数</dt><dd>{TOTAL_STEPS}</dd></div>
          <div><dt>阶段</dt><dd>{research.groups.length}</dd></div>
          <div><dt>后续连线</dt><dd>{FOLLOW_COUNT}</dd></div>
          <div><dt>记录跨度</dt><dd>{DATE_RANGE||'日期未详'}</dd></div>
        </dl>
        <button type="button" className="experiment-rail-link" onClick={openSupplemental}>
          补充文档 <span>{supplemental.length}</span> <ChevronRight size={13}/>
        </button>
      </section>
      <section className="experiment-rail-block">
        <h3>阶段{group&&<button type="button" onClick={()=>setGroup('')}>显示全部</button>}</h3>
        <ul className="experiment-rail-stages">
          {research.groups.map(stage=>{
            const active=group?group===stage.title:activeStage===stage.title;
            return <li key={stage.title}>
              <button type="button" data-active={active} onClick={()=>setGroup(group===stage.title?'':stage.title)}>
                <span>{stage.title}</span>
                <b>{stage.items.length}</b>
                <small>{stage.period}</small>
              </button>
            </li>;
          })}
        </ul>
        {currentStage
          ?<p className="experiment-rail-note"><strong>{currentStage.title}</strong>{currentStage.conclusion}</p>
          :<p className="experiment-rail-note">滚动时这里显示当前所在阶段的结论；点击任一阶段可只看该阶段的记录。</p>}
      </section>
      <section className="experiment-rail-block">
        <h3>读法</h3>
        <p className="experiment-rail-help">「已实验」有运行结果；「设计 / 实现」只有方案或实现记录，不等于验收；「终态未核实」表示缺少可核验的收尾证据。日期取自正文或运行记录，缺失时标「日期未详」，不按文件名猜。</p>
      </section>
    </aside>
    {viewingDoc&&<dialog ref={dialog} className="modal research-dialog" aria-label={viewingDoc.title} onCancel={closeDialog}>
      <div className="modal-header">
        <h2>{viewingDoc.title}</h2>
        <div className="dialog-head-actions"><button aria-label="关闭研究详情" onClick={closeDialog}>关闭</button></div>
      </div>
      <div className="detail-body">
        <DocViewer doc={viewingDoc} onOpenDoc={openDoc} onObsidian={sendDocToObsidian} notice={notice}/>
      </div>
    </dialog>}
  </div>;
}
