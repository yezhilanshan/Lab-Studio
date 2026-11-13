'use client';
import {useEffect,useRef,useState} from 'react';
import {RecordItem} from './data';
import catalogTopics from './catalog-topics.json';

export const atlasTopics=catalogTopics;
export function colorOf(theme:unknown){return atlasTopics.find(t=>t.name===theme)?.color||'#6f7168'}
function short(r:RecordItem){if(r.shortTitle)return String(r.shortTitle);const raw=r.id.replace(/^lit-/,'').replace(/^p-/,'');return raw.length<15?raw:String(r.title).split(/[ :：·]/)[0].slice(0,15)}

const MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];

/** 从已有证据中取月份；取不到就返回 null，绝不补造日期。 */
function monthOf(p:RecordItem):number|null{
 const year=Number(p.year);
 if(!Number.isFinite(year))return null;
 const evidence=String(p.yearEvidence||'');
 const arxiv=evidence.match(/arXiv[:\s]*(\d{2})(\d{2})\./i);
 if(arxiv){
  const yy=Number(arxiv[1]),mm=Number(arxiv[2]);
  if(mm>=1&&mm<=12&&year%100===yy)return mm;
 }
 const iso=evidence.match(/\b(\d{4})[-年/.](\d{1,2})\b/);
 if(iso&&Number(iso[1])===year){
  const mm=Number(iso[2]);
  if(mm>=1&&mm<=12)return mm;
 }
 const re=/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/gi;
 let match:RegExpExecArray|null=null,found:number|null=null;
 while((match=re.exec(evidence))){
  const around=evidence.slice(Math.max(0,match.index-24),match.index+48);
  const years=around.match(/(?:19|20)\d{2}/g)||[];
  if(years.length===0||years.some(y=>Number(y)===year))found=MONTHS.indexOf(match[1].toLowerCase())+1;
 }
 return found;
}
function stampOf(p:RecordItem){
 const month=monthOf(p);
 return month?`${p.year}-${String(month).padStart(2,'0')}`:String(p.year||'年份待补充');
}
function timeValue(p:RecordItem){
 const year=Number(p.year),month=monthOf(p);
 return year*12+(month?month-.5:6);
}
function bucketKey(p:RecordItem){
 const month=monthOf(p);
 return month?`${p.year}-${month}`:`${p.year}-year`;
}

type Props={papers:RecordItem[];open:(r:RecordItem)=>void};

