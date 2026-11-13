/* eslint-disable @next/next/no-img-element */
import {ArrowDownToLine,ArrowUpRight,GitBranch} from 'lucide-react';
import figures from './architecture-data.json';
import './architecture.css';

export function ArchitectureFigure({ideaNumber}:{ideaNumber:number}){
 const figure=figures.find(f=>f.number===ideaNumber);
 if(!figure)return null;
 return <figure className="architecture-figure"><div className="architecture-heading"><div><h3><GitBranch size={16}/>整体架构图</h3><p>{figure.caption}</p></div><div className="architecture-actions"><a href={figure.url} target="_blank" rel="noreferrer">放大查看 <ArrowUpRight size={13}/></a><a href={figure.url} download={`SEER-idea-${ideaNumber}-architecture.svg`}>下载 SVG <ArrowDownToLine size={13}/></a></div></div><a className="architecture-image" href={figure.url} target="_blank" rel="noreferrer" aria-label={`放大想法${ideaNumber}整体架构图`}><img key={figure.url} src={figure.url} alt={`想法${ideaNumber}整体架构：${figure.title}。${figure.caption}`} width="1440" height="900"/></a><figcaption><span>{figure.status}</span><span>依据原方案绘制 · 图示不等于全部模块已验收</span></figcaption></figure>;
}
