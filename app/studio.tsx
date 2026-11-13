'use client';
import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import {Search,Upload,ArrowUpRight,Settings2,NotebookText,FileSearch,Sparkles,Download,Trash2,X} from 'lucide-react';
import {RecordItem} from './data';
import ideas from './ideas-data.json';
import research from './research-data.json';
import {IdeaCatalog} from './ideas';
import {ResearchExplorer} from './research';
import {ExperimentCanvas} from './mindmaps';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './studio.css';
import {TopicNetwork,PaperTimeline,colorOf,atlasTopics} from './atlas-visuals';
import catalogStats from './catalog-stats.json';
import {applyPaperMarkdown, applySummaryWithDraft, paperSections} from '../lib/paper-markdown';
import {SummaryPanel, type SummaryState} from './paper-summary';
import {DEFAULT_OBSIDIAN_CONFIG,obsidianVaultUri,openPaperInObsidian,readObsidianConfig,saveObsidianConfig} from '../lib/obsidian';
const PaperNotebook=lazy(()=>import('./paper-notebook').then(module=>({default:module.PaperNotebook})));
type Props={records:RecordItem[];persist:(items:RecordItem[])=>Promise<boolean>};
const val=(r:RecordItem,k:string)=>String(r[k]||'');
function readSavedApi():{apiType:'openai'|'anthropic';baseUrl:string;model:string;apiKey:string}{
 if(typeof window==='undefined')return {apiType:'openai',baseUrl:'',model:'',apiKey:''};
 try{
  const raw=window.localStorage.getItem('seer.workbench.api.v1');
  if(!raw)return {apiType:'openai',baseUrl:'',model:'',apiKey:''};
  const saved=JSON.parse(raw) as Record<string,unknown>;
  return {
   apiType:saved.apiType==='anthropic'?'anthropic':'openai',
   baseUrl:typeof saved.baseUrl==='string'?saved.baseUrl:'',
   model:typeof saved.model==='string'?saved.model:'',
   apiKey:typeof saved.apiKey==='string'?saved.apiKey:''
  };
 }catch{return {apiType:'openai',baseUrl:'',model:'',apiKey:''}}
}
const topics=atlasTopics.map(t=>[t.name,t.question,t.path]);
const EVIDENCE_STEPS=research.groups.reduce((total,group)=>total+group.items.length,0);