export function TopicNetwork({papers,open}:Props){
 const [focus,setFocus]=useState<string|null>(null),[hover,setHover]=useState<string|null>(null);
 const [zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0});
 const [dragging,setDragging]=useState(false),[tip,setTip]=useState<{paper:RecordItem;x:number;y:number}|null>(null);
 const svgRef=useRef<SVGSVGElement>(null),drag=useRef<{id:number;x:number;y:number;px:number;py:number;cluster?:string}|null>(null);
 const moved=useRef(false),view=useRef({zoom:1,pan:{x:0,y:0}});

 const topics=[...atlasTopics.filter(t=>papers.some(p=>(p.theme||'待归类')===t.name)),...[...new Set(papers.map(p=>String(p.theme||'待归类')))].filter(t=>!atlasTopics.some(a=>a.name===t)).map(t=>({name:t,color:'#6f7168',question:'自定义研究主题'}))];
 const cols=Math.min(3,Math.max(1,topics.length)),step=cols===1?420:300,cy=cols===1?220:155,radius=cols===1?180:132,spread=cols===1?145:105;
 const rows=Math.ceil(topics.length/cols),height=rows*step+30;
 const cx=(i:number)=>(i%cols+.5)*(960/cols),y=(i:number)=>cy+Math.floor(i/cols)*step;
 const nodes=papers.map(p=>{
  const ti=topics.findIndex(t=>t.name===(p.theme||'待归类'));
  const peers=papers.filter(x=>(x.theme||'待归类')===(p.theme||'待归类')).sort((a,b)=>a.id.localeCompare(b.id));
  const i=peers.findIndex(x=>x.id===p.id),a=i*2.39996,r=peers.length===1?0:Math.sqrt((i+.5)/peers.length)*spread;
  return {paper:p,label:peers.length<=9||Boolean(p.priority)||i<4,x:cx(ti)+Math.cos(a)*r,y:y(ti)+Math.sin(a)*r,theme:topics[ti]};
 });

 function applyView(z:number,p:{x:number;y:number}){view.current={zoom:z,pan:p};setZoom(z);setPan(p)}
 function svgPoint(clientX:number,clientY:number){
  const svg=svgRef.current;
  if(!svg)return {x:0,y:0};
  const rect=svg.getBoundingClientRect();
  return {x:(clientX-rect.left)*(960/rect.width),y:(clientY-rect.top)*(height/rect.height)};
 }
 function zoomAt(next:number,sx:number,sy:number){
  const current=view.current, z=Math.min(2.4,Math.max(.6,next));
  applyView(z,{x:sx-(sx-current.pan.x)*z/current.zoom,y:sy-(sy-current.pan.y)*z/current.zoom});
  setTip(null);
 }

 useEffect(()=>{
  const svg=svgRef.current;
  if(!svg)return;
  const wheel=(event:WheelEvent)=>{
   if(!(event.ctrlKey||event.metaKey))return;
   event.preventDefault();
   const rect=svg.getBoundingClientRect();
   const point={x:(event.clientX-rect.left)*(960/rect.width),y:(event.clientY-rect.top)*(height/rect.height)};
   const current=view.current,z=Math.min(2.4,Math.max(.6,current.zoom*Math.exp(-event.deltaY*.0018)));
   const nextPan={x:point.x-(point.x-current.pan.x)*z/current.zoom,y:point.y-(point.y-current.pan.y)*z/current.zoom};
   view.current={zoom:z,pan:nextPan};setZoom(z);setPan(nextPan);setTip(null);
  };
  svg.addEventListener('wheel',wheel,{passive:false});
  return()=>svg.removeEventListener('wheel',wheel);
 },[height]);

 const toggleFocus=(name:string)=>setFocus(current=>current===name?null:name);
 const showTip=(paper:RecordItem,x:number,y:number)=>setTip({paper,x,y});
 const moveTip=(x:number,y:number)=>setTip(current=>current?{...current,x,y}:null);
 const tipStyle=tip?{left:Math.min(tip.x+16,(typeof window!=='undefined'?window.innerWidth:1440)-300),top:Math.min(tip.y+16,(typeof window!=='undefined'?window.innerHeight:900)-150)}:undefined;

 return <><div className="network-layout"><section className="network-canvas">
  <div className="viz-scroll">
   <svg ref={svgRef} viewBox={`0 0 960 ${height}`} role="group" aria-label="文献主题聚类网络" className={dragging?'is-dragging':undefined}
    onPointerDown={e=>{
     if(e.button!==0||e.pointerType==='touch')return;
     if((e.target as Element).closest('.network-point'))return;
     const point=svgPoint(e.clientX,e.clientY);
     const cluster=(e.target as Element).closest('.network-cluster') as SVGGElement|null;
     drag.current={id:e.pointerId,x:point.x,y:point.y,px:view.current.pan.x,py:view.current.pan.y,cluster:cluster?.dataset.topic};
     moved.current=false;
     (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
     setDragging(true);setTip(null);
    }}
    onPointerMove={e=>{
     const d=drag.current;
     if(!d||d.id!==e.pointerId)return;
     const point=svgPoint(e.clientX,e.clientY),dx=point.x-d.x,dy=point.y-d.y;
     if(Math.abs(dx)+Math.abs(dy)>3)moved.current=true;
     applyView(view.current.zoom,{x:d.px+dx,y:d.py+dy});
    }}
    onPointerUp={e=>{
     const d=drag.current;
     if(d?.id!==e.pointerId)return;
     const focusName=!moved.current?d.cluster:undefined;
     drag.current=null;setDragging(false);
     if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
     if(focusName)toggleFocus(focusName);
    }}
    onPointerCancel={()=>{drag.current=null;setDragging(false)}}>
    <defs><pattern id="atlas-dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".6" fill="#d8d3c6"/></pattern></defs>
    <rect width="960" height={height} fill="url(#atlas-dots)"/>
    <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
     {topics.map((t,i)=><g key={t.name} className="network-cluster" role="button" tabIndex={0} aria-label={'聚焦主题 '+t.name} aria-pressed={focus===t.name}
      data-topic={t.name}
      opacity={focus&&focus!==t.name?0.32:1}
      onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleFocus(t.name)}}}>
      <circle cx={cx(i)} cy={y(i)} r={radius} fill={t.color+'0F'} stroke={t.color+'45'}/>
      <text x={cx(i)} y={18+Math.floor(i/cols)*step} textAnchor="middle" fill={t.color} fontSize="15" fontWeight="500" fontFamily="var(--font-display)">{t.name}</text>
     </g>)}
     {nodes.filter(n=>n.paper.relatedTo).map(n=>{
      const target=nodes.find(t=>t.paper.id===n.paper.relatedTo);
      return target?<g key={n.paper.id}><line x1={n.x} y1={n.y} x2={target.x} y2={target.y} stroke="#8c8f84" strokeWidth={hover===n.paper.id?2:1} opacity={hover&&hover!==n.paper.id&&hover!==target.paper.id?0.13:.45}/><title>{n.paper.title} → {n.paper.relation||'关联'} → {target.paper.title}\n{n.paper.relationNote||''}</title></g>:null;
     })}
     {nodes.map(n=><g key={n.paper.id} className="network-point" role="button" tabIndex={0} aria-label={'查看 '+n.paper.title}
      onClick={()=>open(n.paper)}
      onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(n.paper)}}}
      onMouseEnter={e=>{setHover(n.paper.id);showTip(n.paper,e.clientX,e.clientY)}}
      onMouseMove={e=>moveTip(e.clientX,e.clientY)}
      onMouseLeave={()=>{setHover(null);setTip(null)}}
      onFocus={e=>{const r=(e.currentTarget as SVGGElement).getBoundingClientRect();showTip(n.paper,r.right,r.top)}}
      onBlur={()=>setTip(null)}
      opacity={focus&&focus!==n.theme.name?0.23:1}>
      <title>{n.paper.title} · {stampOf(n.paper)}\n{n.paper.problem||n.paper.notes}</title>
      <circle cx={n.x} cy={n.y} r={hover===n.paper.id?6.5:4.8} fill={n.theme.color} stroke="#fcfaf5" strokeWidth="1.5"/>
      {(n.label||hover===n.paper.id||topics.length===1)&&<text x={n.x} y={n.y+17} textAnchor="middle" fontSize="11.5" fill="#3d443a">{short(n.paper)}</text>}
     </g>)}
    </g>
   </svg>
  </div>
  <div className="viz-legend">
   <span>● 一点一篇</span><span>— 关系（非引用）</span><span>点击圆点打开 · 圈层聚焦</span><span>拖动 · Ctrl 滚轮缩放</span>
  </div>
  {tip&&<div className="network-tooltip" style={tipStyle}>
   <span>{stampOf(tip.paper)} · {tip.paper.venue||tip.paper.type||'论文'}</span>
   <strong>{tip.paper.title}</strong>
   <p>{tip.paper.problem||tip.paper.notes||''}</p>
  </div>}
 </section>
 <aside className="network-key">
  <div className="network-controls" role="group" aria-label="地图缩放">
   <button type="button" aria-label="缩小地图" onClick={()=>zoomAt(view.current.zoom/1.3,480,height/2)}>−</button>
   <span>{Math.round(zoom*100)}%</span>
   <button type="button" aria-label="放大地图" onClick={()=>zoomAt(view.current.zoom*1.3,480,height/2)}>+</button>
   <button type="button" className="reset" onClick={()=>applyView(1,{x:0,y:0})}>重置</button>
  </div>
  <div className="key-heading">主题 / 研究问题 <button onClick={()=>setFocus(null)}>全部</button></div>
  {topics.map(t=><button key={t.name} className={focus===t.name?'selected':''} onClick={()=>setFocus(focus===t.name?null:t.name)}><i style={{background:t.color}}/><div><strong>{t.name}<small>{papers.filter(p=>(p.theme||'待归类')===t.name).length}</small></strong><p>{t.question}</p></div></button>)}
 </aside>
 </div>
 <details className="catalog-relations"><summary>方法与问题对照 · {nodes.filter(n=>nodes.some(t=>t.paper.id===n.paper.relatedTo)).length} 组</summary><p>按研究问题整理的联系，不代表引用关系或性能排名。</p><div>{nodes.filter(n=>n.paper.relatedTo).map(n=>{const target=nodes.find(t=>t.paper.id===n.paper.relatedTo);return target?<button key={n.paper.id} onClick={()=>open(n.paper)}><strong>{short(n.paper)} <span>↔</span> {short(target.paper)}</strong><small>{String(n.paper.relationNote||n.paper.relation).replace(/^研究问题 \/ 方法的整理关系，不表示引用、继承或性能优劣：/,'')}</small></button>:null})}</div></details></>;
}

