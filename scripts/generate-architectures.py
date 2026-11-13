"""Build six source-grounded, self-contained SVG architecture figures."""
from pathlib import Path
from html import escape as esc
import json, zipfile, xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/architectures'
OUT.mkdir(exist_ok=True)
PALETTE={'input':('#f0f3f5','#9eafb8','#496270'),'encode':('#edf3fa','#91aec8','#426881'),'state':('#eaf4ef','#87af9b','#356759'),'control':('#fbf3e5','#cdb27c','#876b36'),'memory':('#f1eef9','#ad9dc9','#715d91'),'llm':('#315e58','#315e58','#ffffff'),'output':('#edf5ee','#8aaf90','#4e7853'),'train':('#f5eff8','#b9a0cc','#88629b')}

class Figure:
    def __init__(self,num,title,subtitle,status,notes,sources):
        self.num=num;self.title=title;self.subtitle=subtitle;self.status=status;self.notes=notes;self.sources=sources
        self.boxes=[];self.edges=[];self.labels=[];self.groups=[];self.ids=set()
    def group(self,x,y,w,h,label):
        self.groups.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="18" fill="#f7faf8" stroke="#e1e9e4"/><text x="{x+20}" y="{y+27}" class="group">{esc(label)}</text>')
    def node(self,id,x,y,w,h,title,body='',kind='state'):
        assert id not in self.ids;self.ids.add(id)
        fill,stroke,color=PALETTE[kind]
        titles=title.split('|');bodies=body.split('|') if body else []
        title_y=y+30 if len(titles)+len(bodies)>2 else y+36
        size=19 if max(map(len,titles))<22 else 17
        text=''.join(f'<text x="{x+w/2}" y="{title_y+i*25}" text-anchor="middle" fill="{color}" font-size="{size}" font-weight="600">{esc(line)}</text>' for i,line in enumerate(titles))
        by=title_y+len(titles)*25+1
        text+=''.join(f'<text x="{x+w/2}" y="{by+i*22}" text-anchor="middle" fill="{color}" opacity=".82" font-size="15">{esc(line)}</text>' for i,line in enumerate(bodies))
        self.boxes.append(f'<g data-node="{id}"><title>{esc(title.replace("|"," / ")+"; "+body.replace("|"," / "))}</title><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>{text}</g>')
    def edge(self,points,kind='data',label='',at=None):
        colors={'data':'#75938b','control':'#b1945d','train':'#9d80b3'}
        dash='' if kind=='data' else ' stroke-dasharray="7 5"'
        p=' '.join(f'{x},{y}' for x,y in points)
        self.edges.append(f'<polyline points="{p}" fill="none" stroke="{colors[kind]}" stroke-width="2"{dash} marker-end="url(#{kind})" stroke-linejoin="round"/>')
        if label:
            x,y=at;w=max(44,len(label)*14+18)
            self.labels.append(f'<g><rect x="{x-w/2}" y="{y-17}" width="{w}" height="24" rx="5" fill="#fcfdfb"/><text x="{x}" y="{y}" text-anchor="middle" class="label" fill="{colors[kind]}">{esc(label)}</text></g>')
    def save(self):
        markers=''.join(f'<marker id="{k}" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke="{v}" stroke-width="1.3"/></marker>' for k,v in {'data':'#75938b','control':'#b1945d','train':'#9d80b3'}.items())
        legend=''
        for x,k,t in [(48,'data','数据与表示'),(255,'control','状态 / 控制反馈'),(510,'train','训练 / 评价辅助')]:
            color={'data':'#75938b','control':'#b1945d','train':'#9d80b3'}[k]
            dash='' if k=='data' else 'stroke-dasharray="7 5"'
            legend+=f'<line x1="{x}" y1="132" x2="{x+36}" y2="132" stroke="{color}" stroke-width="2" {dash}/><text x="{x+46}" y="137" class="label">{t}</text>'
        footer=f'<rect x="42" y="770" width="1356" height="105" rx="12" fill="#f2f5f1"/><text x="62" y="799" font-size="15" font-weight="600" fill="#547569">图示边界 · {esc(self.status)}</text>'
        footer+=''.join(f'<text x="62" y="{825+i*24}" font-size="15" fill="#7b8d83">{esc(t)}</text>' for i,t in enumerate(self.notes))
        svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 900" width="1440" height="900" role="img" aria-labelledby="title desc">