export function ProgressStudio({records,persist,legacy,initialIdea}:{legacy:(p:string)=>void;initialIdea?:string}&Props){
 const [idea,setIdea]=useState(initialIdea||'idea3'),[view,setView]=useState<'architecture'|'tree'>('tree'),[scope,setScope]=useState<'ideas'|'evidence'>('ideas'),[evidence,setEvidence]=useState(''),[treeFocus,setTreeFocus]=useState<string>('');
 const nodes=records.filter(r=>r.kind==='node'&&!r.deleted&&r.idea===idea);
 const current=ideas.find(item=>item.id===idea)!;
 function showIdeas(next:'architecture'|'tree'){setEvidence('');setTreeFocus('');setScope('ideas');setView(next)}
 function showEvidence(){setEvidence('');setTreeFocus('');setScope('evidence')}
 function openEvidence(nodeId:string){setEvidence(nodeId);setScope('evidence')}
// The atlas only knows research ids (`T40`); the recorded tree node owns the idea, so read it there.
 function locateInTree(nodeId:string){const recordId='node-'+nodeId,target=records.find(r=>r.kind==='node'&&r.id===recordId&&!r.deleted);if(target?.idea)setIdea(String(target.idea));setTreeFocus(target?recordId:'');setScope('ideas');setView('tree')}
 const ideaTone=(status:string)=>/No-Go|未通过/.test(status)?'risk':/已验证|已评估|已有实验/.test(status)?'ok':'pending';
 return <div className="progress-studio">
  <div className="studio-scope">
   <div className="studio-seg" role="tablist" aria-label="研究推进范围">
    <button type="button" role="tab" aria-selected={scope==='ideas'} data-active={scope==='ideas'} onClick={()=>{setScope('ideas');setEvidence('');setTreeFocus('')}}>想法路线</button>
    <button type="button" role="tab" aria-selected={scope==='evidence'} data-active={scope==='evidence'} onClick={showEvidence}>历史证据</button>
   </div>
   <p className="studio-scope-note">{scope==='ideas'
    ?<><b>6 个想法</b>，每个都有自己的整体架构与实验进度树</>
    :<><b>{EVIDENCE_STEPS} 步实验</b>合成一条按日期排列的证据链，挂接原文与来源</>}</p>
  </div>
  {scope==='ideas'&&<>
   <div className="studio-ideas" role="group" aria-label="选择研究想法">
    {ideas.map(item=><button key={item.id} type="button" aria-pressed={item.id===idea} data-active={item.id===idea} onClick={()=>{setIdea(item.id);setTreeFocus('')}} title={item.status}>
     <b>{item.number}</b>
     <span>{item.name}</span>
     <i className="studio-idea-dot" data-tone={ideaTone(item.status)}/>
    </button>)}
   </div>
   <div className="studio-viewbar">
    <div className="studio-viewtabs" role="tablist" aria-label="想法视图">
     <button type="button" role="tab" aria-selected={view==='architecture'} data-active={view==='architecture'} onClick={()=>showIdeas('architecture')}>整体架构</button>
     <button type="button" role="tab" aria-selected={view==='tree'} data-active={view==='tree'} onClick={()=>showIdeas('tree')}>实验进度树</button>
    </div>
    {view==='tree'
     ?<p className="studio-viewnote"><FileSearch size={12}/>右键主题，可跳到该步在历史证据中的位置</p>
     :<a className="studio-viewaction" href="/architectures/six-architectures.zip" download><Download size={12}/>下载六张架构图</a>}
   </div>
   {view==='architecture'
    ?<IdeaCatalog key={idea} embedded initialId={idea} onSelect={id=>{setIdea(id);setTreeFocus('')}} explore={showEvidence}/>
    :<ExperimentCanvas records={records} persist={persist} nodes={nodes} idea={current} onOpenEvidence={openEvidence} focusRecordId={treeFocus}/>}
  </>}
  {scope==='evidence'&&<>
   <div className="studio-legacy-links"><span>旧版记录</span>{[['experiment','实验结果与记录'],['sync','同步与标定'],['scheme','实现方式对照'],['weekly','周报与待验证方法']].map(([page,title])=><button key={page} type="button" onClick={()=>legacy(page)}>{title}<ArrowUpRight size={12}/></button>)}</div>
   <ResearchExplorer focusNodeId={evidence} onLocate={locateInTree}/>
  </>}
 </div>;
}

