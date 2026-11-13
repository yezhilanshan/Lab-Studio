from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[1]
d=json.loads((root/'app/research-data.json').read_text(encoding='utf-8'))
nodes=[]
for i in range(1,7):nodes.append(dict(id='root-idea'+str(i),kind='node',title='想法'+str(i),idea='idea'+str(i),parent='',status='研究路线',notes=''))
for gi,g in enumerate(d['groups']):
 for n in g['items']:
  num=int(n['id'][1:]) if n['id'].startswith('T') else 0
  idea= ('idea1' if n['id']=='I01' else 'idea2' if n['id']=='I02' else 'idea4' if 30<=num<=38 else 'idea5' if 52<=num<=58 else 'idea6' if num>=59 or n['id'].startswith('V') else 'idea3')
  group='stage-'+str(gi)+'-'+idea
  if not any(x['id']==group for x in nodes):nodes.append(dict(id=group,kind='node',title=g['title'],idea=idea,parent='root-'+idea,status='阶段',notes=g['conclusion']))
  nodes.append(dict(id='node-'+n['id'],kind='node',title=n['title'],idea=idea,parent=group,status=n['status'],notes=n['result'],next=n['next'],evidence=', '.join(n['sourceIds'])))
(root/'app/tree-seed.json').write_text(json.dumps(nodes,ensure_ascii=False,indent=2),encoding='utf-8')
# Literature metadata and claims are carried from local reviewed notes, not invented.
text=(root/'public/evidence/V001.txt').read_text(encoding='utf-8');papers=[];seen=set();section='运动结构监督'
for line in text.splitlines():
 if line.startswith('### '):section=line[4:]
 m=re.match(r'- \[([^]]+)\] \[([^]]+)\]\(([^)]+)\)(.*)',line)
 if not m or m[1] in seen:continue
 seen.add(m[1]);tail=m[4];year=re.search(r'20\d{2}',tail)
 pieces=tail.split('**限制**：',1)
 papers.append(dict(id='lit-'+m[1].lower(),kind='paper',title=m[2],type='论文',category='姿态引导编码',theme='运动结构监督',year=year[0] if year else '',date='2026-11-08',status='阅读中',problem='本地调研主题：'+section,difficulty='需结合原文进一步核对标签质量、坐标约定与迁移条件。',solution=pieces[0].strip(' ：'),limitations=pieces[1].strip() if len(pieces)>1 else '本地笔记未单独列出，待阅读全文补充。',borrow='可作为“'+section+'”的监督或对照参考；雷达迁移收益需同预算实验验证。',url=m[3],notes='从本地3D骨架监督调研导入；元数据与结论沿用该笔记，未在本次重新检索或运行论文。',review='本地调研摘录'))
(root/'app/literature-seed.json').write_text(json.dumps(papers,ensure_ascii=False,indent=2),encoding='utf-8')
print({'tree_nodes':len(nodes),'papers':len(papers)})