<title id="title">想法{self.num}：{esc(self.title)}整体架构</title><desc id="desc">{esc(self.subtitle+'。'+'；'.join(self.notes))}</desc><defs>{markers}</defs>
<style>text{{font-family:'Microsoft YaHei','PingFang SC','Noto Sans CJK SC',sans-serif}}.label{{font-size:14px;fill:#80968d}}.group{{font-size:14px;font-weight:600;fill:#8ba097;letter-spacing:1px}}</style>
<rect width="1440" height="900" fill="#fcfdfb"/><text x="48" y="50" font-size="12" fill="#82a291" letter-spacing="2">SEER / IDEA {self.num} / ARCHITECTURE</text>
<text x="48" y="88" font-size="29" fill="#325c52" font-weight="600">{esc(self.title)}</text><text x="48" y="112" font-size="15" fill="#8a9c92">{esc(self.subtitle)}</text>
{legend}{''.join(self.groups)}{''.join(self.edges)}{''.join(self.boxes)}{''.join(self.labels)}{footer}</svg>'''
        ET.fromstring(svg)
        path=OUT/f'idea-{self.num}.svg';path.write_text(svg,encoding='utf-8')
        return dict(number=self.num,title=self.title,url='/architectures/'+path.name,status=self.status,sources=self.sources,nodes=len(self.ids),caption=self.subtitle)

figs=[]
f=Figure(1,'双分支编码 → Event Query → 指令条件语言理解','运动频谱与三维结构并行编码，事件查询负责聚合与时间定位。','原始方案；未附完整架构独立验收',['RD/点云分支与事件查询为原稿架构；不能由后续单模态实验推定本图已整体实现。','若用于在线处理，需单独核验 TCN、查询范围与未来信息泄漏。'],['I001'])
f.node('in',50,320,185,100,'连续毫米波','RD / Point Cloud','input')
f.node('rd',290,205,185,90,'Range-Doppler','运动频谱','input');f.node('pc',290,425,185,90,'Point Cloud','空间位置与结构','input')
f.node('renc',525,205,215,90,'RD Encoder + TCN','独立时序分支','encode');f.node('penc',525,425,215,90,'Point Encoder + TCN','独立时序分支','encode')
f.node('tokens',795,320,215,100,'模态感知 Token','时间编码 + 模态编码','state');f.node('query',1070,320,275,100,'Event Query Decoder','事件查询 + 迭代细化','state')
f.node('boundary',1070,180,275,80,'边界深监督','逐层事件存在 / 起止','train')
f.node('event',1070,600,275,100,'有序事件 Token','剔除空查询 · 按时间排序','state');f.node('proj',795,600,215,100,'Event Projector','雷达 → 语言维度','encode')
f.node('llm',510,600,230,100,'LLM Cross-Attention','文本 Q · 事件 K/V','llm');f.node('out',245,600,205,100,'自然语言输出','连续动作描述','output');f.node('instruction',50,600,150,100,'用户指令','Instruction','input')
for p in [[(235,370),(260,370),(260,250),(290,250)],[(235,370),(260,370),(260,470),(290,470)],[(475,250),(525,250)],[(475,470),(525,470)],[(740,250),(765,250),(765,350),(795,350)],[(740,470),(765,470),(765,390),(795,390)],[(1010,370),(1070,370)],[(1207,420),(1207,600)],[(1070,650),(1010,650)],[(795,650),(740,650)],[(510,650),(450,650)],[(200,650),(220,650),(220,735),(625,735),(625,700)]]: f.edge(p)
f.edge([(1207,320),(1207,260)],'train',label='每层预测边界',at=(1270,290));figs.append(f.save())

f=Figure(2,'Semantic-LIF：变化检测与事件内容分开维护','新颖度超过基线才形成输入电流；Fire 定稿旧 Token，并以当前观测初始化新状态。','原始机制方案；不直接继承 SAEF 实验',['C 是语义比较状态；M/A 是内容累积器；膜电位 V 只累计变化证据。','Keep 持续更新状态；Fire 输出旧事件并重置。原稿中的阈值、训练与归属仍须固定协议验证。'],['I002'])
f.group(505,175,865,420,'SEMANTIC-LIF / 状态分离')
f.node('in',50,330,180,100,'连续雷达流','逐帧观测','input');f.node('enc',280,330,190,100,'Frame + Temporal','时序特征 F_t','encode')
f.node('c',545,225,220,100,'语义状态 C','与 F_t 比较新颖度','state');f.node('nov',820,225,220,100,'Novelty → 电流','I = ReLU(n − b)','control');f.node('lif',1095,225,235,100,'LIF 膜电位 V','泄漏 · 阈值 · Fire','control')
f.node('m',545,455,220,100,'内容累积 M / A','保存当前事件内容','memory');f.node('z',820,455,220,100,'事件 Token Z','Fire 时定稿旧事件','state');f.node('reset',1095,455,235,100,'重置 / 自适应阈值','当前观测初始化新状态','control')
f.node('proj',545,635,220,90,'Projector','事件 → 语言表示','encode');f.node('llm',820,635,220,90,'LLM','按序读取事件 Token','llm');f.node('out',1095,635,235,90,'连续行为描述','有序语言输出','output')
for p in [[(230,380),(280,380)],[(470,380),(495,380),(495,275),(545,275)],[(470,380),(495,380),(495,505),(545,505)],[(765,275),(820,275)],[(1040,275),(1095,275)],[(765,505),(820,505)],[(930,555),(930,605),(655,605),(655,635)],[(765,680),(820,680)],[(1040,680),(1095,680)]]:f.edge(p)
f.edge([(375,330),(375,160),(930,160),(930,225)],label='当前特征 F_t',at=(650,153))
f.edge([(1212,325),(1212,390),(930,390),(930,455)],'control','Fire：定稿',(1045,380))
f.edge([(1212,325),(1212,455)],'control')
f.edge([(1095,505),(1065,505),(1065,575),(520,575),(520,305),(545,305)],'control','Keep 更新 / Fire 重置 C 与 M/A',(775,588))
f.edge([(520,530),(545,530)],'control')
figs.append(f.save())

f=Figure(3,'PSEM v2.6：预测状态 → 重置决策 → 事件记忆','图示采用想法三最新 v2.6 主路径；旧 Proposal / Verify 属于历史版本。','Stage1 No-Go 保持；完整策略为设计路径',['每 0.2 秒的轻量更新属于 v2.6 设计契约；完整 LLM 仅在事件定稿或查询时运行。','冻结目标用于训练预测头；不将预测目标或测试 GT 输入在线重置。当前自主 Reset Policy 验收仍暂缓。'],['I003','S090','S092'])
f.node('in',45,220,185,100,'连续雷达 + 时间戳','RD / Point · 因果输入','input');f.node('enc',280,220,200,100,'Causal Radar|Encoder','Radar Tokens F_t','encode')
f.node('policy',545,220,255,110,'Predictive Event State','旧 / 新生预测评分|Keep / Reset / Defer','control');f.node('former',865,220,245,110,'EventFormer Uθ','旧状态或基础 Prompt|更新为活动状态 E_t','state');f.node('close',1170,220,220,110,'事件关闭 / Seal','暂定分界 + 有限延迟','control')
f.node('motion',280,420,200,90,'Motion Latent m_t','当前观测的紧凑表示','encode');f.node('heads',865,420,245,110,'预测 / 语义 / 证据头','未来运动 · 语义 · 属性','state')
f.node('refine',1170,610,220,110,'边界精修 + 状态修正','旧事件定稿|新活动状态重建','state');f.node('memory',865,610,245,110,'L0 / L1 / L2 记忆','近期事件 → 长时摘要','memory');f.node('llm',545,610,255,110,'Full LLM','Commit / Query 时运行','llm');f.node('out',280,610,200,110,'描述 / 问答 / 时间线','事件级语言输出','output')
f.node('target',45,420,185,100,'冻结目标编码','未来目标 · 仅训练','train')
for p in [[(230,270),(280,270)],[(480,270),(545,270)],[(800,270),(865,270)],[(1110,270),(1170,270)],[(380,320),(380,420)],[(480,465),(510,465),(510,300),(545,300)],[(987,330),(987,420)],[(1280,330),(1280,610)],[(1170,665),(1110,665)],[(865,665),(800,665)],[(545,665),(480,665)]]:f.edge(p)
f.edge([(987,220),(987,175),(675,175),(675,220)],'control','状态 / 历史 / age',(830,165))
f.edge([(1280,610),(1280,565),(1140,565),(1140,355),(987,355),(987,330)],'control','修正活动状态',(1250,555))
f.edge([(230,470),(250,470),(250,550),(985,550),(985,530)],'train','预测目标与监督损失',(665,542))
figs.append(f.save())

f=Figure(4,'离线 Radar-to-Text：冻结编码器下比较两种读出','完整窗口 + 双向时序编码；语言生成与强分类解码共用雷达表征进行比较。','MVP 已运行；LLM 独特优势未证明',['12 秒窗口 / 6 秒步长为现有离线协议；图中的 BiGRU 使用双向上下文，不等同因果在线系统。','严格 482 窗：Qwen 24.69%，HMM 25.52%，预测数量 + 段 Viterbi 27.18%（完整序列正确率）。'],['I004','I004B','S060'])
f.node('input',45,315,185,100,'PARrad 离线窗口','RD + MD','input');f.node('rd',285,205,190,90,'RD CNN','距离–速度特征','encode');f.node('md',285,425,190,90,'MD CNN','微多普勒特征','encode');f.node('gru',535,315,220,100,'特征融合 + BiGRU','完整窗口双向上下文','encode')
f.group(800,170,585,270,'A / 语言生成读出')
f.node('pool',825,215,220,90,'有序时序池化','8 × 256 Radar Tokens','state');f.node('proj',1100,215,250,90,'MLP Projector','256 → 896','encode');f.node('qwen',1100,335,250,90,'冻结 Qwen 0.5B','按动作词序生成描述','llm')
f.group(800,485,585,240,'B / 强分类与符号解码对照')
f.node('head',825,530,220,90,'逐帧分类 / 数量头','同编码器 · 受控比较','state');f.node('decode',1100,530,250,90,'模板 / HMM / Viterbi','概率与数量约束解码','control')
f.node('eval',490,620,265,100,'同协议评价','完整序列 · 覆盖 · 编辑错误','output')
for p in [[(230,365),(255,365),(255,250),(285,250)],[(230,365),(255,365),(255,470),(285,470)],[(475,250),(500,250),(500,345),(535,345)],[(475,470),(500,470),(500,385),(535,385)],[(755,365),(780,365),(780,260),(825,260)],[(1045,260),(1100,260)],[(1225,305),(1225,335)],[(755,365),(780,365),(780,575),(825,575)],[(1045,575),(1100,575)],[(1225,425),(1400,425),(1400,740),(622,740),(622,720)],[(1225,620),(1225,670),(755,670)]]:f.edge(p)
f.node('labels',45,620,185,100,'固定评价标签','仅离线计分使用','train')
f.edge([(230,670),(490,670)],'train','同划分与指标',(355,660))
figs.append(f.save())

f=Figure(5,'Latent Memory：持续写入，查询内反复检索与演化','三尺度外部记忆不按动作边界切分；固定描述任务在每次查询内部进行多轮演化。','v1.0 总体方案；G0 未通过，G2 未启动',['三组访问范围：Short→S，Mid→S∪M，Long→S∪M∪L；容量、迭代轮数及编码器细节待定。','反馈仅表示一次查询内的 Evolved LMT 重新检索；跨查询周期是否继承 LMT 状态尚未确认。'],['I005','S095'])
f.node('input',45,235,185,100,'连续毫米波流','不显式切动作段','input');f.node('enc',280,235,215,100,'Radar Encoder','连续时序特征','encode');f.node('mem',555,200,245,170,'三尺度外部记忆','Short：近期细节|Mid：中期历史|Long：长期证据','memory')
f.node('q',45,510,185,110,'固定描述指令','+ 初始三组 LMT|定期查询时触发','input');f.node('boot',280,510,215,110,'Bootstrap Forward','冻结 LLM 前向|取 LMT 隐藏状态','llm')
f.group(535,425,845,310,'HME / 单次查询内部的迭代环')
f.node('retr',565,490,225,110,'LMT 引导分层检索','按组限定可见记忆|相关历史证据','memory');f.node('inject',840,490,225,110,'按组注入证据','三组 LMT 上下文','state');f.node('update',1115,490,225,110,'冻结 LLM 更新','Evolved LMT','llm')
f.node('out',1115,225,225,110,'LLM 生成描述','截至当前的有序行为','output');f.node('evolved',840,225,225,110,'最终 Evolved LMT','本次查询的潜在证据','state')
for p in [[(230,285),(280,285)],[(495,285),(555,285)],[(230,565),(280,565)],[(495,565),(565,565)],[(678,370),(678,490)],[(790,545),(840,545)],[(1065,545),(1115,545)],[(1228,490),(1228,395),(952,395),(952,335)],[(1065,280),(1115,280)]]:f.edge(p)
f.edge([(600,370),(600,400),(388,400),(388,510)],label='按组读取记忆',at=(440,391))
f.edge([(1228,600),(1228,675),(678,675),(678,600)],'control','下一轮：更新后的 LMT 重新检索',(952,667))
figs.append(f.save())

f=Figure(6,'SAEF：内容状态与证据膜电位并行，发火后回溯边界','保留语义证据驱动触发、真实边界回溯、状态重建与 Global-Detail 事件表示。','SAEF MVP 已评估；图中完整语言 / 记忆链按方案示意',['Fire 时刻不是语义边界：先短缓存回溯，再定稿旧事件并重建活动状态。主路径不设独立 Proposal→Verify。','SAEF 与想法二保留独立证据；ROMSL 是关联预训练探索，不作为本图必需推理模块。'],['I006','S089'])
f.node('input',45,320,180,100,'连续雷达流','RD / Point / timestamp','input');f.node('enc',280,320,205,100,'Causal Radar|Encoder','时序特征 h_t','encode')
f.node('state',550,200,230,100,'Event Content State','持续更新事件内容','state');f.node('est',550,440,230,100,'Semantic Evidence','语义变化 + 可靠性','control');f.node('lif',840,440,235,100,'LIF Event Controller','泄漏 · 阈值 · 不应期','control');f.node('buffer',840,200,235,100,'短时特征缓存','保留待回溯证据','memory');f.node('refine',1135,320,255,110,'回溯边界定位','发火 ≠ 边界|定稿旧状态 / 重建新状态','state')
f.node('token',1135,620,255,100,'Global-Detail Tokenizer','全局语义 + 局部运动细节','state');f.node('mem',840,620,235,100,'分层事件记忆','L0 / L1 / L2','memory');f.node('llm',550,620,230,100,'语言对齐 + LLM','描述 / 查询','llm');f.node('out',280,620,205,100,'有序行为描述','已确认事件与历史','output')
for p in [[(225,370),(280,370)],[(485,370),(515,370),(515,250),(550,250)],[(485,370),(515,370),(515,490),(550,490)],[(780,490),(840,490)],[(485,370),(815,370),(815,250),(840,250)],[(780,250),(805,250),(805,340),(1135,340)],[(1075,250),(1105,250),(1105,390),(1135,390)],[(1262,430),(1262,620)],[(1135,670),(1075,670)],[(840,670),(780,670)],[(550,670),(485,670)]]:f.edge(p)
f.edge([(780,275),(800,275),(800,405),(665,405),(665,440)],'control','语义参照',(720,395))
f.edge([(1075,490),(1262,490),(1262,430)],'control','Fire 后形成事件',(1248,481))
f.edge([(1262,320),(1262,165),(665,165),(665,200)],'control','Continue 更新 / Fire 后重建活动状态',(1015,155))
figs.append(f.save())

(ROOT/'app/architecture-data.json').write_text(json.dumps(figs,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'README.txt').write_text('六个想法整体架构图 / 2026-11-07\n矢量图依据原始方案整理；图示不等于全部模块已经实现或验收。\n实线：数据与表示；金色虚线：状态/控制；紫色虚线：训练辅助。\n\n'+'\n'.join(f"想法{x['number']}：{x['title']}\n来源：{', '.join(x['sources'])}\n状态：{x['status']}\n" for x in figs),encoding='utf-8')
with zipfile.ZipFile(OUT/'six-architectures.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(OUT.glob('*.svg')):z.write(p,p.name)
    z.write(OUT/'README.txt','README.txt')
print(json.dumps({'figures':len(figs),'nodes':[x['nodes'] for x in figs],'svg_xml':'valid'},ensure_ascii=False))
