'use client';
import {useState} from 'react';
import {ArrowUpRight,ChevronRight,GitBranch,FileText} from 'lucide-react';
import ideas from './ideas-data.json';
import research from './research-data.json';
import './ideas.css';
import {ArchitectureFigure} from './architecture';
import {maskPath} from '../lib/display-path';

export function IdeaCatalog({initialId,explore,onSelect,embedded=false}:{initialId:string;explore:()=>void;onSelect?:(id:string)=>void;embedded?:boolean}){
 const [id,setId]=useState(initialId);
 const idea=ideas.find(i=>i.id===id)||ideas[0];
 return <div className={'idea-catalog'+(embedded?' is-embedded':'')}>{!embedded&&<section className="idea-intro"><span className="eyebrow">IDEA 01 — 06 / ORIGINAL RESEARCH MAP</span><h2>六个研究想法，分别走到了哪里？</h2><p>按 Obsidian 原有编号整理。每个想法保留核心机制、当前证据和下一步；版本迭代归在所属想法内。相似机制之间不自动继承实验结论。</p><a className="architecture-bundle" href="/architectures/six-architectures.zip" download>下载六张整体架构图（SVG） <ArrowUpRight size={13}/></a></section>}{!embedded&&<div className="idea-picker" role="group" aria-label="选择研究想法">{ideas.map(i=><button key={i.id} aria-pressed={i.id===id} className={i.id===id?'selected':''} onClick={()=>{setId(i.id);onSelect?.(i.id)}}><span>想法{i.number}</span><h3>{i.name}</h3><p>{i.subtitle}</p><small>{i.status}</small><ChevronRight size={16}/></button>)}</div>}
 <article className="panel idea-detail" aria-live="polite"><div className="idea-detail-heading"><div><span className="eyebrow">想法{idea.number} / ORIGINAL PROPOSAL</span><h2>{idea.name}</h2><p>{idea.question}</p></div><span className="badge blue">{idea.status}</span></div><ArchitectureFigure ideaNumber={ideas.indexOf(idea)+1}/><details className="scheme-notes"><summary>方案说明与来源</summary><div className="idea-body"><div><h3>核心机制</h3><p>{idea.mechanism}</p><h3>已有进展</h3><p>{idea.progress}</p><div className="idea-limit"><strong>当前结论与边界</strong><p>{idea.limit}</p></div></div><aside><h3>下一步</h3><p>{idea.next}</p><h3>与其他想法的关系</h3><p>{idea.relation}</p><button className="text-button" onClick={explore}><GitBranch size={14}/> 查看演进路线与实验节点 <ArrowUpRight size={13}/></button></aside></div><div className="idea-sources"><h3><FileText size={15}/> 原始文档与结果</h3>{idea.sourceIds.map(id=>{const s=research.sources.find(s=>s.id===id);return s?<div key={id}><span>{s.id}</span><div><strong>{s.title}</strong><code>{maskPath(s.path)}</code></div>{'url' in s&&<a className="source" href={s.url} target="_blank" rel="noreferrer">阅读快照 <ArrowUpRight size={13}/></a>}</div>:null})}</div></details></article>
 <section className="panel idea-comparison"><div className="section-head"><h2>六个想法的范围对照</h2><span className="idea-note">机制相似，不等于同一实验</span></div><div className="table-wrap"><table><thead><tr><th>原编号</th><th>核心问题</th><th>当前状态</th><th>阅读</th></tr></thead><tbody>{ideas.map(i=><tr key={i.id}><td>想法{i.number}<small>{i.name}</small></td><td>{i.question}</td><td>{i.status}</td><td><button className="source" onClick={()=>{setId(i.id);onSelect?.(i.id);document.querySelector('.idea-detail')?.scrollIntoView({behavior:'smooth',block:'start'})}}>查看 <ArrowUpRight size={13}/></button></td></tr>)}</tbody></table></div></section></div>;
}
