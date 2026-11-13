type TreeRecord={id:string;parent?:unknown;status?:unknown;title?:unknown};
export type MindmapNode={id:string;x:number;y:number;width:number;height:number;depth:number;branch:number;childCount:number;descendants:number;completed:number;experiments:number;collapsed:boolean};
type Tree={record:TreeRecord;children:Tree[];depth:number;branch:number;descendants:number;completed:number;experiments:number};
export function buildMindmap(records:TreeRecord[],rootId:string,folded:Set<string>,filter:string){
 const byId=new Map(records.map(r=>[r.id,r]));
 const children=new Map<string,TreeRecord[]>();
 for(const r of records){if(r.id===rootId)continue;const parent=String(r.parent||'');children.set(parent,[...(children.get(parent)||[]),r]);}
 function make(id:string,path:Set<string>,depth=0,branch=-1):Tree|null{
  if(path.has(id)||depth>100)return null;
  const record=byId.get(id)||{id};const nextPath=new Set(path).add(id);
  const sub=(children.get(id)||[]).map((r,i)=>make(r.id,nextPath,depth+1,depth===0?i:branch)).filter((t):t is Tree=>Boolean(t));
  const experiment=depth>0&&!['阶段','研究路线'].includes(String(record.status));
  return {record,children:sub,depth,branch,descendants:sub.reduce((n,t)=>n+1+t.descendants,0),completed:Number(experiment&&['已实验','已完成'].includes(String(record.status)))+sub.reduce((n,t)=>n+t.completed,0),experiments:Number(experiment)+sub.reduce((n,t)=>n+t.experiments,0)};
 }
 const root=make(rootId,new Set())!;
 let matchingCount=0;
 const countMatching=(tree:Tree)=>{if(tree.depth>0&&(filter==='全部状态'||tree.record.status===filter))matchingCount++;tree.children.forEach(countMatching)};
 countMatching(root);
 type Visible={tree:Tree;children:Visible[];height:number;width:number;span:number};
 function visible(tree:Tree):Visible|null{
  const sub=tree.children.map(visible).filter((t):t is Visible=>Boolean(t));
  if(filter!=='全部状态'&&tree.depth>0&&tree.record.status!==filter&&!sub.length)return null;
  const shown=filter==='全部状态'&&folded.has(tree.record.id)?[]:sub;
  const height=tree.depth===0?166:tree.children.length?154:142,width=tree.depth===0?286:tree.children.length?300:322;
  return {tree,children:shown,height,width,span:Math.max(height,shown.reduce((n,t)=>n+t.span,0)+Math.max(0,shown.length-1)*22)};
 }
 const view=visible(root)!;const nodes:MindmapNode[]=[],edges:{from:string;to:string;branch:number}[]=[];
 function place(t:Visible,top:number){
  const {tree}=t;
  nodes.push({id:tree.record.id,x:tree.depth*366+40,y:top+(t.span-t.height)/2+40,width:t.width,height:t.height,depth:tree.depth,branch:tree.branch,childCount:tree.children.length,descendants:tree.descendants,completed:tree.completed,experiments:tree.experiments,collapsed:filter==='全部状态'&&folded.has(tree.record.id)&&tree.children.length>0});
  let childTop=top+(t.span-(t.children.reduce((n,c)=>n+c.span,0)+Math.max(0,t.children.length-1)*22))/2;
  for(const child of t.children){edges.push({from:tree.record.id,to:child.tree.record.id,branch:child.tree.branch});place(child,childTop);childTop+=child.span+22;}
 }
 place(view,0);
 return {nodes,edges,width:Math.max(...nodes.map(n=>n.x+n.width))+40,height:view.span+80,matchingCount};
}
