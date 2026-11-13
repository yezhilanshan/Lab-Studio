# 毫米波研究工作台 · 本地源码

当前目录基于线上工作台第 10 版，并包含后续本地更新（2026-11-08）。
源码提交：`7b6dd593ec8e100d536ea613400b07d7fc07f3ae`

包含六个主界面、六个研究想法的架构图、可编辑实验思维导图、161 篇本地论文与 24 份阅读资料、上传与通用 API 总结功能。

## 本地运行

需要 Node.js >= 22.13.0。在本目录执行 `npm ci` 安装锁定依赖，之后运行 `npm run build`、`npm start -- --port 4187`。

快捷启动与停止：双击 `start-workbench.cmd` 启动开发服务器（http://127.0.0.1:5173），双击 `stop-workbench.cmd` 停止。需要生产版本时运行 `.\start-workbench.ps1 -Prod`（构建后启动于 4187）；`.\stop-workbench.ps1 -Port 4187` 可只停止生产服务器。进程记录在 `.sites-runtime/`，日志在 `%LOCALAPPDATA%\lab-studio-workbench\`（避免开发服务器监视日志文件导致反复重载）。

首次创建本地数据库时，构建后执行（现有数据库不要重复初始化）：

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_majestic_thor_girl.sql
```

现有 `.wrangler` 数据与本地环境文件已保留。网站后来保存的记录和上传原文件分别在云端 D1/R2，源码不包含云端运行数据。源码含预置卡片、架构 SVG 和提取的论文正文。需要迁移网站新增记录时，使用网站“导出全部记录”和本地“导入备份”。

## SEER 完整结果分析（2026-11-09）

“研究推进 → 历史证据”默认展示 `docs` 的完整实验文档，支持全文阅读、表格/公式/图片渲染与 Obsidian 导出。原始文档更新后运行：

```powershell
npm run sync:seer-docs
```

该命令会重写 `app/seer-docs.json`、`public/evidence/seer-docs/`（Markdown 与图片）和可下载的 `manifest.json`。

## 校验

```powershell
npx tsc --noEmit
node scripts/check-mindmap.cjs
node scripts/check-studio.cjs
node scripts/check-catalog.cjs
```

`SOURCE_VERSION.txt` 记录对应提交，`SYNC_REPORT.json` 记录文件校验与同步前备份位置。`mmwave-research-workbench-source.zip` 是此版本的干净源码包，不含依赖、构建缓存或本地数据库。

## 简洁思维导图（2026-11-08）

访问 `http://127.0.0.1:5173/#mindmaps` 新建独立主题。研究推进的实验进度树使用相同编辑器。顶部保留六项导图工具，格式面板默认隐藏。左键框选，右键点击主题打开菜单，右键拖动空白处平移。支持 52 项快捷操作。使用说明见 `docs/mindmap-editor.md` 与 `docs/mindmap-shortcuts.md`。
