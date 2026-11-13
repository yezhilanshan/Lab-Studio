import treeSeed from './tree-seed.json';
import literatureSeed from './literature-seed.json';
import localRecords from './local-records.json';
export type RecordItem = {id:string;kind:string;title:string;[key:string]:string|boolean};
export const categories=['连续雷达流','姿态引导编码','事件边界检测','Global-Detail 事件表示','L0/L1/L2 分层记忆','流式 LLM 更新','自然语言时序描述'];
const lib='https://chatgpt.com/library?account_id=personal&file_id=';
export const protocol=lib+'libfile_d6b9325c42f081918fe0b40ea51fe01a';
export const resultsSource=lib+'libfile_dc8b7ee6e48081918b0db2c0ff70ad6e';
const historicalSeed:RecordItem[]=[
...treeSeed as unknown as RecordItem[],
...literatureSeed as unknown as RecordItem[],
...localRecords as unknown as RecordItem[],
{id:'p-mmfi',kind:'paper',theme:'数据与标定',year:'2023',title:'MM-Fi · 多模态人体感知数据集',type:'数据集',category:'姿态引导编码',status:'待读',evidence:'已验证',date:'2026-11-07',url:'https://github.com/ybhbingo/MMFi_dataset',notes:'官方工具箱入口已核对。用于姿态监督与数据接口审计；此状态仅确认资源存在，不代表 E01 外参或跨设备时间偏移已验证。'},
{id:'p-harrad',kind:'paper',theme:'数据与标定',year:'',title:'HARrad · 连续活动基线数据',type:'数据集',category:'连续雷达流',status:'使用中',evidence:'已验证',date:'2026-11-07',url:'https://www.imec-int.com/en/79GHz-and-140GHz-radar-solutions/harrad',notes:'当前实验基准；受试者划分与评价协议按每次实验独立锁定。官方入口已核对。'},
{id:'p-parrad',kind:'paper',theme:'数据与标定',year:'',title:'PARrad · 患者连续活动数据',type:'数据集',category:'连续雷达流',status:'待读',evidence:'已验证',date:'2026-11-07',url:'https://sumo.ilabt.imec.be/parrad',notes:'官方患者活动数据入口已核对；可用于连续事件迁移，具体标注与模态接口待审计。'},
{id:'p-mstcn',kind:'paper',theme:'自适应事件形成',year:'2019',title:'MS-TCN · 多阶段时序分割',type:'论文',category:'事件边界检测',status:'待复现',evidence:'已验证',date:'2026-11-07',url:'https://github.com/yabufarha/ms-tcn',notes:'CVPR 2019 作者代码已核对。作为离线时序分割参考；迁移时必须改为因果路径并审计未来信息泄漏。'},
{id:'p-asformer',kind:'paper',theme:'自适应事件形成',year:'2021',title:'ASFormer · Transformer 时序分割',type:'GitHub',category:'事件边界检测',status:'待读',evidence:'已验证',date:'2026-11-07',url:'https://github.com/ChinaYi/ASFormer',notes:'BMVC 2021 官方代码入口已核对。关注局部时序建模；其离线实现不能直接等同流式基线。'},
{id:'p-v26',kind:'paper',theme:'自适应事件形成',year:'2026',title:'PSEM v2.6 · 预测驱动事件状态',type:'内部方案',category:'流式 LLM 更新',status:'使用中',evidence:'待确认',date:'2026-11-05',url:protocol,notes:'研究设计稿，新增机制尚未完成实验验证。20 fps、每 0.2 s 语义更新；Keep / Reset / Defer；完整 LLM 仅在 commit 或查询时运行。'},
{id:'s-net',kind:'scheme',title:'传统网络',status:'基线',stages:'输入审计 → 姿态预训练（可选）→ 因果时序编码 → 边界/分类联合训练 → 跨人评估',input:'RD / Point / timestamp；姿态与边界只在训练提供',output:'逐帧类别、事件区间、置信度；描述需模板或另接语言模块',cost:'相对较低；CNN / PointNet + TCN / GRU。需实测参数量、FLOPs、每秒耗时与峰值显存。',pros:'因果性清晰、训练稳定、成本易控、适合可复现基线',cons:'固定类别依赖较强；开放语义与长时描述能力有限',scene:'小数据、边缘部署、边界与延迟的公平对照',notes:'比较建议；成本为定性预估，不是硬件实测。'},
{id:'s-llm',kind:'scheme',title:'LLM · PSEM v2.6',status:'主线待验证',stages:'S0 链路/基线审计 → S1 事件预测预训练 → S2 监督 Reset 初始化 → S3 闭环事件形成 → S4 语言对齐 → S5 分层记忆',input:'因果 Radar Tokens + 可重置 Event State + 历史事件；无测试姿态/GT 框',output:'事件起止、Global-Detail Tokens、检索键、置信度、事件描述与长时问答',cost:'相对中高；前 4 层轻量流式路径 + 按需完整 LLM。报告 update/commit/query 三种延迟与 Token 预算。',pros:'事件表示与语义统一；可组合 L0/L1/L2 记忆；支持描述与查询',cons:'预测分段未必等于语义分段；Reset 退化、训练闭环与语义对齐风险',scene:'连续事件理解、开放语义描述、长时上下文检索',url:protocol,notes:'v2.6 的 0.2 s 更新契约与旧版 0.4 s 记录分开；新增机制待验证。'},
{id:'s-agent',kind:'scheme',title:'Agent · 研究编排层',status:'备选',stages:'先完成因果感知基线 → 定义检索/记忆/评价工具 → 建立轨迹与权限 → 任务级评估；可选策略微调',input:'已发布事件、结构化记忆、用户问题与受控工具；不直接逐帧调用 agent',output:'可追溯的事件检索、跨事件推理、报告草稿与工具操作日志',cost:'可变且偏高；工具轮次、上下文长度、模型调用共同决定。需报告每任务调用数与端到端延迟。',pros:'适合资料整合与多步查询；模块化，可审计工具轨迹',cons:'不能替代雷达表征训练；工具误用、幻觉与额外延迟',scene:'commit 后或用户提问时的研究辅助和长时问答',notes:'实现建议，尚无本项目实验结果；agent 仅在允许完整 LLM 的触发点运行。'},
...[
['e-idea3','监督起止头 + EventFormer','30.92','67.73','11.64','0.333','41.55'],
['e-b2','SAEF B2 · 原生','25.19','76.42','19.29','0.400','52.15'],
['e-b3a','SAEF B3-A · 原生','29.02','74.96','19.78','0.333','52.15'],
['e-b3b','SAEF B3-B · 原生','22.82','70.71','30.60','0.333','52.15']
].map(([id,title,eventF1,boundaryF1,fp,latency,macro])=>({id,kind:'experiment',title,dataset:'HARrad',split:'训练 subjects 1–6；subject7 开发集；subjects8–9 跨人复核（此前已评估）',status:'已完成',date:'2026-11-05',seed:'42',eventF1,boundaryF1,fp,latency,macro,f1_1:'',f1_3:'',f1_5:'',overseg:'',protocol:'保守事件 F1：类别正确 + 完整区间 IoU≥0.5，一对一；事件分数为 s8–9 等权平均。边界 ±0.5 s，合并计数；Latency 为确认延迟 P90。F1@1/3/5 尚未报告，禁止混用。',ablation:'原生系统比较；共用旧 RD seed42 前端。原生频率与操作点不同，尚非相同频率/相同误报预算机制对照。',url:resultsSource,notes:'单 seed、两个跨人复核受试者；完整预测驱动 Reset 尚待训练。此处已完成表示报告已记录，不代表重跑验证。'})),
{id:'e-reset',kind:'experiment',title:'PSEM Reset · 匹配预算机制消融（暂缓）',dataset:'HARrad',split:'待预注册新的独立评估划分；不把已评估 s8–9 称为未见测试集',status:'暂停',date:'2026-11-07',seed:'42 / 43 / 44（计划）',protocol:'固定前端、update 频率、事件 FP/min 预算；分别报告 F1@1/3/5 的容差单位与匹配定义。',ablation:'always keep / always reset / 固定时长 / GT head / prediction+count / prediction+count+semantic',notes:'Stage1 No-Go 保持，实验二未改变准入；自主 Reset Policy 消融暂缓。先跨受试者复核、控制年龄与历史长度，再考虑匹配预算的策略验收。'},
{id:'c-e01',kind:'sync',title:'MM-Fi E01 · radar-to-world 外参',status:'待确认',category:'空间标定',date:'2026-11-07',transform:'待填：R(3×3)、t(3×1)、长度单位；约定 p_world = R · p_radar + t',evidence:'当前未取得经过核验的 E01 专属数值外参；不能从其他环境复制，也不能以单位阵作为真实标定。',next:'定位官方 calibration 文件/作者回复；核实坐标轴、左右手系、变换方向。使用独立同步点/骨架检查残差。',url:'https://github.com/ybhbingo/MMFi_dataset/issues',notes:'验收记录：文件路径、版本/哈希、环境 E01、单位、矩阵方向、验证点数与误差。'},
{id:'c-time',kind:'sync',title:'MM-Fi · 时间戳与帧配对契约',status:'待确认',category:'时间同步',date:'2026-11-07',transform:'t_ref = a · t_radar + b；a 为漂移比例，b 为偏移',evidence:'帧序号相同不足以证明绝对同步。尚需确认 timestamp 单位、时钟来源、掉帧与重采样策略。',next:'检查真实样本时间戳和官方数据说明；记录各模态 t_start、dt、丢帧、配对误差。',url:'https://github.com/ybhbingo/MMFi_dataset',notes:'区分绝对时间与相对时间；不要把外参校准等同时间同步。'},
{id:'c-infer',kind:'sync',title:'无硬件同步 · 动作锚点对齐',status:'合理推断',category:'跨设备对齐',date:'2026-11-07',transform:'同步动作峰值 → 互相关粗偏移 → 多锚点拟合 a,b',evidence:'雷达能量/速度与骨架运动能量可能支持相对对齐，这是拟议方法，尚无本项目验证结果。',next:'在开头/中间/结尾记录明显动作；估计偏移与漂移，报告残差分布。',notes:'优先无专用同步硬件；目标是可量化的相对对齐，不能据此宣称共享绝对时钟。'},
{id:'c-verified',kind:'sync',title:'空间与时间核验 · 独立证据链',status:'已验证',category:'信息来源',date:'2026-11-07',evidence:'已核对 MM-Fi 官方工具箱和 Issues 入口。已验证的仅是资源来源；本条不证明任何数值外参或时间精度。',next:'补齐证据后，分别升级空间外参与时间对齐条目的状态。',url:'https://github.com/ybhbingo/MMFi_dataset',notes:'状态必须限定到具体主张，避免“资源存在”被误读为“参数正确”。'},
{id:'w-first',kind:'weekly',title:'W45 · 研究起始归档',date:'2026-11-07',status:'已归档',period:'2026-11-02 — 2026-11-08',findings:'11/05 HARrad 原生系统对照：监督起止头+EventFormer 跨人复核事件 F1 为 30.92%；SAEF B3-A 为 29.02%。二者边界召回和误报存在取舍。',changes:'v2.6 主线：预测驱动 Keep / Reset / Defer；旧 Proposal→Verify 路径保留作匹配基线。',risks:'单 seed；s8–9 已被评估；原生频率/操作点不同；未验证完整预测驱动 Reset。MM-Fi E01 数值外参与同步仍待确认。',next:'优先核实 E01 标定 → 锁定匹配预算 → 预测价值 probe → 三 seed Reset 消融。',url:resultsSource,notes:'根据现有方案与 11/05 结果整理的起始归档；并非自动抓取的完整周报。现有定时周报不会自动写入本站，可通过新增或导入归档。'},
...[
['m-pred','事件状态是否提升预测价值','流式 LLM 更新','P0','event-free 与 event-conditioned；相同 frozen target、horizon 与预算；NLL/MSE + 旧语义接口退化检查。'],
['m-pose','Pose-guided Encoder · 跨人收益','姿态引导编码','P1','有/无姿态预训练；推理移除 Pose Head；冻结前端与相同数据划分。'],
['m-detail','Summary + Motion Tokens · 细节保留','Global-Detail 事件表示','P1','固定总 Token 数；单摘要 vs 全局+细节；比较细节覆盖、顺序准确率与描述物理一致性。'],
['m-memory','L0 / L1 / L2 · 固定预算消融','L0/L1/L2 分层记忆','P1','同总 Token Budget；无记忆 / 平铺 / 分层；比较事件覆盖、顺序、细节和 QA。'],
['m-caption','事件级描述 · 物理证据一致性','自然语言时序描述','P1','按预测事件匹配 GT 后评估；未匹配事件不强贴 caption。检查重复动作覆盖与幻觉。'],
['m-bound','慢过渡与重复同类 · Reset 稳定性','事件边界检测','P0','分层统计 repeated same-class、slow transition、long steady、短噪声；匹配 FP/min 与延迟预算。']
].map(([id,title,category,priority,notes])=>({id,kind:'method',title,category,priority,status:'待验证',notes,url:protocol}))
];

export const seed:RecordItem[]=historicalSeed.map(r=>r.kind==='paper'?{...r,catalogScope:'history'}:r);