export function PaperTimeline({papers,open}:Props){
 const dated=papers.filter(p=>/^\d{4}$/.test(String(p.year))),undated=papers.filter(p=>!/^\d{4}$/.test(String(p.year)));
 const minYear=dated.length?Math.min(...dated.map(p=>Number(p.year))):2026,maxYear=dated.length?Math.max(...dated.map(p=>Number(p.year))):2026;
 const themes=[...atlasTopics.filter(t=>papers.some(p=>(p.theme||'待归类')===t.name)).map(t=>t.name),...[...new Set(papers.map(p=>String(p.theme||'待归类')))].filter(t=>!atlasTopics.some(a=>a.name===t))];
 const minTime=minYear*12,span=Math.max(12,(maxYear-minYear+1)*12),width=900;
 const xTime=(t:number)=>220+((t-minTime)/span)*width;
 const years=Array.from({length:maxYear-minYear+1},(_,i)=>minYear+i);
 const rowHeights=themes.map(t=>{
  const counts=new Map<string,number>();
  dated.filter(p=>(p.theme||'待归类')===t).forEach(p=>counts.set(bucketKey(p),(counts.get(bucketKey(p))||0)+1));
  return Math.max(88,48+Math.ceil(Math.max(0,...counts.values())/3)*14);
 });
 const ys=themes.map((_,i)=>45+rowHeights.slice(0,i).reduce((a,b)=>a+b,0));
 const height=rowHeights.reduce((a,b)=>a+b,0)+100;
 const quarterWidth=(width/span)*3;

 return <><section className="dot-timeline"><div className="viz-scroll">
  <svg viewBox={`0 0 1180 ${height}`} role="group" aria-label="按主题与本地版本月份排列的文献时间线">
   {years.map(year=><g key={year}>
    <line x1={xTime(year*12)} x2={xTime(year*12)} y1="25" y2={height-50} stroke="#d8d3c6"/>
    {[1,2,3].map(q=><line key={q} x1={xTime(year*12+q*3)} x2={xTime(year*12+q*3)} y1="25" y2={height-50} stroke="#e5e0d3" strokeDasharray="2 5"/>)}
    <text x={xTime(year*12)} y="16" textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill="#8a8f84">{year}</text>
    <text x={xTime(year*12)} y={height-24} textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill="#8a8f84">{year}</text>
    {[0,1,2,3].map(q=><text key={q} x={xTime(year*12+q*3)+quarterWidth/2} y={height-8} textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill="#8a8f84">Q{q+1}</text>)}
   </g>)}
   {themes.map((t,ri)=>{
    const work=dated.filter(p=>(p.theme||'待归类')===t).sort((a,b)=>timeValue(a)-timeValue(b)||a.id.localeCompare(b.id));
    return <g key={t}>
     <rect x="0" y={ys[ri]-15} width="1160" height={rowHeights[ri]} fill={colorOf(t)+'0E'} opacity="1"/>
     <circle cx="18" cy={ys[ri]+22} r="4" fill={colorOf(t)}/>
     <text x="33" y={ys[ri]+26} fontSize="15" fontWeight="500" fontFamily="var(--font-display)" fill="#3b4238">{t}</text>
     <text x="33" y={ys[ri]+46} fontSize="10" fontFamily="var(--font-mono)" fill="#8a8f84">{work.length} 篇 · 本地版本</text>
     {work.map(p=>{
      const bucket=work.filter(a=>bucketKey(a)===bucketKey(p));
      const i=bucket.findIndex(a=>a.id===p.id),month=monthOf(p),spanN=Math.min(bucket.length,3);
      const cx=xTime(timeValue(p))+(i%3-(spanN-1)/2)*7;
      const cy=ys[ri]+16+Math.floor(i/3)*14;
      return <g className="timeline-point" key={p.id} role="button" tabIndex={0} aria-label={'查看 '+p.title}
       onClick={()=>open(p)}
       onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(p)}}}>
       <title>{stampOf(p)} · {p.title}\n{p.yearBasis||''}\n{p.problem||''}</title>
       <circle cx={cx} cy={cy} r="5" fill={month?colorOf(t):'#fcfaf5'} stroke={colorOf(t)} strokeWidth="1.5"/>
      </g>;
     })}
    </g>;
   })}
  </svg>
 </div>
 <div className="viz-legend"><span>横轴：本地版本月份</span><span>纵轴：研究主题</span><span>实心：月份依据</span><span>空心：仅年份</span><span>短虚线：季度</span><span>点击圆点查看依据</span></div>
 </section>
 {undated.length>0&&<details className="undated-list"><summary>年份待核验 · {undated.length} 项</summary>{undated.map(p=><button key={p.id} onClick={()=>open(p)}>{p.title}</button>)}</details>}
 </>;
}