async function extract(file:File){
 if(/\.(txt|md)$/i.test(file.name))return file.text();
 if(/\.docx$/i.test(file.name)){const m=await import('mammoth/mammoth.browser');return (await m.extractRawText({arrayBuffer:await file.arrayBuffer()})).value as string}
 const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=pdfWorker;const loading=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())});const pdf=await loading.promise;let text='';try{for(let i=1;i<=pdf.numPages&&text.length<250000;i++){const page=await pdf.getPage(i);const content=await page.getTextContent();text+='\n[第'+i+'页]\n'+content.items.map(x=>('str' in x && typeof x.str==='string'?x.str:'')).join(' ')}}finally{await loading.destroy()}return text;
}
export function LiteratureStudio({records,persist,mode,loading=false}:{mode:'topics'|'timeline'|'library';loading?:boolean}&Props){
 const allPapers=records.filter(r=>r.kind==='paper'&&!r.deleted),[scope,setScope]=useState('local'),[query,setQuery]=useState(''),[theme,setTheme]=useState('全部主题'),[readStatus,setReadStatus]=useState('全部状态'),[order,setOrder]=useState('relevance'),[reading,setReading]=useState<RecordItem|null>(null),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false),[api,setApi]=useState(false),[apiType,setApiType]=useState<'openai'|'anthropic'>(()=>readSavedApi().apiType),[baseUrl,setBaseUrl]=useState(()=>readSavedApi().baseUrl),[model,setModel]=useState(()=>readSavedApi().model),[key,setKey]=useState(()=>readSavedApi().apiKey),[ai,setAi]=useState<SummaryState|null>(null),[applying,setApplying]=useState(false);
 useEffect(()=>{
  try{
   if(!baseUrl&&!model&&!key){window.localStorage.removeItem('seer.workbench.api.v1');return}
   window.localStorage.setItem('seer.workbench.api.v1',JSON.stringify({apiType,baseUrl,model,apiKey:key}));
  }catch{}
 },[apiType,baseUrl,model,key]);
 const [obsidian,setObsidian]=useState(()=>readObsidianConfig()),[obsidianOpen,setObsidianOpen]=useState(false);
 useEffect(()=>{saveObsidianConfig(obsidian)},[obsidian]);
 const [pendingDelete,setPendingDelete]=useState<RecordItem|null>(null),deleteDialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(pendingDelete)deleteDialog.current?.showModal();else deleteDialog.current?.close()},[pendingDelete]);
 async function removePaper(r:RecordItem){
  setBusy(true);
  try{
   const documentId=val(r,'documentId');
   if(documentId){
    const res=await fetch('/api/documents/'+encodeURIComponent(documentId),{method:'DELETE'});
    if(!res.ok&&res.status!==404)throw Error('原件清理失败，文献卡片未删除，请重试。');
   }
   if(!await persist([{...r,deleted:true}]))throw Error('文献卡片删除失败，请重试。');
   setPendingDelete(null);
   setMsg(documentId?'文献与上传原件已删除':'文献卡片已删除');
  }catch(e){setMsg((e as Error).message)}finally{setBusy(false)}
 }
 const fileInput=useRef<HTMLInputElement>(null);const papers=allPapers.filter(r=>scope==='all'||scope==='local'&&(!r.catalogScope||r.catalogScope==='local'||r.catalogScope==='manual')||r.catalogScope===scope);const themes=[...new Set([...topics.map(t=>t[0]).filter(t=>papers.some(r=>r.theme===t)),...papers.map(r=>val(r,'theme')||'待归类')])];
 function changeScope(value:string){setScope(value);setTheme('全部主题');setReadStatus('全部状态')}

 const filtered=papers.filter(r=>(theme==='全部主题'||(val(r,'theme')||'待归类')===theme)&&(!query||JSON.stringify(r).toLowerCase().includes(query.toLowerCase()))&&(readStatus==='全部状态'||(r.review||r.status||'待读')===readStatus)).sort((a,b)=>order==='title'?a.title.localeCompare(b.title):order==='relevance'&&(Boolean(a.priority)!==Boolean(b.priority))?Number(Boolean(b.priority))-Number(Boolean(a.priority)):!a.year&&!b.year?a.title.localeCompare(b.title):!a.year?1:!b.year?-1:order==='oldest'?String(a.year).localeCompare(String(b.year)):String(b.year).localeCompare(String(a.year)));
 async function upload(file:File){setBusy(true);setMsg('正在保存文档并提取正文…');try{if(file.size>15*1024*1024)throw Error('文档不能超过15MB');const data=new FormData();data.set('file',file);const res=await fetch('/api/documents',{method:'POST',body:data});const doc=await res.json() as {id:string;error?:string};if(!res.ok)throw Error(doc.error);let text='',note='';try{text=await extract(file);if(text.trim().length<100)note='未提取到足够正文。扫描版需要OCR，可先手动粘贴正文。'}catch{note='自动提取失败，原文件已保留；请手动粘贴正文。'}const item:RecordItem={id:crypto.randomUUID(),kind:'paper',title:file.name.replace(/\.[^.]+$/,''),type:'论文',catalogScope:'manual',theme:'待归类',status:'待读',date:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}),documentId:doc.id,documentName:file.name,text:text.slice(0,250000),review:'待人工阅读',notes:note};if(!await persist([item]))throw Error('文件已保存，卡片保存失败；可从总备份找回原文档记录。');setMsg(note||'文档与正文已保存，可直接用卡片上的 AI 按钮生成五维总结')}catch(e){setMsg((e as Error).message)}finally{setBusy(false);if(fileInput.current)fileInput.current.value=''}}
 async function runSummary(paper:RecordItem){
  if(ai?.status==='loading')return;
  const before=paperSections(paper);
  if(!baseUrl.trim()||!model.trim()||!key.trim()){
   setAi({id:paper.id,status:'error',draft:null,before,error:'还没有可用的服务商：点顶部「API 设置」填写服务地址、模型和密钥后再试。',model:''});
   return;
  }
  setAi({id:paper.id,status:'loading',draft:null,before,error:'',model:model.trim()});
  try{
   let text=val(paper,'text');
   if(text.length<100&&paper.textUrl){
    const res=await fetch(val(paper,'textUrl'));
    if(res.ok)text=(await res.text()).slice(0,250000);
   }
   if(text.length<100)throw Error('这篇文献没有可用正文（'+text.length+' 字符）：请先用「上传文档」导入原文，或确认原文能被正常解析后重试。');
   const r=await fetch('/api/summarize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseUrl,model,apiKey:key,text,apiType})});
   const d=await r.json() as {error?:string;summary?:Record<string,string>};
   if(!r.ok||!d.summary)throw Error(d.error||'服务商未返回总结');
   setAi({id:paper.id,status:'done',draft:d.summary,before,error:'',model:model.trim()});
  }catch(e){setAi({id:paper.id,status:'error',draft:null,before,error:(e as Error).message,model:model.trim()})}
 }
 async function applySummary(keys:string[],draft?:string|null){
  const current=ai;
  if(!current?.draft||!keys.length)return false;
  const paper=allPapers.find(p=>p.id===current.id);
  if(!paper)return false;
  const patch=Object.fromEntries(keys.map(key=>[key,current.draft?.[key]||'']));
  setApplying(true);
  const item=applySummaryWithDraft(paper,draft??null,patch,current.model);
  const ok=await persist([item]);
  setApplying(false);
  if(ok){setAi(null);setMsg('已接受 '+keys.length+' 个模块的总结')}
  return ok;
 }
 const readingPaper=reading&&(allPapers.find(p=>p.id===reading.id)||reading);
 const listScroll=useRef(0);
 const [readingAnchor,setReadingAnchor]=useState('');
 function openReading(paper:RecordItem,anchor=''){
  if(!reading)listScroll.current=window.scrollY;
  setReadingAnchor(anchor);
  setReading(paper);
 }
 function closeReading(){
  setReading(null);
  requestAnimationFrame(()=>window.scrollTo({top:listScroll.current,behavior:'instant'}));
 }
 if(readingPaper)return <Suspense fallback={<p className="notebook-loading" role="status">正在打开文献…</p>}>
  <PaperNotebook key={readingPaper.id} paper={readingPaper} papers={allPapers}
   related={allPapers.find(p=>p.id===readingPaper.relatedTo)} onRelated={openReading}
   initialAnchor={readingAnchor} backLabel={mode==='topics'?'主题地图':mode==='timeline'?'时间线':'文献库'}
   onClose={closeReading}
   summary={ai&&ai.id===readingPaper.id?ai:null}
   applying={applying}
   onSummarize={()=>runSummary(readingPaper)}
   onApplySummary={applySummary}
   onDismissSummary={()=>setAi(null)}
   onSave={markdown=>persist([applyPaperMarkdown(readingPaper,markdown)])}/>
 </Suspense>;
 async function sendToObsidian(r:RecordItem){const result=await openPaperInObsidian(r);setMsg(result.message)}
 function card(r:RecordItem){return <article className="panel literature-card compact-paper" key={r.id} style={{'--theme':colorOf(r.theme)} as CSSProperties}><div className="paper-meta"><i style={{background:colorOf(r.theme)}}/>{r.year||'年份待补充'}<span>·</span>{r.venue||r.type||'论文'}{r.priority&&<span className="paper-priority">重点</span>}</div><button className="title-button" onClick={()=>openReading(r)}>{r.title}</button>{r.authors&&<div className="paper-authors">{r.authors}</div>}<p className="paper-preview">{r.problem||r.solution||r.notes||'阅读原文后补充研究问题与方法。'}</p><div className="paper-card-footer"><button className="theme-tag" style={{color:colorOf(r.theme)}} onClick={()=>setTheme(val(r,'theme')||'待归类')}>{r.theme||'待归类'}</button><div className="paper-card-actions"><button className="paper-obsidian" type="button" title="直接用已配置的服务商生成五维总结" aria-label="生成 AI 总结" onClick={()=>runSummary(r)} disabled={ai?.status==='loading'&&ai.id===r.id}><Sparkles size={13}/>{ai?.status==='loading'&&ai.id===r.id?'总结中':'AI'}</button><button className="paper-obsidian" type="button" title="在 Obsidian 中打开文献详情" aria-label="在 Obsidian 中打开文献详情" onClick={()=>sendToObsidian(r)}><NotebookText size={13}/>Obsidian</button><button className="paper-obsidian" type="button" title="删除文献卡片与上传原件" aria-label={'删除 '+r.title} onClick={()=>setPendingDelete(r)} disabled={busy}><Trash2 size={13}/></button><button className="paper-state" data-state={val(r,'review')||val(r,'status')||'待读'} onClick={()=>openReading(r)}>{r.review||r.status||'待读'}</button></div></div>{ai?.id===r.id&&<SummaryPanel key={ai.status+ai.model} state={ai} applying={applying} onApply={applySummary} onDismiss={()=>setAi(null)}/>}</article>}

 return <><div className="studio-hero"><span className="eyebrow">RELATED WORK / {mode.toUpperCase()}</span><h2>{mode==='topics'?'主题地图':mode==='timeline'?'时间线':'文献库'}</h2><p>按本地原文重整 · 点击查看摘要、方法与来源 · 可在 Obsidian 中打开文献详情。</p></div><div className="catalog-summary"><div><strong>本地论文目录</strong><span>{catalogStats.pdfFiles} 份 PDF → {catalogStats.papers} 篇论文 + {catalogStats.guides} 份阅读资料</span></div><a href="/api/catalog?download=1" download="本地文献目录.json">导出来源目录 <ArrowUpRight size={12}/></a></div><div className="studio-toolbar"><select aria-label="文献范围" value={scope} onChange={e=>changeScope(e.target.value)}><option value="local">本地论文与新增</option><option value="guide">阅读指南 / 汇总</option><option value="history">历史参考 / 内部方案</option><option value="all">全部文档</option></select><div className="input-search"><Search size={16}/><input aria-label="搜索文献" placeholder="搜索问题、方法或论文标题…" value={query} onChange={e=>setQuery(e.target.value)}/></div><select aria-label="文献主题" value={theme} onChange={e=>setTheme(e.target.value)}><option>全部主题</option>{themes.map(t=><option key={t}>{t}</option>)}</select><select aria-label="文献状态" value={readStatus} onChange={e=>setReadStatus(e.target.value)}><option>全部状态</option>{[...new Set(papers.map(p=>val(p,'review')||val(p,'status')||'待读'))].map(x=><option key={x}>{x}</option>)}</select><select aria-label="文献排序" value={order} onChange={e=>setOrder(e.target.value)}><option value="relevance">重点优先</option><option value="newest">最新优先</option><option value="oldest">最早优先</option><option value="title">标题排序</option></select><button className="secondary" onClick={()=>setApi(!api)}><Settings2 size={15}/> API 设置</button><button className="secondary" onClick={()=>setObsidianOpen(!obsidianOpen)}><NotebookText size={15}/> Obsidian</button><button className="secondary" disabled={busy} onClick={()=>fileInput.current?.click()}><Upload size={15}/> 上传文档</button><input ref={fileInput} type="file" accept=".pdf,.docx,.md,.txt" hidden onChange={e=>{const f=e.target.files?.[0];if(f)upload(f)}}/></div><div className="atlas-result-line">{filtered.length} 项</div>{api&&<section className="panel api-settings"><h3>论文总结接口</h3><p>支持 OpenAI Chat Completions 与 Anthropic Messages 两种格式。密钥保存在当前浏览器本地，刷新后自动恢复；不会写入服务器。最多发送前 120000 字符正文。</p><div className="api-provider-row"><label>接口类型<select aria-label="API 接口类型" value={apiType} onChange={e=>setApiType(e.target.value as 'openai'|'anthropic')}><option value="openai">OpenAI 兼容</option><option value="anthropic">Anthropic 兼容</option></select></label><button type="button" className="secondary" onClick={()=>{setApiType('anthropic');setBaseUrl('https://api.deepseek.com/anthropic');setModel('deepseek-flash')}}>填入 DeepSeek</button><small>Anthropic 端点；DeepSeek 自动启用思考；模型可填 deepseek-flash 或 deepseek-v4-pro。</small></div><div className="api-grid"><label>服务地址<input aria-label="API 服务地址" placeholder="https://api.deepseek.com/anthropic 或 /v1" value={baseUrl} onChange={e=>setBaseUrl(e.target.value)}/></label><label>模型名称<input aria-label="API 模型" placeholder="如 deepseek-flash" value={model} onChange={e=>setModel(e.target.value)}/></label><label>API Key<input aria-label="API 密钥" type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)}/></label></div><div className="api-storage-note"><span>密钥保存在此浏览器本地，不会上传服务器。</span><button type="button" className="text-button" onClick={()=>{setApiType('openai');setBaseUrl('');setModel('');setKey('');try{window.localStorage.removeItem('seer.workbench.api.v1')}catch{}}}>清除本地保存</button></div></section>}{obsidianOpen&&<section className="panel api-settings obsidian-settings"><h3>Obsidian 文献笔记</h3><p>在文献卡片或详情页点击“Obsidian”，会把当前文献详情（含标题、元数据、五维阅读、原文摘录与来源）生成为 Markdown 笔记，写入下面的 vault 目录并交给本机 Obsidian 打开。研究推进中的完整结果分析使用“结果分析目录”。同名笔记会被覆盖；内容只在本机传递。</p><div className="api-grid obsidian-grid"><label>Vault 名称<input aria-label="Obsidian vault 名称" value={obsidian.vault} onChange={e=>setObsidian({...obsidian,vault:e.target.value})} placeholder={DEFAULT_OBSIDIAN_CONFIG.vault}/></label><label>文献笔记目录<input aria-label="Obsidian 文献笔记目录" value={obsidian.folder} onChange={e=>setObsidian({...obsidian,folder:e.target.value})} placeholder={DEFAULT_OBSIDIAN_CONFIG.folder}/></label><label>结果分析目录<input aria-label="Obsidian 结果分析目录" value={obsidian.docsFolder} onChange={e=>setObsidian({...obsidian,docsFolder:e.target.value})} placeholder={DEFAULT_OBSIDIAN_CONFIG.docsFolder}/></label></div><div className="api-storage-note"><span>默认：{DEFAULT_OBSIDIAN_CONFIG.vault} · {DEFAULT_OBSIDIAN_CONFIG.folder} · {DEFAULT_OBSIDIAN_CONFIG.docsFolder}</span><button type="button" className="text-button" onClick={()=>setObsidian({...DEFAULT_OBSIDIAN_CONFIG})}>恢复默认</button></div><a className="secondary obsidian-test" href={obsidianVaultUri(obsidian.vault)}>测试打开 vault</a></section>}{msg&&<p className="studio-message" role="status">{msg}</p>}
 {mode==='topics'&&<TopicNetwork papers={filtered} open={openReading}/>}
 {mode==='timeline'&&<PaperTimeline papers={filtered} open={openReading}/>}
 {mode==='library'&&<div className="literature-grid">{filtered.map(card)}</div>}
 {!filtered.length&&<div className="empty">{loading?'正在载入文献目录…':'没有匹配文献'}</div>}
 {pendingDelete&&<dialog ref={deleteDialog} className="modal" aria-labelledby="delete-paper-title" onCancel={e=>{e.preventDefault();if(!busy)setPendingDelete(null)}} onClick={e=>{if(e.target===e.currentTarget&&!busy)setPendingDelete(null)}}><div className="modal-header"><div><h2 id="delete-paper-title">删除文献</h2></div><button className="icon-button" aria-label="关闭弹窗" onClick={()=>setPendingDelete(null)} disabled={busy}><X size={21}/></button></div><div className="confirm-body"><p>删除「{pendingDelete.title}」？</p>{val(pendingDelete,'documentId')?<p>上传的原件会一并从存储中清除，此操作无法撤销。建议先导出备份。</p>:<p>此操作无法撤销。建议先导出备份。</p>}<div className="modal-footer"><button onClick={()=>setPendingDelete(null)} disabled={busy}>取消</button><button className="danger" disabled={busy} onClick={()=>removePaper(pendingDelete)}>{busy?'删除中…':'确认删除'}</button></div></div></dialog>}
 </>;
}
