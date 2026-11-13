export function validateTree(rows:{id:string;kind:string;[k:string]:unknown}[]){
 const nodes=new Map(rows.filter(r=>r.kind==='node'&&!r.deleted).map(r=>[r.id,r]));
 for(const n of nodes.values()){
  if(!/^idea[1-6]$/.test(String(n.idea)))return '节点必须属于六个想法之一';
  const path=new Set<string>();let current:typeof n|undefined=n;
  while(current){if(path.has(current.id))return '节点不能形成循环';path.add(current.id);const p=String(current.parent||'');if(!p)break;const parent=nodes.get(p);if(!parent)return '请先移动子节点，再删除它们的父节点';if(parent.idea!==n.idea)return '父节点必须属于同一个想法';current=parent;}
 }
 return '';
}
