const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
assert(fs.existsSync('lib/mindmap-layout.ts'),'Tree mind-map layout has not been implemented');
const output=ts.transpileModule(fs.readFileSync('lib/mindmap-layout.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exportsObject={};new Function('exports',output)(exportsObject);
const {buildMindmap}=exportsObject;
const fixture=[{id:'r',parent:'',status:'研究路线'},{id:'a',parent:'r',status:'阶段'},{id:'b',parent:'r',status:'阶段'},{id:'done',parent:'a',status:'已实验'},{id:'plan',parent:'a',status:'计划中'},{id:'deep',parent:'done',status:'已完成'},{id:'other',parent:'b',status:'计划中'}];
const graph=buildMindmap(fixture,'r',new Set(),'全部状态');
assert.equal(graph.nodes.length,7);assert.equal(graph.edges.length,6);
for(const edge of graph.edges){const p=graph.nodes.find(n=>n.id===edge.from),c=graph.nodes.find(n=>n.id===edge.to);assert(c.x>p.x+p.width,'Children must lie beyond parents');}
for(let i=0;i<graph.nodes.length;i++)for(let j=i+1;j<graph.nodes.length;j++){const a=graph.nodes[i],b=graph.nodes[j];assert(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'Node cards overlap');}
const collapsed=buildMindmap(fixture,'r',new Set(['a']),'全部状态');
assert.deepEqual(new Set(collapsed.nodes.map(n=>n.id)),new Set(['r','a','b','other']));
const filtered=buildMindmap(fixture,'r',new Set(['a']),'已完成');
assert.deepEqual(new Set(filtered.nodes.map(n=>n.id)),new Set(['r','a','done','deep']),'Status filter must retain and expand ancestor paths');
assert.equal(buildMindmap([{id:'r',parent:''}],'r',new Set(),'全部状态').nodes.length,1);
const cycle=buildMindmap([{id:'r',parent:'b'},{id:'b',parent:'r'}],'r',new Set(),'全部状态');assert(cycle.nodes.length<=2);
const seed=JSON.parse(fs.readFileSync('app/tree-seed.json','utf8'));
for(let i=1;i<=6;i++){const ns=seed.filter(n=>n.idea==='idea'+i);const g=buildMindmap(ns,'root-idea'+i,new Set(),'全部状态');assert.equal(g.nodes.length,ns.length);assert(g.width>0&&g.height>0);}
console.log('Mind-map verified: directional branches, no card overlap, folding, ancestor-preserving filtering, deep nodes, and all six research trees.');
