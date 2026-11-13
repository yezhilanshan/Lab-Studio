const ts=require('typescript'),fs=require('node:fs'),assert=require('node:assert/strict');
function moduleFrom(path,load=require){const out=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const exports={};new Function('exports','require',out)(exports,load);return exports}
const {validateTree}=moduleFrom('lib/tree-validation.ts');
const node=(id,parent,idea='idea1')=>({id,parent,idea,kind:'node'});
assert.equal(validateTree([node('r',''),node('a','r')]),'');
assert.match(validateTree([node('a','b'),node('b','a')]),/循环/);
assert.match(validateTree([node('a','missing')]),/父节点/);
assert.match(validateTree([node('r','','idea2'),node('a','r')]),/同一个想法/);
const {paperMarkdown,applyPaperMarkdown,mergePaperFields}=moduleFrom('lib/paper-markdown.ts');
const paper={id:'paper',kind:'paper',title:'Paper',problem:'旧问题',difficulty:'难点一\n难点二',notes:'旧笔记',documentId:'source'};
const initial=paperMarkdown(paper);
assert.match(initial,/- 难点一\n- 难点二/);
const source=initial.replace('旧笔记','**新笔记**')+'\n## 附录\n\n```md\n## 解决什么问题\n代码示例\n```\n';
const updated=applyPaperMarkdown(paper,source);
assert.equal(updated.notes,'**新笔记**');
assert.equal(updated.problem,paper.problem);
assert.equal(updated.difficulty,paper.difficulty);
assert.equal(updated.documentId,paper.documentId);
assert.equal(paperMarkdown(updated),source);
const merged=mergePaperFields(updated,{...updated,problem:'API 更新'});
assert.match(merged.readingMarkdown,/## 解决什么问题\n\nAPI 更新/);
assert.ok(merged.readingMarkdown.endsWith('## 附录\n\n```md\n## 解决什么问题\n代码示例\n```\n'));
assert.equal(mergePaperFields(updated,{...updated,year:'2026'}).readingMarkdown,source);
const format=moduleFrom('lib/paper-format.ts');
const {readPaperTable,paperTableCellEdit,editPaperTable,tableCellText}=moduleFrom('lib/paper-table.ts');
const tableSource='方法 | 得分\n--- | ---:\nA\\|B | 92%\n缺项';
const table=readPaperTable(tableSource);
assert.equal(tableCellText(table.rows[1][0]),'A|B');
const cellEdit=paperTableCellEdit(table,2,1,'表格|单元格');
assert.equal(tableSource.slice(cellEdit.from,cellEdit.to),'缺项');
assert.equal(cellEdit.insert,'| 缺项 | 表格\\|单元格 |');
assert.equal(paperTableCellEdit(table,1,0,'A|B'),null);
assert.match(editPaperTable(table,'column-add',1,0).source,/\| --- \| --- \| ---: \|/);
assert.match(editPaperTable(table,'center',1,1).source,/\| --- \| :---: \|/);
assert.equal(editPaperTable(table,'row-remove',0,0),null);
assert.equal(editPaperTable(table,'row-remove',1,0).source,'方法 | 得分\n--- | ---:\n缺项');
assert.equal(editPaperTable(table,'column-remove',1,1).source,'| 方法 |\n| --- |\n| A\\|B |\n| 缺项 |');
assert.match(editPaperTable(table,'row-add',0,1).source,/---:\n\|  \|  \|\nA\\\|B/);
const {renderPaperMarkdown}=moduleFrom('lib/paper-markdown-render.ts',name=>name==='./paper-format'?format:require(name));
function applyFormat(source,from,to,command){
 const {changes,anchor,head}=format.paperFormatEdit(source,from,to,command);
 let result='',offset=0;
 for(const change of changes){result+=source.slice(offset,change.from)+change.insert;offset=change.to}
 return {text:result+source.slice(offset),anchor,head};
}
assert.deepEqual(applyFormat('研究',0,2,'bold'),{text:'**研究**',anchor:2,head:4});
assert.equal(applyFormat('**研究**',2,4,'bold').text,'研究');
assert.equal(applyFormat('==🔵研究==',4,6,'red').text,'==🔴研究==');
assert.equal(applyFormat('\n段落',0,0,'h2').text,'## \n段落');
assert.equal(applyFormat('甲\n乙',0,3,'numbered').text,'1. 甲\n2. 乙');
assert.equal(applyFormat('- [x] 甲',0,0,'task').text,'- [x] 甲');
const insertedFootnote=applyFormat('结论',0,2,'footnote');
assert.equal(insertedFootnote.text,'结论[^1]\n\n[^1]: 脚注内容');
assert.equal(insertedFootnote.text.slice(insertedFootnote.anchor,insertedFootnote.head),'脚注内容');
const rendered=renderPaperMarkdown([
 '## 研究笔记','', '这是 **加粗** 和 _斜体_，~~删除~~、==🔵**重点**==、$x^2$ 与 `%%原样%%`。%%隐藏行内%%',
 '', '%%\n## 隐藏标题\n\n隐藏块\n%% 可见尾部', '', '[[第二篇#方法|相关方法]] 和 [普通章节](#研究笔记)', '',
 '- [x] 阅读完成', '  - [ ] 核对结果', '', '> [!warning]- 可折叠', '> **证据**', '> > [!tip] 嵌套提示', '> > 内容', '',
 '$$\n\\sum_{i=1}^n x_i\n$$', '', '| 方法 | 结果 |\n| --- | --- |\n| A | 92% |', '',
 '```python\ndef func():\n    return 1\n```', '', insertedFootnote.text, '',
 '块引用位置 ^target', '', '![示意|100x50](https://example.test/a.png)', '',
 '[不安全](javascript:alert%281%29)', '<script>alert(1)</script>',
].join('\n'));
for(const pattern of [/data-notebook-heading="研究笔记"/,/<strong>加粗/,/<em>斜体/,/<s>删除/,/<mark data-color="blue"><strong>重点/,/class="katex"/,/katex-display/,/原样/,/可见尾部/,/data-notebook-link="第二篇#方法"/,/data-notebook-link="#研究笔记"/,/type="checkbox"[^>]+checked/,/data-type="warning"/,/data-type="tip"/,/<table/,/hljs-keyword/,/footnote-ref/,/脚注内容/,/data-notebook-block="target"/,/width="100" height="50"/]) assert.match(rendered,pattern);
assert.doesNotMatch(rendered,/隐藏行内|隐藏标题|隐藏块|href="javascript:|<script>/);
const {POST}=moduleFrom('app/api/summarize/route.ts');
const request=x=>new Request('https://workbench.example/api/summarize',{method:'POST',headers:{Origin:'https://workbench.example','Content-Type':'application/json'},body:JSON.stringify(x)});
(async()=>{
 const fixture={baseUrl:'https://provider.example/v1',model:'test-model',apiKey:'local-test-key',text:'paper text '.repeat(30)};
 assert.equal((await POST(request({...fixture,baseUrl:'http://127.0.0.1'}))).status,400);
 assert.equal((await POST(request({...fixture,baseUrl:'https://provider.example@127.0.0.1'}))).status,400);
 assert.equal((await POST(request({...fixture,apiKey:''}))).status,400);
 const old=global.fetch;let seen;
 try{global.fetch=async(url,opts)=>{seen={url:String(url),opts};return Response.json({choices:[{message:{content:JSON.stringify({problem:'P',difficulty:'D',solution:'S',limitations:'L',borrow:'B'})}}]})};
 const result=await POST(request(fixture));assert.equal(result.status,200);const output=await result.json();assert.equal(output.summary.solution,'S');assert.equal(output.apiKey,undefined);assert.equal(seen.url,'https://provider.example/v1/chat/completions');assert.equal(seen.opts.redirect,'manual');
 let calls=0;global.fetch=async()=>{calls++;return new Response('',{status:302,headers:{Location:'https://redirect.example/target'}})};const redirect=await POST(request(fixture));assert.equal(redirect.status,502);assert.match((await redirect.json()).error,/重定向/);assert.equal(calls,1,'Redirect must not trigger a follow-up provider request');
 global.fetch=async()=>Response.json({choices:[{message:{content:'not JSON'}}]});assert.equal((await POST(request(fixture))).status,502);
 global.fetch=async()=>new Response('provider diagnostic',{status:401});const failure=await POST(request(fixture));assert.equal(failure.status,502);assert(!(await failure.text()).includes('provider diagnostic'));
 }finally{global.fetch=old}
 console.log('Passed: tree parent/cycle/idea checks; summary endpoint URL/key/JSON/error checks. Provider calls mocked; no paid request.');
})().catch(e=>{console.error(e);process.exitCode=1});
