// Run with npm run test:paper-editor while the local workbench is running.
if (typeof taskSpace !== 'function') {
  const {spawnSync} = await import('node:child_process');
  const run = spawnSync('ego-browser', ['nodejs', '-e', `await import(${JSON.stringify(import.meta.url)})`], {stdio:'inherit'});
  if (run.error) throw run.error;
  process.exit(run.status ?? 1);
}
const task = await taskSpace('SEER paper editor regression');
const page = task.page('p1');
const url = 'http://127.0.0.1:5173/#library';
const search = 'input[aria-label="搜索文献"]';
const editor = '.cm-content[aria-label="文献 Markdown 编辑区"]';
const suffix = Date.now();
const cases = [
  ['引用退出与列表续行', '> 引用内容\n\n- 项目'],
  ['公式与代码的方向键', '公式前\n\n$$\nx^2\n$$\n\n```js\nconsole.log(1)\n```\n\n代码后'],
  ['表格编辑、结构与保存', '上方\n\n| 方法 | 结果 |\n| --- | ---: |\n| 雷达 | 92% |\n\n下方'],
  ['插入表格与直接输入', '新文献'],
  ['预览内换行与选区', '起始段落\n**粗体** 和 _斜体_\n结束段落'],
  ['视觉折行与任务框', '起始\n'+'换行测试'.repeat(64)+'\n\n- [ ] 完成任务\n\n末尾'],
  ['格式菜单、颜色与单元格选区', '## 当前标题\n\n选中内容\n\n| 名称 | 数值 |\n| --- | --- |\n| 单元格 | 1 |\n\n尾段'],
  ['正文渲染与阅读一致性', [
    '## 一级段落', '这里有 **加粗**、_倾斜_、~~删除~~、==🟢高亮==、`inline` 和脚注[^method]。',
    '> 引用第一行\n引用延续行', '- [x] 已完成\n- [ ] 待完成', '> [!warning]- 折叠标注\n> 标注正文',
    '| 项目 | 结果 |\n| --- | ---: |\n| '+'较长的表格单元格内容'.repeat(18)+' | 92% |',
    '```js\nconst value = 1;\n```', '$$\nx^2 + y^2 = 1\n$$', '[^method]: 脚注正文。',
  ].join('\n\n')],
];
const records = cases.map(([title, readingMarkdown], i) => ({id:`qa-notebook-${suffix}-${i}`,kind:'paper',title:`QA ${title} ${suffix}`,theme:'待归类',catalogScope:'manual',readingMarkdown}));
const post = items => page.fetch('/api/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(items)});
const press = key => page.keyboard.press(key);
const assert = (condition, message) => {if (!condition) throw Error(message);};
const at = async () => page.evaluate(() => {
  const anchor = getSelection()?.anchorNode;
  return (anchor instanceof Element ? anchor : anchor?.parentElement)?.closest('.cm-line')?.textContent ?? null;
});
const lines = () => page.evaluate(() => [...document.querySelectorAll('.cm-line')].map(row => row.textContent));
const sourceMode = () => page.click('loc=role:button[name="源码"]');
const focusCell = () => page.evaluate(() => document.activeElement?.getAttribute('data-table-cell'));

async function open(index) {
  await page.reload(); await page.waitForSelector(search);
  await page.fill(search, records[index].title);
  await page.click(`loc=role:button[name="${records[index].title}"]`);
  await page.waitForSelector('[aria-label="Markdown 阅读区"]');
  await press('Control+e'); await page.waitForSelector(editor);
  await page.waitForFunction(() => document.activeElement?.classList.contains('cm-content'));
}

const tests = [
  async () => {
    await press('Control+Home'); await press('End'); await press('Enter');
    assert(/^>\s*$/.test(await at()), `Expected empty continuation, got ${JSON.stringify(await at())}`);
    await press('Enter');
    assert(await at()==='', `Empty quote should end with one Enter: ${JSON.stringify(await lines())}`);
    await page.keyboard.insertText('退出引用');
    await press('Control+End'); await press('Enter');
    assert(/^[-*+]\s*$/.test(await at()), `List continuation regressed: ${JSON.stringify(await lines())}`);
    await press('Enter');
    assert(await at()==='', `Empty list item should exit: ${JSON.stringify(await lines())}`);
  },
  async () => {
    await press('Control+Home'); await press('ArrowDown'); await press('ArrowDown');
    assert(await at()==='$$', `Down should reach formula opener: ${JSON.stringify(await at())}`);
    await press('ArrowDown'); assert(await at()==='x^2','Down skipped formula content');
    await press('ArrowUp'); assert(await at()==='$$','Up skipped formula opener');
    await press('ArrowUp'); assert(await at()==='', 'Up should return to preceding blank line');
    await press('Control+End'); await press('ArrowUp'); await press('ArrowUp');
    assert(await at()==='```','Up should reach code closer');
    await press('ArrowUp'); assert(await at()==='console.log(1)','Up skipped code content');
  },
  async () => {
    const first=editor+' input[data-table-cell="0,0"]';
    await page.waitForSelector(first,{timeout:4000});
    await page.click(first);
    await press('Control+a'); await page.keyboard.insertText('方法 A|B');
    await press('Tab'); assert(await focusCell()==='0,1','Tab did not advance to next column');
    await press('ArrowDown'); assert(await focusCell()==='1,1','Down did not advance to same column');
    await press('Shift+Tab'); assert(await focusCell()==='1,0','Shift+Tab did not return to previous column');
    await page.click('loc=role:button[name="添加行"]');
    await page.waitForSelector(editor+' input[data-table-cell="2,0"]');
    await page.click('loc=role:button[name="添加列"]');
    await page.waitForSelector(editor+' input[data-table-cell="0,2"]');
    await page.click(editor+' input[data-table-cell="2,1"]');
    await page.click('loc=role:button[name="删除列"]');
    await page.waitForSelector(editor+' input[data-table-cell="0,2"]',{state:'hidden'});
    await page.click(editor+' input[data-table-cell="1,0"]');
    await press('Control+a'); await page.keyboard.insertText('直接保存');
    await press('Control+a'); await press('Control+b');
    await press('Control+z');
    assert(await page.evaluate(()=>document.activeElement?.value==='直接保存'), 'Undo should remove only the cell formatting');
    await press('Control+Shift+z'); await press('Control+s');
    await page.waitForFunction(async id=>{
      const rows = await (await fetch('/api/records',{cache:'no-store'})).json();
      const saved = rows.find(item=>item.id===id)?.readingMarkdown;
      return saved?.includes('方法 A\\|B') && saved.includes('**直接保存**') && saved.includes('---:');
    }, records[2].id, {polling:300}).catch(()=>{throw Error('Table changes did not persist as Markdown');});
    await press('Escape');
    await press('ArrowUp');
    assert(await focusCell()==='2,0','Up from text after the table did not enter its last row');
  },
  async () => {
    await press('Control+End'); await press('Control+Alt+t');
    await page.waitForFunction(()=>document.activeElement?.getAttribute('data-table-cell')==='0,0',undefined,{timeout:4000});
    await page.keyboard.insertText('列名'); await press('Tab');
    assert(await focusCell()==='0,1','New table does not accept keyboard editing');
    await sourceMode();
    assert((await lines()).some(line=>line.includes('| 列名 |')), 'Changing to source lost a table edit');
  },
  async () => {
    await press('Control+Home'); await press('ArrowDown');
    assert((await at())?.includes('粗体'), 'Down skipped formatted text');
    await press('ArrowDown'); assert(await at()==='结束段落','Down skipped next text line');
    await press('Shift+ArrowUp');
    assert((await page.evaluate(()=>getSelection()?.toString()))?.includes('斜体'),'Shift+Up lost the text selection');
  },
  async () => {
    await press('Control+Home'); await press('ArrowDown');
    assert((await at())?.startsWith('换行测试'), 'Did not reach the wrapped paragraph');
    const caretOffset = () => page.evaluate(()=>getSelection()?.anchorOffset ?? 0);
    const first = await caretOffset();
    await press('ArrowDown');
    assert((await at())?.startsWith('换行测试') && await caretOffset() > first, 'Down should remain on the next visual row');
    await press('ArrowUp');
    assert((await at())?.startsWith('换行测试'), 'Up should remain on the wrapped paragraph');
    await press('Control+End');
    const checkbox = editor+' .notebook-live-task';
    await page.focus(checkbox); await press('Space');
    await page.waitForFunction(()=>document.querySelector('.notebook-live-task')?.checked===true);
  },
  async () => {
    const menu = name => page.click(`loc=role:button[name="${name}"]`);
    const item = name => page.click(`loc=role:menuitem[name*="${name}"]`);
    await press('Control+Home');
    await menu('段落设置');
    await page.waitForSelector('[role="menu"][aria-label="段落设置"] [aria-current="true"]');
    const active = await page.evaluate(()=>document.querySelector('[role="menu"][aria-label="段落设置"] [aria-current="true"]')?.textContent);
    assert(active?.includes('2 级标题'), `Current heading indicator: ${active}`);
    await press('Escape');
    await page.click('.cm-content .cm-line:text-is("选中内容")');
    await press('Home'); await press('Shift+End');
    assert(await page.evaluate(()=>getSelection()?.toString())==='选中内容', 'Keyboard menu fixture text was not selected');
    await page.focus('loc=role:button[name="文本格式"]'); await press('Enter');
    await page.waitForSelector('[role="menu"][aria-label="文本格式"]');
    await press('Home');
    await page.waitForFunction(()=>document.activeElement?.getAttribute('role')==='menuitem' && document.activeElement.textContent.includes('加粗'));
    await press('Enter');
    await page.waitForFunction(()=>[...document.querySelectorAll('.cm-line')].some(row=>row.textContent.includes('**选中内容**')))
      .catch(()=>{throw Error('Keyboard menu did not format the selected text');});
    await menu('文本格式');
    await item('高亮');
    await page.waitForSelector('[role="menu"][aria-label="高亮颜色"]');
    await item('蓝色高亮');
    await page.waitForFunction(()=>[...document.querySelectorAll('.cm-line')].some(row=>row.textContent.includes('==🔵选中内容==')))
      .catch(()=>{throw Error('Color submenu did not apply the selected highlight');});
    const cell = editor+' input[data-table-cell="1,0"]';
    await page.focus(cell); await press('Control+a');
    await menu('段落设置');
    await page.waitForSelector('[role="menu"][aria-label="段落设置"] [role="menuitem"][aria-disabled="true"]');
    await press('Escape');
    await page.focus(cell); await press('Control+a');
    await menu('文本格式'); await item('倾斜');
    assert(await page.evaluate(()=>document.activeElement?.value)==='_单元格_', 'Menu action must format the selected cell and restore its focus');
    await press('Escape'); await press('Control+End');
    await menu('插入'); await item('分隔线');
    await page.waitForSelector(editor+' hr');
  },
  async () => {
    await page.waitForSelector(editor+' .notebook-live-footnote');
    const live = await page.evaluate(() => {
      const root = document.querySelector('.cm-content');
      const heading = root.querySelector('.notebook-live-h2');
      const longCell = root.querySelector('td .notebook-table-cell-preview');
      const headCell = root.querySelector('th .notebook-table-cell-preview');
      return {underline: [heading, ...heading.querySelectorAll('*')].some(item=>getComputedStyle(item).textDecorationLine.includes('underline')),
        size: getComputedStyle(heading).fontSize, footnote:root.querySelector('.notebook-live-footnote')?.textContent,
        code: root.querySelector('.notebook-code-block figcaption')?.textContent, formula: Boolean(root.querySelector('.notebook-math .katex-display')),
        callout: root.querySelector('details[data-type=warning]')?.open, quoteLines:root.querySelectorAll('.notebook-live-quote').length,
        wrapped: longCell.getBoundingClientRect().height > headCell.getBoundingClientRect().height,
        completed: Boolean(root.querySelector('.notebook-live-completed input:checked')),
        taskHeight:root.querySelector('.notebook-live-task')?.getBoundingClientRect().height};
    });
    assert(!live.underline && live.footnote==='[1]' && live.code==='js' && live.formula && live.callout===false && live.quoteLines===2 && live.wrapped && live.completed && live.taskHeight<=16, `Live document layout: ${JSON.stringify(live)}`);
    await press('Control+e');
    await page.waitForSelector('[aria-label="Markdown 阅读区"] .notebook-footnote-title');
    const read = await page.evaluate(() => {
      const root = document.querySelector('[aria-label="Markdown 阅读区"]');
      return {size:getComputedStyle(root.querySelector('h2')).fontSize, code:root.querySelector('.notebook-code-block figcaption')?.textContent,
        footnote:root.querySelector('.footnote-ref a')?.textContent, aligned:getComputedStyle(root.querySelector('.notebook-table-frame td:last-child')).textAlign,
        mark:root.querySelector('mark[data-color=green]')?.textContent, callout:root.querySelector('details[data-type=warning]')?.open};
    });
    assert(read.size===live.size && read.code===live.code && read.footnote===live.footnote && read.aligned==='right' && read.mark==='高亮' && read.callout===false, `Reading document layout: ${JSON.stringify(read)}`);
  },
];

await page.goto(url);
await page.reload(); await page.waitForSelector(search);
const created=await post(records);
if(!created.ok)throw Error(created.body);
const failures=[];
try {
  for (let index=0;index<tests.length;index++) {
    try {await open(index); await tests[index](); console.log(`PASS ${cases[index][0]}`);}
    catch(error) {failures.push(cases[index][0]); console.log(`FAIL ${cases[index][0]}\n${error.message}`);}
  }
} finally {
  const ids=new Set(records.map(record=>record.id));
  const stored=JSON.parse((await page.fetch('/api/records')).body).filter(item=>ids.has(item.id));
  if(stored.length)await post(stored.map(item=>({...item,deleted:true})));
}
if(failures.length)throw Error(`${failures.length} regression test(s) failed: ${failures.join('、')}`);
await task.finish({keep:[]});
